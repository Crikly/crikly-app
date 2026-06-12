-- Fix-SESSION-01: correct the coach_session_types INSERT RLS policy.
--
-- Problem: the original policy (20260331233640_coach_new_tables.sql) used
--   WHERE cs.id = coach_sport_id AND cp.user_profile_id = auth.uid()
-- but auth.uid() returns auth.users.id, NOT user_profiles.id (different UUIDs),
-- so the WITH CHECK is always false → every authenticated coach insert is
-- rejected with 42501.
--
-- The Fix-19 migration (20260415194200_fix_rls_auth_uid_m14a_tables.sql) fixed
-- the UPDATE and DELETE policies on this table with the correct
-- user_profiles.auth_user_id = auth.uid() mapping, but MISSED the INSERT policy.
-- This migration applies the same correction to INSERT.
--
-- Risk: HIGH — RLS policy change on a production table. No data changed.

BEGIN;

DROP POLICY IF EXISTS "coach_session_types_insert_own" ON coach_session_types;

CREATE POLICY "coach_session_types_insert_own"
ON coach_session_types FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM coach_sports cs
    JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cs.id = coach_sport_id
      AND up.auth_user_id = auth.uid()
  )
);

COMMIT;
