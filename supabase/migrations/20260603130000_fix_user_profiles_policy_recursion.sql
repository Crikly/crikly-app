-- PUB-API-01 FIX: break the RLS recursion that the previous migration
-- (20260603120000) introduced.
--
-- The original "Public can view user_profiles for live coaches" policy
-- used EXISTS (SELECT 1 FROM coach_profiles ...). When evaluated, that
-- inner SELECT triggered coach_profiles' RLS — including the "Coaches
-- can view own profile" policy (migration 002:340), which itself does
-- EXISTS (SELECT 1 FROM user_profiles ...) → infinite recursion
-- (Postgres error 42P17). Caught at runtime in the PUB-API-01 STEP 2
-- smoke test, never reached production.
--
-- Fix: a SECURITY DEFINER helper function. SECURITY DEFINER runs with
-- the privileges of the function owner (postgres) and bypasses RLS on
-- the inner read, so the recursive cycle is broken cleanly. The
-- function is marked STABLE (allows the planner to cache the result
-- within a single query) and pins search_path to 'public' so a
-- malicious search_path can't redirect the lookup.
--
-- Privileges: REVOKE from PUBLIC, GRANT EXECUTE explicitly to anon +
-- authenticated + service_role. Anon needs it to evaluate the new
-- user_profiles policy.
--
-- Risk: 🔴 RLS policy + new function. Strictly narrowing — function
-- returns true ONLY when a live coach_profile references the target
-- user_profile_id. Same semantic as the previous policy; just without
-- the recursion.
--
-- Lifecycle: this supersedes 20260603120000. The DROP + CREATE happen
-- in one transaction so there is no window in which the policy is
-- absent.

BEGIN;

-- ── 1. Drop the recursive policy ───────────────────────────────────────
DROP POLICY IF EXISTS "Public can view user_profiles for live coaches"
    ON user_profiles;

-- ── 2. Create the SECURITY DEFINER helper ──────────────────────────────
CREATE OR REPLACE FUNCTION public.user_profile_has_live_coach(target_user_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM coach_profiles
    WHERE coach_profiles.user_profile_id = target_user_profile_id
      AND coach_profiles.is_profile_live = true
  );
$$;

-- Lock down the function so only the intended roles can invoke it.
REVOKE ALL ON FUNCTION public.user_profile_has_live_coach(uuid) FROM PUBLIC;
GRANT EXECUTE
    ON FUNCTION public.user_profile_has_live_coach(uuid)
    TO anon, authenticated, service_role;

-- ── 3. Recreate the policy using the non-recursive helper ──────────────
CREATE POLICY "Public can view user_profiles for live coaches"
    ON user_profiles
    FOR SELECT
    USING (public.user_profile_has_live_coach(user_profiles.id));

COMMIT;
