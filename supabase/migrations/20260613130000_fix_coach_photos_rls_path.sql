-- Fix-STORAGE-01 (RLS path fix): the coach-photos write policies created in
-- 20260613120000 required (storage.foldername(name))[1] = auth.uid()::text, but
-- only the onboarding upload uses that path shape. The profile-edit avatar and
-- gallery uploads use a literal prefix + coach_profiles.id, so RLS rejected them
-- with "new row violates row-level security policy".
--
-- Actual upload paths in the app:
--   ProfileStep.tsx    : `${auth.user.id}/<ts>.<ext>`                 → seg[1] = auth.uid()
--   ProfileEdit avatar : `profile/<coach_profile_id>/<ts>.<ext>`      → seg[2] = coach_profiles.id
--   ProfileEdit gallery: `gallery/<coach_profile_id>/<ts>-<rnd>.<ext>`→ seg[2] = coach_profiles.id
--
-- coach_profiles.id is a DIFFERENT UUID from auth.uid(), so no single segment
-- equals auth.uid() across all three shapes. Fix: keep ownership enforcement but
-- accept EITHER the caller's own auth.uid() folder, OR a path whose 2nd segment
-- is the caller's own coach_profiles.id (resolved auth.uid() → user_profiles →
-- coach_profiles, so an attacker cannot supply another coach's id). The public
-- SELECT policy ("Public can read coach photos") is unchanged.
--
-- A separate FrontendDeveloper cleanup will standardise the three upload paths.
--
-- Risk: MEDIUM — storage RLS. No data changed. Idempotent (DROP IF EXISTS).

BEGIN;

DROP POLICY IF EXISTS "Coaches can upload photos" ON storage.objects;
CREATE POLICY "Coaches can upload photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] IN (
        SELECT cp.id::text
        FROM coach_profiles cp
        JOIN user_profiles up ON cp.user_profile_id = up.id
        WHERE up.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Coaches can update photos" ON storage.objects;
CREATE POLICY "Coaches can update photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] IN (
        SELECT cp.id::text
        FROM coach_profiles cp
        JOIN user_profiles up ON cp.user_profile_id = up.id
        WHERE up.auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'coach-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] IN (
        SELECT cp.id::text
        FROM coach_profiles cp
        JOIN user_profiles up ON cp.user_profile_id = up.id
        WHERE up.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Coaches can delete photos" ON storage.objects;
CREATE POLICY "Coaches can delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'coach-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] IN (
        SELECT cp.id::text
        FROM coach_profiles cp
        JOIN user_profiles up ON cp.user_profile_id = up.id
        WHERE up.auth_user_id = auth.uid()
      )
    )
  );

COMMIT;
