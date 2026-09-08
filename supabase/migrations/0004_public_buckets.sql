-- Simplify: make all buckets public-readable so every uploaded file resolves
-- to a plain public URL (same shape the app already stores in text columns
-- like staff.photo_url / notices.attachment_url / resources.file_url).
--
-- Access control for *who can see a notice/resource/album exists at all* is
-- still enforced by RLS on the notices/resources/photo_albums tables and by
-- the requireUser() page gate in the website — a public bucket only means
-- someone who already has the exact (random, unguessable) file URL can fetch
-- the raw file directly, bypassing the app. That's an acceptable trade-off
-- for church bulletins/photos/notice attachments (no financial or otherwise
-- sensitive files are stored here — donations are DB rows, not files).

update storage.buckets set public = true where id in ('member-uploads', 'admin-only-uploads');
