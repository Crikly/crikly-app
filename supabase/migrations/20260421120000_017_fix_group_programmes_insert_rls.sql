-- Fix-62-1: Correct RLS INSERT policy for group_programmes
--
-- Problem: group_programmes_insert_own checked cp.user_profile_id = auth.uid()
-- but auth.uid() returns auth.users.id, not user_profiles.id (different UUIDs).
-- This is the same Fix-19 pattern that was applied to UPDATE/DELETE in migration
-- 20260415194200 — but the INSERT policy was missed.
--
-- Solution: Join through user_profiles.auth_user_id = auth.uid().

DROP POLICY IF EXISTS "group_programmes_insert_own" ON group_programmes;

CREATE POLICY "group_programmes_insert_own"
  ON group_programmes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      JOIN user_profiles up ON cp.user_profile_id = up.id
      WHERE cp.id = coach_profile_id
        AND up.auth_user_id = auth.uid()
    )
  );
