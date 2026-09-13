-- ================================================================
-- 주보(bulletin)를 설교에서 분리
--
-- 지금까지 주보 PDF는 sermons.file_url 칸에 설교와 한 행으로 붙어 있었다.
-- 그래서 설교 없이 주보만 올리거나 따로 관리할 수 없었다. 주보는 "그 주일"로
-- 식별되는 독립 콘텐츠이므로 자체 테이블로 뗀다.
--
-- 기존 행은 sermons.id를 그대로 가져와 /support/bulletin/<id> 링크가 유지된다.
-- sermons.file_url은 되돌리기 쉽도록 당분간 남겨 두지만 더 이상 읽지 않는다.
-- ================================================================

create table if not exists public.bulletins (
  id uuid primary key default gen_random_uuid(),
  -- 시드니 기준 주일 날짜. 시각이 없는 date라 렌더링 타임존에 따라 밀리지 않는다.
  sunday_date date not null unique,
  file_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.bulletins enable row level security;

create policy "bulletins_select_active_or_admin" on public.bulletins
  for select using (is_active or public.is_admin());
create policy "bulletins_admin_write" on public.bulletins
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.bulletins (id, sunday_date, file_url, is_active, created_at)
select
  id,
  (published_at at time zone 'Australia/Sydney')::date,
  file_url,
  is_active,
  created_at
from public.sermons
where file_url is not null and file_url <> ''
on conflict do nothing;
