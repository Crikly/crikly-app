-- Fix-19: Correct RLS policies with broken auth.uid() mapping
-- 
-- Problem: 9 RLS policies introduced in M-14a compared cp.user_profile_id = auth.uid()
-- but auth.uid() returns auth.users.id, not user_profiles.id. These are different UUIDs.
-- 
-- Solution: Join through user_profiles.auth_user_id = auth.uid() to get correct mapping.
-- 
-- Note: These fixes were already applied manually to the live DB during validation.
-- This migration captures those fixes in the codebase to prevent loss on redeploy.

-- ============================================================================
-- coach_session_types
-- ============================================================================

DROP POLICY IF EXISTS "coach_session_types_update_own" ON coach_session_types;
DROP POLICY IF EXISTS "coach_session_types_delete_own" ON coach_session_types;

CREATE POLICY "coach_session_types_update_own"
ON coach_session_types FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM coach_sports cs
    JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cs.id = coach_session_types.coach_sport_id
      AND up.auth_user_id = auth.uid()
  )
);

CREATE POLICY "coach_session_types_delete_own"
ON coach_session_types FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM coach_sports cs
    JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cs.id = coach_session_types.coach_sport_id
      AND up.auth_user_id = auth.uid()
  )
);

-- ============================================================================
-- coach_venues
-- ============================================================================

DROP POLICY IF EXISTS "coach_venues_update_own" ON coach_venues;
DROP POLICY IF EXISTS "coach_venues_delete_own" ON coach_venues;

CREATE POLICY "coach_venues_update_own"
ON coach_venues FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM coach_profiles cp
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cp.id = coach_venues.coach_profile_id
      AND up.auth_user_id = auth.uid()
  )
);

CREATE POLICY "coach_venues_delete_own"
ON coach_venues FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM coach_profiles cp
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cp.id = coach_venues.coach_profile_id
      AND up.auth_user_id = auth.uid()
  )
);

-- ============================================================================
-- group_programmes
-- ============================================================================

DROP POLICY IF EXISTS "group_programmes_update_own" ON group_programmes;
DROP POLICY IF EXISTS "group_programmes_delete_own" ON group_programmes;

CREATE POLICY "group_programmes_update_own"
ON group_programmes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM coach_profiles cp
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cp.id = group_programmes.coach_profile_id
      AND up.auth_user_id = auth.uid()
  )
);

CREATE POLICY "group_programmes_delete_own"
ON group_programmes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM coach_profiles cp
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE cp.id = group_programmes.coach_profile_id
      AND up.auth_user_id = auth.uid()
  )
);

-- ============================================================================
-- group_programme_sessions
-- ============================================================================

DROP POLICY IF EXISTS "group_programme_sessions_update_own" ON group_programme_sessions;
DROP POLICY IF EXISTS "group_programme_sessions_delete_own" ON group_programme_sessions;

CREATE POLICY "group_programme_sessions_update_own"
ON group_programme_sessions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM group_programmes gp
    JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE gp.id = group_programme_sessions.group_programme_id
      AND up.auth_user_id = auth.uid()
  )
);

CREATE POLICY "group_programme_sessions_delete_own"
ON group_programme_sessions FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM group_programmes gp
    JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE gp.id = group_programme_sessions.group_programme_id
      AND up.auth_user_id = auth.uid()
  )
);

-- ============================================================================
-- group_programme_enrolments
-- ============================================================================

DROP POLICY IF EXISTS "group_programme_enrolments_select_coach" ON group_programme_enrolments;

CREATE POLICY "group_programme_enrolments_select_coach"
ON group_programme_enrolments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM group_programmes gp
    JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
    JOIN user_profiles up ON cp.user_profile_id = up.id
    WHERE gp.id = group_programme_enrolments.programme_id
      AND up.auth_user_id = auth.uid()
  )
);
