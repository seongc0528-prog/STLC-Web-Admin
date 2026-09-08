-- ================================================================
-- STLC (Sydney The Lord's Church) — initial schema
-- Run once in Supabase SQL Editor (Project → SQL Editor → New query)
-- ================================================================

create extension if not exists "pgcrypto";

-- ================================================================
-- 0. profiles + role helper
-- ================================================================

create type public.user_role as enum ('member', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  role public.user_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- bypasses RLS on profiles (SECURITY DEFINER) so policies elsewhere can
-- check "is this user an admin?" without recursive-policy issues.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- auto-create a profile row whenever someone signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- block self-service privilege escalation (role / is_active only admin-editable)
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.role <> old.role or new.is_active <> old.is_active then
      raise exception 'Only admins can change role or is_active';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- ================================================================
-- 1. 교회 소개: church_info / staff / history
-- ================================================================

create table public.church_info (
  id int primary key default 1 check (id = 1),
  sunday_service text,
  wednesday_service text,
  address text,
  address_en text,
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  updated_at timestamptz not null default now()
);
insert into public.church_info (id) values (1) on conflict do nothing;

alter table public.church_info enable row level security;
create policy "church_info_select_all" on public.church_info for select using (true);
create policy "church_info_admin_write" on public.church_info
  for all using (public.is_admin()) with check (public.is_admin());

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  position text,
  position_en text,
  bio text,
  bio_en text,
  photo_url text,
  is_senior_pastor boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
create policy "staff_select_all" on public.staff
  for select using (is_active or public.is_admin());
create policy "staff_admin_write" on public.staff
  for all using (public.is_admin()) with check (public.is_admin());

create table public.history (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int,
  content text not null,
  content_en text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.history enable row level security;
create policy "history_select_all" on public.history for select using (true);
create policy "history_admin_write" on public.history
  for all using (public.is_admin()) with check (public.is_admin());

-- ================================================================
-- 2. 조이풀TV: sermons(주일/수요) / praise_videos
-- ================================================================

create type public.sermon_service_type as enum ('sunday', 'wednesday');

create table public.sermons (
  id uuid primary key default gen_random_uuid(),
  service_type public.sermon_service_type not null default 'sunday',
  title text not null,
  title_en text,
  preacher text,
  preacher_en text,
  scripture text,
  scripture_en text,
  summary text,
  summary_en text,
  video_url text,
  file_url text,
  views int not null default 0,
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.sermons (service_type, published_at desc);

alter table public.sermons enable row level security;
create policy "sermons_select_active_or_admin" on public.sermons
  for select using (is_active or public.is_admin());
create policy "sermons_admin_write" on public.sermons
  for all using (public.is_admin()) with check (public.is_admin());

create table public.sermon_views (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons(id) on delete cascade,
  viewer uuid references auth.users(id) on delete set null,
  viewed_at timestamptz not null default now()
);
create index on public.sermon_views (sermon_id);

alter table public.sermon_views enable row level security;
create policy "sermon_views_insert_any" on public.sermon_views for insert with check (true);
create policy "sermon_views_select_admin" on public.sermon_views for select using (public.is_admin());

create or replace function public.increment_sermon_views()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sermons set views = views + 1 where id = new.sermon_id;
  return new;
end;
$$;
create trigger trg_increment_sermon_views
  after insert on public.sermon_views
  for each row execute function public.increment_sermon_views();

create table public.praise_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_en text,
  video_url text not null,
  thumbnail_url text,
  is_active boolean not null default true,
  published_at timestamptz not null default now()
);
alter table public.praise_videos enable row level security;
create policy "praise_videos_select_active_or_admin" on public.praise_videos
  for select using (is_active or public.is_admin());
create policy "praise_videos_admin_write" on public.praise_videos
  for all using (public.is_admin()) with check (public.is_admin());

-- ================================================================
-- 3. 커뮤니티: photo_albums / photo_items / photo_comments / testimonies / mission_news
--    (사진첩·간증은 로그인 필요 — 앱 정책 계승)
-- ================================================================

create table public.photo_albums (
  id uuid primary key default gen_random_uuid(),
  caption text not null,
  caption_en text,
  cover_url text,
  author_id uuid not null references auth.users(id) on delete cascade,
  views int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.photo_albums enable row level security;
create policy "photo_albums_select_authenticated" on public.photo_albums
  for select using (
    auth.role() = 'authenticated'
    and (is_active or public.is_admin() or author_id = auth.uid())
  );
create policy "photo_albums_insert_own" on public.photo_albums
  for insert with check (author_id = auth.uid());
create policy "photo_albums_update_own_or_admin" on public.photo_albums
  for update using (author_id = auth.uid() or public.is_admin());
create policy "photo_albums_delete_own_or_admin" on public.photo_albums
  for delete using (author_id = auth.uid() or public.is_admin());

create table public.photo_items (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  image_url text not null,
  thumb_url text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.photo_items (album_id);

alter table public.photo_items enable row level security;
create policy "photo_items_select_authenticated" on public.photo_items
  for select using (auth.role() = 'authenticated');
create policy "photo_items_write_owner_or_admin" on public.photo_items
  for all using (
    public.is_admin()
    or exists (select 1 from public.photo_albums a where a.id = album_id and a.author_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.photo_albums a where a.id = album_id and a.author_id = auth.uid())
  );

create table public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.photo_albums(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.photo_comments (album_id);

alter table public.photo_comments enable row level security;
create policy "photo_comments_select_authenticated" on public.photo_comments
  for select using (auth.role() = 'authenticated');
create policy "photo_comments_insert_own" on public.photo_comments
  for insert with check (author_id = auth.uid());
create policy "photo_comments_delete_own_or_admin" on public.photo_comments
  for delete using (author_id = auth.uid() or public.is_admin());

create table public.testimonies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  attachment_url text,
  author_id uuid not null references auth.users(id) on delete cascade,
  views int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.testimonies enable row level security;
create policy "testimonies_select_authenticated" on public.testimonies
  for select using (
    auth.role() = 'authenticated'
    and (is_active or public.is_admin() or author_id = auth.uid())
  );
create policy "testimonies_insert_own" on public.testimonies
  for insert with check (author_id = auth.uid());
create policy "testimonies_update_own_or_admin" on public.testimonies
  for update using (author_id = auth.uid() or public.is_admin());
create policy "testimonies_delete_own_or_admin" on public.testimonies
  for delete using (author_id = auth.uid() or public.is_admin());

create table public.mission_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_en text,
  content text not null,
  content_en text,
  thumbnail_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.mission_news enable row level security;
create policy "mission_news_select_active_or_admin" on public.mission_news
  for select using (is_active or public.is_admin());
create policy "mission_news_admin_write" on public.mission_news
  for all using (public.is_admin()) with check (public.is_admin());

-- ================================================================
-- 4. 행정지원: notices / resources / donations
--    (교회소식·자료실·온라인헌금은 로그인 필요 — 앱 정책 계승)
--    주보는 sermons(service_type='sunday')로 흡수했으므로 별도 테이블 없음
-- ================================================================

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  attachment_url text,
  author_id uuid references auth.users(id) on delete set null,
  pinned boolean not null default false,
  views int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.notices enable row level security;
create policy "notices_select_authenticated" on public.notices
  for select using (auth.role() = 'authenticated' and (is_active or public.is_admin()));
create policy "notices_admin_write" on public.notices
  for all using (public.is_admin()) with check (public.is_admin());

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_url text not null,
  category text,
  views int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.resources enable row level security;
create policy "resources_select_authenticated" on public.resources
  for select using (auth.role() = 'authenticated' and (is_active or public.is_admin()));
create policy "resources_admin_write" on public.resources
  for all using (public.is_admin()) with check (public.is_admin());

create type public.donation_type as enum ('tithe', 'thanksgiving', 'mission', 'building', 'other');
create type public.donation_status as enum ('pending', 'completed', 'failed');

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  donation_type public.donation_type not null default 'other',
  memo text,
  status public.donation_status not null default 'pending',
  receipt_requested boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.donations (member_id);

alter table public.donations enable row level security;
create policy "donations_select_own_or_admin" on public.donations
  for select using (member_id = auth.uid() or public.is_admin());
create policy "donations_admin_write" on public.donations
  for all using (public.is_admin()) with check (public.is_admin());
-- NOTE: 실제 결제(카드/계좌이체) 게이트웨이 연동 시, 결제 성공 콜백(서버/Edge Function,
-- service_role 사용)이 status를 'completed'로 갱신하는 방식을 별도로 설계해야 함.

-- ================================================================
-- 5. 교육 신청: education_programs / education_applications (로그인 필요)
-- ================================================================

create type public.education_category as enum ('officer_training', 'young_adult', 'sunday_school');
create type public.application_status as enum ('pending', 'approved', 'rejected');

create table public.education_programs (
  id uuid primary key default gen_random_uuid(),
  category public.education_category not null,
  title text not null,
  title_en text,
  description text,
  description_en text,
  schedule_info text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.education_programs enable row level security;
create policy "education_programs_select_authenticated" on public.education_programs
  for select using (auth.role() = 'authenticated' and (is_active or public.is_admin()));
create policy "education_programs_admin_write" on public.education_programs
  for all using (public.is_admin()) with check (public.is_admin());

create table public.education_applications (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.education_programs(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null,
  phone text,
  email text,
  status public.application_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index on public.education_applications (program_id);
create index on public.education_applications (applicant_id);

alter table public.education_applications enable row level security;
create policy "education_applications_select_own_or_admin" on public.education_applications
  for select using (applicant_id = auth.uid() or public.is_admin());
create policy "education_applications_insert_own" on public.education_applications
  for insert with check (applicant_id = auth.uid());
create policy "education_applications_admin_update" on public.education_applications
  for update using (public.is_admin());

-- ================================================================
-- 6. 푸시 알림: push_subscriptions / push_logs
-- ================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  device_type text,
  created_at timestamptz not null default now(),
  unique (user_id, fcm_token)
);
alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_subscriptions_admin_read" on public.push_subscriptions
  for select using (public.is_admin());

create table public.push_logs (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  target text not null default 'all',
  sent_at timestamptz not null default now()
);
alter table public.push_logs enable row level security;
create policy "push_logs_admin_only" on public.push_logs
  for all using (public.is_admin()) with check (public.is_admin());
