-- Fix-STORAGE-01: create the coach-photos and programme-images storage buckets
-- + RLS policies to match staging.
--
-- These buckets exist in staging but were never captured in a migration, so
-- `supabase db reset` leaves local (and production) without them, breaking photo
-- uploads. This migration reproduces the staging configuration so every
-- environment is consistent.
--
-- Idempotent: buckets use ON CONFLICT DO NOTHING; policies use DROP ... IF EXISTS
-- before CREATE. Safe to re-run, and a no-op for buckets that already exist on
-- staging (their existing settings are left untouched).
--
-- Risk: MEDIUM — storage RLS. No application data changed.
--
-- Confirmed configuration (Lasith, 2026-06-13):
--   coach-photos     : public, file_size_limit NULL (default), allowed_mime_types NULL (any)
--   programme-images : public, file_size_limit 5 MB,            allowed_mime_types NULL (any), NO policies
--   coach-photos write policies are OWNER-SCOPED on the first path segment
--   (uploads use `${auth.user.id}/<file>`), public read is bucket-wide.

BEGIN;

-- 1. Buckets ----------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('coach-photos',     'coach-photos',     true, NULL,    NULL),
  ('programme-images', 'programme-images', true, 5242880, NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. coach-photos RLS policies ----------------------------------------------
-- RLS is already enabled on storage.objects by Supabase default.
-- Writes are owner-scoped: (storage.foldername(name))[1] is the first path
-- segment, which the upload code sets to auth.uid(). Reads are public.

DROP POLICY IF EXISTS "Coaches can upload photos" ON storage.objects;
CREATE POLICY "Coaches can upload photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Coaches can update photos" ON storage.objects;
CREATE POLICY "Coaches can update photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Public can read coach photos" ON storage.objects;
CREATE POLICY "Public can read coach photos"
  ON storage.objects FOR SELECT TO public
  USING ( bucket_id = 'coach-photos' );

DROP POLICY IF EXISTS "Coaches can delete photos" ON storage.objects;
CREATE POLICY "Coaches can delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. programme-images — PUBLIC bucket, 5 MB, NO policies (matches staging).
--    Public read is served via the bucket's public flag without an objects
--    SELECT policy. Coach uploads to this bucket are intentionally out of scope
--    for this task (would require a separate INSERT policy).

COMMIT;
