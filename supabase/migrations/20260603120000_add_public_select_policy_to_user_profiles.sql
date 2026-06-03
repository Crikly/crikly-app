-- PUB-API-01: public SELECT policy on user_profiles for live coaches.
--
-- The existing "Users can view own profile" policy (migration 001) gates
-- user_profiles SELECT on `auth.uid() = auth_user_id`, so anonymous clients
-- (no JWT) read zero rows. This blocks the public coach discovery surface
-- from joining user_profiles for full_name + avatar_url + location_city,
-- which the landing rail and the future /coaches search page both need.
--
-- This new policy is strictly narrowing — it exposes user_profiles rows
-- ONLY when a live coach_profile (is_profile_live = true) references them.
-- Soft-deleted coach_profiles are not currently filtered here because the
-- existing public coach_profiles policy at migration 002:334 doesn't
-- filter deleted_at either; the API route applies deleted_at IS NULL at
-- query time. Adding it here would tighten symmetry but is out of scope
-- for this migration.
--
-- Risk: 🔴 RLS policy change per CLAUDE.md. Reviewed and approved by
-- Lasith in PUB-API-01 STEP 0 (2026-06-03). Strictly read-only on a
-- narrowed row set. No write/update policies added. No DELETE policy
-- exists on user_profiles either, so soft delete via UPDATE deleted_at
-- remains the only deletion path.
--
-- Columns exposed: every user_profiles column (no column-level RLS) — in
-- practice consumers will project full_name, avatar_url, location_city,
-- location_postcode. The location_lat/location_lng numeric columns are
-- also readable post-policy; consumers should NOT project them on public
-- responses. The discovery route in this commit does not.
--
-- Lifecycle: no follow-up needed. The parent policies (Public can view
-- live coach profiles + Coaches can view own profile) already cover the
-- gating shape; this is the missing public counterpart for user_profiles.

BEGIN;

CREATE POLICY "Public can view user_profiles for live coaches"
    ON user_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            WHERE coach_profiles.user_profile_id = user_profiles.id
              AND coach_profiles.is_profile_live = true
        )
    );

COMMIT;
