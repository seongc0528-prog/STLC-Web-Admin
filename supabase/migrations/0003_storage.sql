-- ================================================================
-- Storage buckets
-- ================================================================
-- public-assets      : 공개 콘텐츠 첨부(섬기는사람들 사진, 설교/주보 첨부, 찬양 썸네일,
--                       선교소식 썸네일) — 누구나 읽기 가능, 쓰기는 관리자만
-- member-uploads     : 로그인 회원 콘텐츠(행사사진 앨범, 간증 첨부) — 로그인 회원만 읽기,
--                       본인 폴더({auth.uid()}/...)에만 쓰기 가능, 관리자는 전체 가능
-- admin-only-uploads  : 로그인 필요 콘텐츠 중 관리자만 올리는 것(교회소식 첨부, 자료실 파일)
--                       — 로그인 회원만 읽기, 쓰기는 관리자만

insert into storage.buckets (id, name, public)
values
  ('public-assets', 'public-assets', true),
  ('member-uploads', 'member-uploads', false),
  ('admin-only-uploads', 'admin-only-uploads', false)
on conflict (id) do nothing;

-- ---------------- public-assets ----------------

create policy "public_assets_select_all" on storage.objects
  for select using (bucket_id = 'public-assets');

create policy "public_assets_admin_write" on storage.objects
  for insert with check (bucket_id = 'public-assets' and public.is_admin());

create policy "public_assets_admin_update" on storage.objects
  for update using (bucket_id = 'public-assets' and public.is_admin());

create policy "public_assets_admin_delete" on storage.objects
  for delete using (bucket_id = 'public-assets' and public.is_admin());

-- ---------------- member-uploads ----------------
-- convention: object path is "{auth.uid()}/..." so owners can be identified
-- from the first path segment via storage.foldername(name)

create policy "member_uploads_select_authenticated" on storage.objects
  for select using (bucket_id = 'member-uploads' and auth.role() = 'authenticated');

create policy "member_uploads_insert_own_or_admin" on storage.objects
  for insert with check (
    bucket_id = 'member-uploads'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "member_uploads_update_own_or_admin" on storage.objects
  for update using (
    bucket_id = 'member-uploads'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy "member_uploads_delete_own_or_admin" on storage.objects
  for delete using (
    bucket_id = 'member-uploads'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ---------------- admin-only-uploads ----------------

create policy "admin_only_uploads_select_authenticated" on storage.objects
  for select using (bucket_id = 'admin-only-uploads' and auth.role() = 'authenticated');

create policy "admin_only_uploads_admin_write" on storage.objects
  for insert with check (bucket_id = 'admin-only-uploads' and public.is_admin());

create policy "admin_only_uploads_admin_update" on storage.objects
  for update using (bucket_id = 'admin-only-uploads' and public.is_admin());

create policy "admin_only_uploads_admin_delete" on storage.objects
  for delete using (bucket_id = 'admin-only-uploads' and public.is_admin());
