-- =============================================================================
-- CASA DECOR — Supabase Storage setup
-- Bucket: casa-decor
-- Policies:
--   - Public read (required for public product/category/hero images)
--   - Admin write (upload/replace/delete) enforced via public.is_admin()
-- =============================================================================

begin;

-- Create bucket (public = true so public URLs work)
insert into storage.buckets (id, name, public)
values ('casa-decor', 'casa-decor', true)
on conflict (id) do update set public = excluded.public;

-- Storage policies live on storage.objects
-- Ensure RLS is enabled on storage.objects (Supabase enables by default, but safe)
alter table storage.objects enable row level security;

-- Public read
drop policy if exists "Storage: public read casa-decor" on storage.objects;
create policy "Storage: public read casa-decor"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'casa-decor');

-- Admin insert (upload new)
drop policy if exists "Storage: admin insert casa-decor" on storage.objects;
create policy "Storage: admin insert casa-decor"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'casa-decor'
  and public.is_admin()
);

-- Admin update (replace metadata)
drop policy if exists "Storage: admin update casa-decor" on storage.objects;
create policy "Storage: admin update casa-decor"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'casa-decor'
  and public.is_admin()
)
with check (
  bucket_id = 'casa-decor'
  and public.is_admin()
);

-- Admin delete
drop policy if exists "Storage: admin delete casa-decor" on storage.objects;
create policy "Storage: admin delete casa-decor"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'casa-decor'
  and public.is_admin()
);

commit;
