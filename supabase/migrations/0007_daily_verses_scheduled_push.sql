-- ================================================================
-- 데일리 말씀(daily verse) + 예약 푸시 발송
--
-- 기존 Flutter 앱은 assets/daily_messages.json 200건을 앱에 내장해 두고
-- "알림이 왔다"는 메시지만 푸시로 보낸 뒤, 앱이 날짜로 인덱스를 계산해
-- 화면에 띄우는 방식이었다. 여기서는 말씀 자체를 DB로 옮기고, 예약된
-- 시각에 Edge Function(run-scheduled-push)이 말씀 본문을 담아 푸시한다.
-- 날짜→말씀 매핑 규칙은 앱과 동일하게 유지: 2025-01-01 기준 경과일 % 전체건수.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. daily_verses — 말씀/명언 원본 (앱의 daily_messages.json 이관)
-- ----------------------------------------------------------------
create table if not exists public.daily_verses (
  id uuid primary key default gen_random_uuid(),
  order_no integer not null unique,
  type text not null default 'bible' check (type in ('bible', 'quote')),
  text_kr text not null,
  text_en text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.daily_verses enable row level security;

-- 오늘의 말씀 페이지는 비로그인 사용자도 볼 수 있어야 한다.
create policy "daily_verses_public_read" on public.daily_verses
  for select using (is_active);
create policy "daily_verses_admin_all" on public.daily_verses
  for all using (public.is_admin()) with check (public.is_admin());

-- 날짜 → 그날의 말씀. 웹 페이지(RPC)와 Edge Function이 같은 규칙을 쓰도록
-- 계산은 DB 한 곳에만 둔다. 음수 나머지(2025-01-01 이전 날짜) 보정 포함.
create or replace function public.daily_verse_for(d date default current_date)
returns table (id uuid, order_no integer, type text, text_kr text, text_en text)
language sql
stable
security definer
set search_path = public
as $$
  with active as (
    select
      dv.id, dv.order_no, dv.type, dv.text_kr, dv.text_en,
      row_number() over (order by dv.order_no) - 1 as idx,
      count(*) over () as total
    from public.daily_verses dv
    where dv.is_active
  )
  select a.id, a.order_no, a.type, a.text_kr, a.text_en
  from active a
  where a.idx = (((d - date '2025-01-01') % a.total) + a.total) % a.total;
$$;

grant execute on function public.daily_verse_for(date) to anon, authenticated;

-- ----------------------------------------------------------------
-- 2. scheduled_pushes — 주기적 예약 발송 정의
--    kind='daily_verse' → 본문을 그날의 말씀으로 자동 생성
--    kind='text'        → body 컬럼을 그대로 발송 (고정 문구 반복 알림)
-- ----------------------------------------------------------------
create table if not exists public.scheduled_pushes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'daily_verse' check (kind in ('daily_verse', 'text')),
  title text not null,
  body text,
  url text not null default '/daily-verse',
  enabled boolean not null default true,
  send_time time not null default '07:00',
  timezone text not null default 'Australia/Sydney',
  -- 0=일 ~ 6=토. null 또는 빈 배열이면 매일.
  days_of_week smallint[],
  last_sent_on date,
  last_run_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_pushes_text_needs_body check (kind <> 'text' or body is not null)
);

alter table public.scheduled_pushes enable row level security;

create policy "scheduled_pushes_admin_only" on public.scheduled_pushes
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scheduled_pushes_touch on public.scheduled_pushes;
create trigger scheduled_pushes_touch
  before update on public.scheduled_pushes
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------
-- 3. push_logs — 수동 발송과 예약 발송을 구분할 수 있게 확장
-- ----------------------------------------------------------------
alter table public.push_logs
  add column if not exists source text not null default 'manual',
  add column if not exists schedule_id uuid references public.scheduled_pushes(id) on delete set null;

-- ----------------------------------------------------------------
-- 4. 기본 스케줄 1건 (시드니 시간 매일 07:00 데일리 말씀)
-- ----------------------------------------------------------------
insert into public.scheduled_pushes (name, kind, title, send_time, timezone)
select '데일리 말씀', 'daily_verse', '오늘의 말씀', '07:00', 'Australia/Sydney'
where not exists (select 1 from public.scheduled_pushes where kind = 'daily_verse');

-- ----------------------------------------------------------------
-- 5. 말씀 200건 시드 (my_app1/assets/daily_messages.json 그대로 이관)
-- ----------------------------------------------------------------
insert into public.daily_verses (order_no, type, text_kr, text_en) values
  (1, 'bible', '태초에 하나님이 천지를 창조하시니라 (창세기 1:1)', 'In the beginning God created the heavens and the earth. (Genesis 1:1)'),
  (2, 'bible', '여호와는 나의 목자시니 내게 부족함이 없으리로다. (시편 23:1)', 'The Lord is my shepherd; I shall not want. (Psalm 23:1)'),
  (3, 'bible', '하나님은 사랑이시라. (요한일서 4:8)', 'God is love. (1 John 4:8)'),
  (4, 'bible', '너희는 세상의 빛이라. (마태복음 5:14)', 'You are the light of the world. (Matthew 5:14)'),
  (5, 'bible', '내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라. (빌립보서 4:13)', 'I can do all things through Christ who strengthens me. (Philippians 4:13)'),
  (6, 'bible', '주는 나의 반석이요 나의 구원이시니 내가 요동치 아니하리로다. (시편 62:6)', 'He only is my rock and my salvation; I shall not be moved. (Psalm 62:6)'),
  (7, 'bible', '너희는 강하고 담대하라. (여호수아 1:9)', 'Be strong and courageous. (Joshua 1:9)'),
  (8, 'bible', '여호와를 의지하는 자는 시온 산이 요동하지 아니하고 영원히 있음 같도다. (시편 125:1)', 'Those who trust in the Lord are like Mount Zion, which cannot be shaken but endures forever. (Psalm 125:1)'),
  (9, 'bible', '수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라. (마태복음 11:28)', 'Come to me, all you who are weary and burdened, and I will give you rest. (Matthew 11:28)'),
  (10, 'bible', '두려워하지 말라 내가 너와 함께 함이라. (이사야 41:10)', 'Do not fear, for I am with you. (Isaiah 41:10)'),
  (11, 'bible', '의인은 믿음으로 말미암아 살리라. (로마서 1:17)', 'The righteous will live by faith. (Romans 1:17)'),
  (12, 'bible', '평강의 하나님이 속히 사탄을 너희 발 아래에서 상하게 하시리라. (로마서 16:20)', 'The God of peace will soon crush Satan under your feet. (Romans 16:20)'),
  (13, 'bible', '주의 이름을 아는 자는 주를 의지하오리니 여호와여 주를 찾는 자들을 버리지 아니하심이니이다. (시편 9:10)', 'Those who know your name trust in you, for you, Lord, have never forsaken those who seek you. (Psalm 9:10)'),
  (14, 'bible', '믿음이 없이는 하나님을 기쁘시게 하지 못하나니. (히브리서 11:6)', 'Without faith it is impossible to please God. (Hebrews 11:6)'),
  (15, 'bible', '주께서 내 오른쪽에 계시니 내가 흔들리지 아니하리로다. (시편 16:8)', 'I have set the Lord always before me; because he is at my right hand, I will not be shaken. (Psalm 16:8)'),
  (16, 'bible', '그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데 그 중의 제일은 사랑이라. (고린도전서 13:13)', 'And now these three remain: faith, hope and love. But the greatest of these is love. (1 Corinthians 13:13)'),
  (17, 'bible', '나는 포도나무요 너희는 가지라. (요한복음 15:5)', 'I am the vine; you are the branches. (John 15:5)'),
  (18, 'bible', '여호와는 나의 힘과 나의 노래시며 나의 구원이시로다. (출애굽기 15:2)', 'The Lord is my strength and my song; he has become my salvation. (Exodus 15:2)'),
  (19, 'bible', '너희 염려를 다 주께 맡기라 이는 그가 너희를 돌보심이라. (베드로전서 5:7)', 'Cast all your anxiety on him because he cares for you. (1 Peter 5:7)'),
  (20, 'bible', '하나님이 우리를 위하시면 누가 우리를 대적하리요. (로마서 8:31)', 'If God is for us, who can be against us? (Romans 8:31)'),
  (21, 'bible', '내가 산을 향하여 눈을 들리라 나의 도움이 어디서 올까. (시편 121:1)', 'I lift up my eyes to the mountains—where does my help come from? (Psalm 121:1)'),
  (22, 'bible', '너희는 먼저 그의 나라와 그의 의를 구하라. (마태복음 6:33)', 'But seek first his kingdom and his righteousness. (Matthew 6:33)'),
  (23, 'bible', '주의 말씀은 내 발에 등이요 내 길에 빛이니이다. (시편 119:105)', 'Your word is a lamp for my feet, a light on my path. (Psalm 119:105)'),
  (24, 'bible', '하나님의 말씀은 살아 있고 활력이 있어. (히브리서 4:12)', 'For the word of God is alive and active. (Hebrews 4:12)'),
  (25, 'bible', '주께서 너를 지키사 네 오른쪽에서 그늘이 되시리니. (시편 121:5)', 'The Lord watches over you—the Lord is your shade at your right hand. (Psalm 121:5)'),
  (26, 'bible', '사랑 안에 두려움이 없고 온전한 사랑이 두려움을 내쫓나니. (요한일서 4:18)', 'There is no fear in love. But perfect love drives out fear. (1 John 4:18)'),
  (27, 'bible', '평안을 너희에게 끼치노니 곧 나의 평안을 너희에게 주노라. (요한복음 14:27)', 'Peace I leave with you; my peace I give you. (John 14:27)'),
  (28, 'bible', '모든 것을 할 수 있느니라 믿는 자에게는. (마가복음 9:23)', 'Everything is possible for one who believes. (Mark 9:23)'),
  (29, 'bible', '예수께서 이르시되 내가 곧 길이요 진리요 생명이니. (요한복음 14:6)', 'Jesus answered, ''I am the way and the truth and the life.'' (John 14:6)'),
  (30, 'bible', '너희를 향한 나의 생각은 내가 아나니 평안이요 재앙이 아니니라 너희에게 미래와 희망을 주는 것이니라. (예레미야 29:11)', '"For I know the plans I have for you," declares the Lord, "plans to prosper you and not to harm you, plans to give you hope and a future." (Jeremiah 29:11)'),
  (31, 'bible', '이 모든 일에 우리를 사랑하시는 이로 말미암아 우리가 넉넉히 이기느니라. (로마서 8:37)', 'In all these things we are more than conquerors through him who loved us. (Romans 8:37)'),
  (32, 'bible', '진실로 진실로 너희에게 이르노니 너희가 무엇을 구하든지 기도하면 믿으라. (마가복음 11:24)', 'Whatever you ask for in prayer, believe that you have received it. (Mark 11:24)'),
  (33, 'bible', '그러므로 믿음은 들음에서 나며 들음은 그리스도의 말씀으로 말미암았느니라. (로마서 10:17)', 'Faith comes from hearing the message, and the message is heard through the word about Christ. (Romans 10:17)'),
  (34, 'bible', '주의 손이 짧아 구원하지 못하심도 아니요. (이사야 59:1)', 'Surely the arm of the Lord is not too short to save. (Isaiah 59:1)'),
  (35, 'bible', '내가 세상 끝날까지 너희와 항상 함께 있으리라. (마태복음 28:20)', 'I am with you always, to the very end of the age. (Matthew 28:20)'),
  (36, 'bible', '내 영혼아 여호와를 송축하라 그가 베푸신 모든 은택을 잊지 말지어다. (시편 103:2)', 'Praise the Lord, my soul, and forget not all his benefits. (Psalm 103:2)'),
  (37, 'bible', '여호와의 이름은 견고한 망대라 의인은 그리로 달려가서 안전함을 얻느니라. (잠언 18:10)', 'The name of the Lord is a fortified tower; the righteous run to it and are safe. (Proverbs 18:10)'),
  (38, 'bible', '주께서 내게 생명의 길을 보이시리니. (시편 16:11)', 'You make known to me the path of life. (Psalm 16:11)'),
  (39, 'bible', '너는 마음을 다하여 여호와를 신뢰하고 네 명철을 의지하지 말라. (잠언 3:5)', 'Trust in the Lord with all your heart and lean not on your own understanding. (Proverbs 3:5)'),
  (40, 'bible', '그가 너를 구덩이에서 건지시고 인자와 긍휼로 관을 씌우시며. (시편 103:4)', 'He redeems your life from the pit and crowns you with love and compassion. (Psalm 103:4)'),
  (41, 'bible', '여호와께 감사하라 그는 선하시며 그의 인자하심이 영원함이로다. (시편 118:1)', 'Give thanks to the Lord, for he is good; his love endures forever. (Psalm 118:1)'),
  (42, 'bible', '주께서 내 앞에 상을 차려 주시고. (시편 23:5)', 'You prepare a table before me in the presence of my enemies. (Psalm 23:5)'),
  (43, 'bible', '이는 그리스도 예수 안에서 선한 일을 위하여 지으심을 받은 자니. (에베소서 2:10)', 'For we are God''s handiwork, created in Christ Jesus to do good works. (Ephesians 2:10)'),
  (44, 'bible', '주의 얼굴을 구하리이다. (시편 27:8)', 'My heart says of you, ''Seek his face!'' Your face, Lord, I will seek. (Psalm 27:8)'),
  (45, 'bible', '기쁨은 여호와로 말미암은 것이니 여호와를 기뻐하는 것이 너희의 힘이니라. (느헤미야 8:10)', 'The joy of the Lord is your strength. (Nehemiah 8:10)'),
  (46, 'bible', '너는 내게 부르짖으라 내가 네게 응답하겠고. (예레미야 33:3)', 'Call to me and I will answer you. (Jeremiah 33:3)'),
  (47, 'bible', '사람이 마음으로 자기의 길을 계획할지라도 그의 걸음을 인도하시는 이는 여호와시니라. (잠언 16:9)', 'In their hearts humans plan their course, but the Lord establishes their steps. (Proverbs 16:9)'),
  (48, 'bible', '모든 것이 합력하여 선을 이루느니라. (로마서 8:28)', 'In all things God works for the good of those who love him. (Romans 8:28)'),
  (49, 'bible', '의와 인자를 따라 구하는 자는 생명과 공의와 영광을 얻느니라. (잠언 21:21)', 'Whoever pursues righteousness and love finds life, prosperity and honor. (Proverbs 21:21)'),
  (50, 'bible', '주의 은혜가 내게 족하도다. (고린도후서 12:9)', 'My grace is sufficient for you. (2 Corinthians 12:9)'),
  (51, 'quote', '믿음은 보이지 않는 것을 믿는 것이다. — 어거스틴', 'Faith is to believe what you do not see. — Augustine'),
  (52, 'quote', '하나님께 불가능은 없다. — 마틴 루터', 'Nothing is impossible with God. — Martin Luther'),
  (53, 'quote', '나를 무엇에 쓰시든지, 누구와 함께 두시든지 주님의 뜻대로 하옵소서. — 존 웨슬리, 「언약기도」', 'Put me to what you will, rank me with whom you will. — John Wesley, Covenant Prayer'),
  (54, 'quote', '하나님은 너무 지혜로우셔서 실수하지 않으시고, 너무 선하셔서 악을 행하지 않으신다. — 찰스 스펄전', 'God is too wise to be mistaken, God is too good to be unkind. — Charles Spurgeon'),
  (55, 'quote', '우리의 가장 큰 두려움은 실패가 아니라, 정작 중요하지 않은 일에서 성공하는 것이어야 한다. — 디트리히 본회퍼', 'Our greatest fear should not be of failure, but of succeeding at things in life that don''t really matter. — Dietrich Bonhoeffer'),
  (56, 'quote', '하나님의 뜻은 언제나 최선이다. — 토마스 아퀴나스', 'God''s will is always the best. — Thomas Aquinas'),
  (57, 'quote', '신앙은 이성의 끝에서 시작된다. — 키에르케고르', 'Faith begins where reason ends. — Søren Kierkegaard'),
  (58, 'quote', '하나님은 우리의 과거보다 우리의 미래에 더 관심이 있으시다. — 릭 워렌', 'God is more interested in your future than your past. — Rick Warren'),
  (59, 'quote', '기도할 수 없다면, 더 많이 기도하라. — 마틴 루터', 'When you cannot pray as you would, pray as you can. — Martin Luther'),
  (60, 'quote', '하나님의 사랑은 우리의 이해를 초월한다. — C.S. 루이스', 'God''s love is beyond our understanding. — C.S. Lewis'),
  (61, 'bible', '너희가 내 안에 거하고 내 말이 너희 안에 거하면 무엇이든지 원하는 대로 구하라. (요한복음 15:7)', 'If you remain in me and my words remain in you, ask whatever you wish. (John 15:7)'),
  (62, 'bible', '새 힘을 얻으리니 독수리가 날개치며 올라감 같을 것이요. (이사야 40:31)', 'They will soar on wings like eagles. (Isaiah 40:31)'),
  (63, 'bible', '주는 나의 등불이시니 주께서 나의 흑암을 밝히시리이다. (사무엘하 22:29)', 'You, Lord, are my lamp; the Lord turns my darkness into light. (2 Samuel 22:29)'),
  (64, 'bible', '네 의를 빛 같이 나타내시며 네 공의를 정오의 빛 같이 하시리로다. (시편 37:6)', 'He will make your righteous reward shine like the dawn, your vindication like the noonday sun. (Psalm 37:6)'),
  (65, 'bible', '내 입에서 나가는 말도 헛되이 내게로 되돌아오지 아니하고 나의 기뻐하는 뜻을 이루리라. (이사야 55:11)', 'So is my word that goes out from my mouth: It will not return to me empty, but will accomplish what I desire. (Isaiah 55:11)'),
  (66, 'bible', '우리가 그를 사랑함은 그가 먼저 우리를 사랑하셨음이라. (요한일서 4:19)', 'We love because he first loved us. (1 John 4:19)'),
  (67, 'bible', '그 날에 너희가 알리라 내가 내 아버지 안에 있고. (요한복음 14:20)', 'On that day you will realize that I am in my Father, and you are in me, and I am in you. (John 14:20)'),
  (68, 'bible', '내가 평안 중에 눕고 자기도 하리니 나를 안전히 살게 하시는 이는 오직 여호와이시니이다. (시편 4:8)', 'In peace I will lie down and sleep, for you alone, Lord, make me dwell in safety. (Psalm 4:8)'),
  (69, 'bible', '그의 은혜로 말미암아 의롭다 하심을 얻어. (로마서 3:24)', 'Being justified freely by his grace. (Romans 3:24)'),
  (70, 'bible', '여호와께서 네게 복을 주시고 너를 지키시기를 원하며. (민수기 6:24)', 'The Lord bless you and keep you. (Numbers 6:24)'),
  (71, 'quote', '하나님의 약속은 우리의 상황보다 크다. — 코리 텐 붐', 'God''s promises are greater than our circumstances. — Corrie ten Boom'),
  (72, 'quote', '믿음은 두려움과 동시에 존재할 수 없다. — 조지 뮬러', 'Faith and fear cannot coexist. — George Müller'),
  (73, 'quote', '하나님의 계획은 항상 우리의 계획보다 낫다. — 프란시스 챈', 'God''s plan is always better than our plans. — Francis Chan'),
  (74, 'quote', '기도는 영혼의 호흡이다. — 앤드류 머레이', 'Prayer is the breath of the soul. — Andrew Murray'),
  (75, 'quote', '하나님은 늦지 않으신다, 단지 서두르지 않으실 뿐이다. — 막스 루케이도', 'God is never late, but he''s never early either. — Max Lucado'),
  (76, 'quote', '우리의 연약함 속에서 하나님의 능력이 완전해진다. — 팀 켈러', 'In our weakness, God''s power is made perfect. — Tim Keller'),
  (77, 'quote', '하나님께 드리는 예배는 삶의 방식이다. — 존 파이퍼', 'Worship is a way of life. — John Piper'),
  (78, 'quote', '신앙은 모든 것을 가능하게 한다. — 토저', 'Faith makes all things possible. — A.W. Tozer'),
  (79, 'quote', '만 입이 내게 있으면 그 입 다 가지고 내 구주 주신 은총을 늘 찬송하겠네. — 찰스 웨슬리, 「만 입이 내게 있으면」', 'O for a thousand tongues to sing my great Redeemer''s praise. — Charles Wesley, O for a Thousand Tongues'),
  (80, 'quote', '하나님은 우리가 생각하는 것보다 훨씬 더 큰 일을 하실 수 있다. — 조이스 마이어', 'God can do more than we can ever imagine. — Joyce Meyer'),
  (81, 'bible', '여호와는 나의 빛이요 나의 구원이시니 내가 누구를 두려워하리요. (시편 27:1)', 'The Lord is my light and my salvation—whom shall I fear? (Psalm 27:1)'),
  (82, 'bible', '그러므로 우리가 믿음으로 의롭다 하심을 받았으니 우리 주 예수 그리스도로 말미암아 하나님과 화평을 누리자. (로마서 5:1)', 'Since we have been justified through faith, we have peace with God through our Lord Jesus Christ. (Romans 5:1)'),
  (83, 'bible', '선을 행하되 낙심하지 말지니 포기하지 아니하면 때가 이르매 거두리라. (갈라디아서 6:9)', 'Let us not become weary in doing good, for at the proper time we will reap a harvest. (Galatians 6:9)'),
  (84, 'bible', '그리스도 예수 안에서 위를 향하신 부르심의 상을 위하여 달려가노라. (빌립보서 3:14)', 'I press on toward the goal to win the prize for which God has called me. (Philippians 3:14)'),
  (85, 'bible', '나는 주의 인자하심을 영원히 노래하리이다. (시편 89:1)', 'I will sing of the Lord''s great love forever. (Psalm 89:1)'),
  (86, 'bible', '주께서 내 발을 넓은 곳에 세우셨나이다. (시편 31:8)', 'You have set my feet in a spacious place. (Psalm 31:8)'),
  (87, 'bible', '우리가 아직 죄인 되었을 때에 그리스도께서 우리를 위하여 죽으심으로. (로마서 5:8)', 'But God demonstrates his own love for us in this: While we were still sinners, Christ died for us. (Romans 5:8)'),
  (88, 'bible', '네가 물 가운데로 지날 때에 내가 너와 함께 할 것이라 강을 건널 때에 물이 너를 침몰하지 못할 것이며. (이사야 43:2)', 'When you pass through the waters, I will be with you; and when you pass through the rivers, they will not sweep over you. (Isaiah 43:2)'),
  (89, 'bible', '구하라 그리하면 너희에게 주실 것이요 찾으라 그리하면 찾아낼 것이요 문을 두드리라 그리하면 너희에게 열릴 것이니. (마태복음 7:7)', 'Ask and it will be given to you; seek and you will find; knock and the door will be opened to you. (Matthew 7:7)'),
  (90, 'bible', '진리를 알지니 진리가 너희를 자유롭게 하리라. (요한복음 8:32)', 'Then you will know the truth, and the truth will set you free. (John 8:32)'),
  (91, 'bible', '소망 중에 즐거워하며 환난 중에 참으며 기도에 항상 힘쓰며. (로마서 12:12)', 'Be joyful in hope, patient in affliction, faithful in prayer. (Romans 12:12)'),
  (92, 'bible', '아무 것도 염려하지 말고 다만 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라. (빌립보서 4:6)', 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God. (Philippians 4:6)'),
  (93, 'quote', '그리스도께서 사람을 부르실 때에는, 와서 죽으라고 명하신다. — 디트리히 본회퍼, 『나를 따르라』', 'When Christ calls a man, he bids him come and die. — Dietrich Bonhoeffer, The Cost of Discipleship'),
  (94, 'quote', '주께서 우리를 주를 위하여 지으셨으니, 우리 마음이 주 안에서 쉬기까지는 안식이 없나이다. — 어거스틴, 『고백록』', 'You have made us for yourself, and our heart is restless until it rests in you. — Augustine, Confessions'),
  (95, 'quote', '아무것도 너를 근심하게 하지 말며 아무것도 너를 두렵게 하지 말라. 하나님만으로 충분하다. — 아빌라의 테레사', 'Let nothing disturb you, let nothing frighten you. God alone suffices. — Teresa of Ávila'),
  (96, 'quote', '사람의 제일 되는 목적은 하나님을 영화롭게 하고 영원토록 그를 즐거워하는 것이다. — 웨스트민스터 소요리문답 제1문', 'Man''s chief end is to glorify God, and to enjoy him forever. — Westminster Shorter Catechism, Q1'),
  (97, 'quote', '사람은 계획하나 이루시는 이는 하나님이시다. — 토마스 아 켐피스, 『그리스도를 본받아』', 'Man proposes, but God disposes. — Thomas à Kempis, The Imitation of Christ'),
  (98, 'bible', '주의 말씀의 맛이 내게 어찌 그리 단지요. (시편 119:103)', 'How sweet are your words to my taste. (Psalm 119:103)'),
  (99, 'bible', '주의 손에 계신 권능과 능력으로 모든 사람을 크게 하심이니이다. (역대상 29:12)', 'In your hands are strength and power. (1 Chronicles 29:12)'),
  (100, 'bible', '여호와여 주의 능력으로 왕이 기뻐하리니. (시편 21:1)', 'The king rejoices in your strength, Lord. (Psalm 21:1)'),
  (101, 'bible', '하나님이 세상을 이처럼 사랑하사. (요한복음 3:16)', 'For God so loved the world. (John 3:16)'),
  (102, 'bible', '하늘이 높음 같이 그의 인자하심도 크시도다. (시편 103:11)', 'As high as the heavens are above the earth. (Psalm 103:11)'),
  (103, 'bible', '주는 나의 반석이요 나의 요새시요 나를 건지시는 이시로다. (시편 18:2)', 'The Lord is my rock and my fortress. (Psalm 18:2)'),
  (104, 'bible', '여호와는 나의 힘과 방패시니. (시편 28:7)', 'The Lord is my strength and my shield. (Psalm 28:7)'),
  (105, 'quote', '간직할 수 없는 것을 주고 잃을 수 없는 것을 얻는 자는 결코 어리석은 자가 아니다. — 짐 엘리엇', 'He is no fool who gives what he cannot keep to gain what he cannot lose. — Jim Elliot'),
  (106, 'quote', '하나님은 당신의 약한 순간에 일하신다. — 오스왈드 챔버스', 'God works in your weakest moments. — Oswald Chambers'),
  (107, 'quote', '기도 없는 하루는 낙심으로 끝난다. — E.M. 바운즈', 'A day without prayer ends in discouragement. — E.M. Bounds'),
  (108, 'quote', '하나님은 우리의 실패보다 크시다. — 빌리 그레이엄', 'God is greater than our failures. — Billy Graham'),
  (109, 'quote', '하나님을 신뢰하라, 그는 항상 시간을 지키신다. — D.L. 무디', 'Trust God, he is always on time. — D.L. Moody'),
  (110, 'quote', '하나님의 침묵도 하나의 응답이다. — 헨리 나우웬', 'God''s silence is also an answer. — Henri Nouwen'),
  (111, 'quote', '믿음은 행동으로 증명된다. — 프란치스코 교황', 'Faith is proved by action. — Pope Francis'),
  (112, 'quote', '하나님의 은혜는 항상 충분하다. — 존 칼빈', 'God''s grace is always sufficient. — John Calvin'),
  (113, 'quote', '주님과 함께라면 두려울 것이 없다. — 마더 테레사', 'With the Lord, there is nothing to fear. — Mother Teresa'),
  (114, 'quote', '하나님은 우리의 고통을 결코 낭비하지 않으신다. — 제리 시처', 'God never wastes our pain. — Jerry Sittser'),
  (115, 'bible', '여호와께서 네 발걸음을 굳게 하시리로다. (시편 37:23)', 'The Lord makes firm the steps. (Psalm 37:23)'),
  (116, 'bible', '주의 손에 나의 시대가 있사오니. (시편 31:15)', 'My times are in your hands. (Psalm 31:15)'),
  (117, 'bible', '주의 일을 여호와께 맡기라 그리하면 네 경영하는 것이 이루어지리라. (잠언 16:3)', 'Commit to the Lord whatever you do. (Proverbs 16:3)'),
  (118, 'bible', '환난 날에 내가 너를 건지리니 네가 나를 영화롭게 하리로다. (시편 50:15)', 'Call on me in the day of trouble. (Psalm 50:15)'),
  (119, 'bible', '여호와여 나의 기도를 들으시며. (시편 39:12)', 'Hear my prayer, Lord. (Psalm 39:12)'),
  (120, 'bible', '주의 길을 여호와께 맡기라 그를 의지하면 그가 이루시리로다. (시편 37:5)', 'Commit your way to the Lord. (Psalm 37:5)'),
  (121, 'bible', '나는 시작과 끝이요 처음과 마지막이라. (요한계시록 22:13)', 'I am the Alpha and the Omega. (Revelation 22:13)'),
  (122, 'bible', '하나님은 우리의 피난처시오 힘이시니. (시편 46:1)', 'God is our refuge and strength. (Psalm 46:1)'),
  (123, 'bible', '여호와를 경외하는 것이 지혜의 근본이요. (잠언 9:10)', 'The fear of the Lord is the beginning of wisdom. (Proverbs 9:10)'),
  (124, 'bible', '주의 궁전에서 한 날이 다른 곳에서 천 날보다 나으니. (시편 84:10)', 'Better is one day in your courts. (Psalm 84:10)'),
  (125, 'bible', '나를 보내신 이가 나와 함께 하시도다. (요한복음 8:29)', 'The one who sent me is with me. (John 8:29)'),
  (126, 'bible', '내가 기뻐하여 여호와께 말하되 주는 나의 주시오니. (시편 16:2)', 'I say to the Lord, You are my Lord. (Psalm 16:2)'),
  (127, 'bible', '여호와는 마음이 상한 자를 가까이 하시고. (시편 34:18)', 'The Lord is close to the brokenhearted. (Psalm 34:18)'),
  (128, 'bible', '주의 인자하심이 생명보다 나으므로. (시편 63:3)', 'Your love is better than life. (Psalm 63:3)'),
  (129, 'bible', '내가 주께 피하였사오니 결코 실망하게 마옵소서. (시편 71:1)', 'In you, Lord, I have taken refuge. (Psalm 71:1)'),
  (130, 'bible', '주께서 내 눈물을 주의 병에 담으셨나이다. (시편 56:8)', 'You have kept count of my tears. (Psalm 56:8)'),
  (131, 'bible', '여호와께로 돌아오라 그는 긍휼이 풍성하시며. (이사야 55:7)', 'Return to the Lord, for he will have mercy. (Isaiah 55:7)'),
  (132, 'bible', '내 백성이 내 이름을 알리라. (이사야 52:6)', 'My people will know my name. (Isaiah 52:6)'),
  (133, 'bible', '범사에 감사하라 이것이 그리스도 예수 안에서 너희를 향하신 하나님의 뜻이니라. (데살로니가전서 5:18)', 'Give thanks in all circumstances. (1 Thessalonians 5:18)'),
  (134, 'bible', '주의 자비와 인자하심이 나를 평생에 따르리니. (시편 23:6)', 'Goodness and mercy will follow me. (Psalm 23:6)'),
  (135, 'quote', '하나님의 시간표는 완벽하다. — 존 맥아더', 'God''s timing is perfect. — John MacArthur'),
  (136, 'quote', '두려워하지 말라, 하나님이 함께 하신다. — 조나단 에드워즈', 'Fear not, God is with you. — Jonathan Edwards'),
  (137, 'quote', '믿음으로 걸어가라, 보이는 것으로 말미암지 말라. — 허드슨 테일러', 'Walk by faith, not by sight. — Hudson Taylor'),
  (138, 'quote', '하나님의 사랑 안에서 모든 두려움은 사라진다. — 아우구스티누스', 'In God''s love, all fear disappears. — Augustine'),
  (139, 'quote', '주님은 결코 우리를 버리지 않으신다. — 존 번연', 'The Lord never forsakes us. — John Bunyan'),
  (140, 'quote', '하나님은 모든 상처를 치유하신다. — 마이클 W. 스미스', 'God heals all wounds. — Michael W. Smith'),
  (141, 'quote', '기도는 하나님과의 대화이다. — 알렉산드리아의 클레멘트', 'Prayer is conversation with God. — Clement of Alexandria'),
  (142, 'quote', '하나님의 능력은 무한하다. — R.A. 토레이', 'God''s power is unlimited. — R.A. Torrey'),
  (143, 'quote', '모든 것은 하나님의 영광을 위한 것이다. — 요한 세바스찬 바흐', 'All is for the glory of God. — J.S. Bach'),
  (144, 'quote', '하나님께 감사하는 마음이 축복의 문을 연다. — 노먼 빈센트 필', 'Gratitude opens the door to blessing. — Norman Vincent Peale'),
  (145, 'bible', '의인의 기도는 역사하는 힘이 큼이니라. (야고보서 5:16)', 'The prayer of a righteous person is powerful. (James 5:16)'),
  (146, 'bible', '내가 주께 바라는 한 가지 일 그것을 구하리니. (시편 27:4)', 'One thing I ask from the Lord. (Psalm 27:4)'),
  (147, 'bible', '주의 이름을 사랑하는 자들을 주께서 복을 주시리이다. (시편 5:12)', 'You bless those who love your name. (Psalm 5:12)'),
  (148, 'bible', '주여 주께서 나의 하나님이시라 내가 주를 높이고. (이사야 25:1)', 'Lord, you are my God; I will exalt you. (Isaiah 25:1)'),
  (149, 'bible', '내 아들아 네 마음을 내게 주며 네 눈으로 내 길을 즐거워할지어다. (잠언 23:26)', 'My son, give me your heart and let your eyes delight in my ways. (Proverbs 23:26)'),
  (150, 'bible', '여호와는 나의 산성이시요 나의 하나님이시라. (시편 144:2)', 'The Lord is my fortress and my God. (Psalm 144:2)'),
  (151, 'bible', '주께서 내 길을 아시나이다. (시편 142:3)', 'You know the way I take. (Psalm 142:3)'),
  (152, 'bible', '오직 성령의 열매는 사랑과 희락과 화평과 오래 참음과 자비와 양선과 충성과. (갈라디아서 5:22)', 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness. (Galatians 5:22)'),
  (153, 'bible', '여호와를 기다리는 자는 복이 있도다. (이사야 30:18)', 'Blessed are all who wait for him. (Isaiah 30:18)'),
  (154, 'bible', '주께서 내 영혼을 소생시키시고. (시편 23:3)', 'He refreshes my soul. (Psalm 23:3)'),
  (155, 'bible', '내 영혼이 주를 갈망하나이다. (시편 63:1)', 'My soul thirsts for you. (Psalm 63:1)'),
  (156, 'bible', '너의 하나님 여호와가 너의 가운데에 계시니 그는 구원을 베푸실 전능자시라 그가 너로 말미암아 기쁨을 이기지 못하시며. (스바냐 3:17)', 'The Lord your God is with you, the Mighty Warrior who saves. He will take great delight in you. (Zephaniah 3:17)'),
  (157, 'bible', '끝으로 너희가 주 안에서와 그 힘의 능력으로 강건하여지고. (에베소서 6:10)', 'Finally, be strong in the Lord and in his mighty power. (Ephesians 6:10)'),
  (158, 'bible', '나는 주를 높이고 주의 이름을 찬송하리이다. (시편 145:1)', 'I will exalt you and praise your name. (Psalm 145:1)'),
  (159, 'bible', '주께서 나의 오른손을 붙드시며. (이사야 41:13)', 'I am the Lord who takes hold of your right hand. (Isaiah 41:13)'),
  (160, 'bible', '여호와의 이름을 찬송할지어다. (시편 113:1)', 'Praise the name of the Lord. (Psalm 113:1)'),
  (161, 'bible', '주는 나의 등불이시니 주께서 나의 어둠을 밝히시리이다. (시편 18:28)', 'You are my lamp; you bring light to my darkness. (Psalm 18:28)'),
  (162, 'bible', '네 믿음이 너를 구원하였느니라. (누가복음 7:50)', 'Your faith has saved you. (Luke 7:50)'),
  (163, 'bible', '주께서 나와 함께 계시니 내가 두려워하지 아니하리로다. (시편 118:6)', 'The Lord is with me; I will not be afraid. (Psalm 118:6)'),
  (164, 'bible', '너희는 이 세대를 본받지 말고. (로마서 12:2)', 'Do not conform to the pattern of this world. (Romans 12:2)'),
  (165, 'quote', '하나님의 선하심은 결코 실패하지 않는다. — 잭 하이포드', 'God''s goodness never fails. — Jack Hayford'),
  (166, 'quote', '믿음은 불가능을 가능으로 만든다. — 스미스 위글스워스', 'Faith makes the impossible possible. — Smith Wigglesworth'),
  (167, 'quote', '하나님의 계획에는 지연이 없다. — 레너드 라벤힐', 'There are no delays in God''s plan. — Leonard Ravenhill'),
  (168, 'quote', '주님의 손길은 우리 삶에 항상 있다. — 윌리엄 보든', 'The Lord''s hand is always on our lives. — William Borden'),
  (169, 'quote', '하나님은 우리에게 필요한 모든 것을 아신다. — 조지 워싱턴 카버', 'God knows all our needs. — George Washington Carver'),
  (170, 'quote', '믿음으로 사는 것이 진정한 자유다. — 윌리엄 윌버포스', 'Living by faith is true freedom. — William Wilberforce'),
  (171, 'bible', '그러므로 하나님의 능하신 손 아래에서 겸손하라 때가 되면 너희를 높이시리라. (베드로전서 5:6)', 'Humble yourselves under God’s mighty hand, that he may lift you up in due time. (1 Peter 5:6)'),
  (172, 'quote', '주님의 평안은 세상이 줄 수 없는 것이다. — 존 스토트', 'The Lord''s peace is beyond the world. — John Stott'),
  (173, 'quote', '하나님은 우리의 모든 눈물을 닦아 주신다. — 칼 바르트', 'God wipes away all our tears. — Karl Barth'),
  (174, 'quote', '신앙은 보이지 않는 것을 보는 눈이다. — 존 크리소스톰', 'Faith is the eye that sees the invisible. — John Chrysostom'),
  (175, 'bible', '주께서 내 기도를 들으시고 나의 간구를 받으시리로다. (시편 6:9)', 'The Lord has heard my cry for mercy. (Psalm 6:9)'),
  (176, 'bible', '주여 나는 주께 피하오니. (시편 7:1)', 'Lord, I take refuge in you. (Psalm 7:1)'),
  (177, 'bible', '주의 종에게 은혜를 베푸사. (시편 86:16)', 'Grant your strength to your servant. (Psalm 86:16)'),
  (178, 'bible', '여호와는 선하시며 그의 인자하심이 영원하고. (시편 100:5)', 'For the Lord is good and his love endures forever. (Psalm 100:5)'),
  (179, 'bible', '주는 나의 힘이시요 나의 노래시니. (시편 118:14)', 'The Lord is my strength and my song. (Psalm 118:14)'),
  (180, 'bible', '주께서 내 오른쪽에 계시니. (시편 109:31)', 'For he stands at the right hand. (Psalm 109:31)'),
  (181, 'bible', '내가 산 자의 땅에서 여호와의 선하심을 보리라. (시편 27:13)', 'I will see the goodness of the Lord. (Psalm 27:13)'),
  (182, 'bible', '여호와여 주는 나의 힘이시니. (시편 59:17)', 'You are my strength, I sing praise to you. (Psalm 59:17)'),
  (183, 'bible', '주의 증거가 확실하여. (시편 93:5)', 'Your statutes stand firm. (Psalm 93:5)'),
  (184, 'bible', '믿음은 바라는 것들의 실상이요 보이지 않는 것들의 증거니. (히브리서 11:1)', 'Now faith is confidence in what we hope for and assurance about what we do not see. (Hebrews 11:1)'),
  (185, 'bible', '주께서 나를 도우시는 이시니 내가 무서워하지 아니하리로다. (히브리서 13:6)', 'The Lord is my helper; I will not be afraid. (Hebrews 13:6)'),
  (186, 'bible', '너희가 믿으면 기도할 때에 무엇이든지 받으리라. (마태복음 21:22)', 'If you believe, you will receive whatever you ask. (Matthew 21:22)'),
  (187, 'bible', '주의 인자를 따라 나를 기억하소서. (시편 25:7)', 'Remember me according to your love. (Psalm 25:7)'),
  (188, 'bible', '하나님이여 내 속에 정한 마음을 창조하시고 내 안에 정직한 영을 새롭게 하소서. (시편 51:10)', 'Create in me a pure heart, O God, and renew a steadfast spirit within me. (Psalm 51:10)'),
  (189, 'bible', '주는 나의 기업이시니 내 잔이 넘치나이다. (시편 16:5)', 'Lord, you alone are my portion, my cup overflows. (Psalm 16:5)'),
  (190, 'bible', '내가 항상 주 앞에 있사오며. (시편 73:23)', 'I am always with you. (Psalm 73:23)'),
  (191, 'bible', '주께서 나를 위하여 모든 것을 이루시리이다. (시편 138:8)', 'The Lord will fulfill his purpose for me. (Psalm 138:8)'),
  (192, 'bible', '오직 정의를 행하며 인자를 사랑하며 겸손하게 네 하나님과 함께 행하는 것이 아니냐. (미가 6:8)', 'To act justly and to love mercy and to walk humbly with your God. (Micah 6:8)'),
  (193, 'bible', '내가 주의 법을 사랑하오니. (시편 119:97)', 'Oh, how I love your law! (Psalm 119:97)'),
  (194, 'quote', '갈보리산 위에 십자가 섰으니 주가 지신 십자가. — 조지 베나드, 「갈보리산 위에」', 'On a hill far away stood an old rugged cross. — George Bennard, The Old Rugged Cross'),
  (195, 'quote', '주님 안에서 안식을 찾으라. — 베네딕트', 'Find rest in the Lord. — Benedict of Nursia'),
  (196, 'quote', '하나님은 우리를 결코 혼자 두지 않으신다. — 프레드릭 부크너', 'God never leaves us alone. — Frederick Buechner'),
  (197, 'quote', '믿음은 질문을 없애지 않는다. 다만 그 질문을 어디로 가져가야 할지 안다. — 엘리자베스 엘리엇', 'Faith does not eliminate questions. But faith knows where to take them. — Elisabeth Elliot'),
  (198, 'quote', '하나님께서는 모든 것을 새롭게 하신다. — 줄리안 오브 노리치', 'God makes all things new. — Julian of Norwich'),
  (199, 'bible', '주님의 자비와 긍휼이 아침마다 새로우니 주의 성실하심이 크시도소이다. (예레미야애가 3:23)', 'His mercies are new every morning; great is your faithfulness. (Lamentations 3:23)'),
  (200, 'quote', '나는 큰 죄인이요, 그리스도는 위대한 구주이시다. — 존 뉴턴', 'I am a great sinner, and Christ is a great Saviour. — John Newton')
on conflict (order_no) do nothing;
