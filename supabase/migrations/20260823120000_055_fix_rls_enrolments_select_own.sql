-- Migration 055: Fix group_programme_enrolments_select_own RLS predicate
--
-- The original policy (migration 20260331233640) compares
-- booked_by_user_id — a user_profiles.id — directly against auth.uid(),
-- which is an auth.users id. The two never match, so parents could never
-- read their own enrolments through the RLS client.
--
-- Migration 20260415194200 (fix_rls_auth_uid_m14a_tables) fixed the
-- identical mistake on the sibling _select_coach policy with an EXISTS
-- subquery through user_profiles.auth_user_id. This applies the exact
-- same pattern to _select_own.
--
-- Scope: this one SELECT policy only. No table changes, no data changes,
-- no other policy touched.

DROP POLICY IF EXISTS "group_programme_enrolments_select_own" ON group_programme_enrolments;

CREATE POLICY "group_programme_enrolments_select_own"
ON group_programme_enrolments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = group_programme_enrolments.booked_by_user_id
      AND up.auth_user_id = auth.uid()
  )
);
