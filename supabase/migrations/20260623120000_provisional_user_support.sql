-- P-00c-DB: Provisional user support for guest checkout (Block 0)
-- auth_user_id → nullable (provisional users have no auth credentials)
-- is_provisional: marks guest-created rows for cleanup cron
-- provisional_until: now() + 6 months, set at API layer on creation
-- Existing authenticated users: unaffected (is_provisional defaults false)
--
-- Risk: 🔴 HIGH — core user table, NOT NULL constraint change + RLS.
-- Reviewed and approved by Lasith in P-00c-DB STEP 0 (2026-06-23).
--
-- Null-safety notes:
--   * The UNIQUE index user_profiles_auth_user_id_idx stays unchanged.
--     Postgres treats NULLs as distinct in a standard UNIQUE index, so
--     many provisional rows (auth_user_id = NULL) coexist without conflict,
--     and the onConflict:'auth_user_id' upsert in auth/callback still works
--     for real (non-null) ids.
--   * Every existing RLS policy compares auth.uid() = auth_user_id. For a
--     provisional row auth_user_id is NULL, so the comparison is NULL (never
--     true) — provisional rows are never returned to ordinary or anonymous
--     clients. All provisional row writes go through the service-role API
--     (RLS bypassed) only.
--   * The public "live coaches" SELECT policy is the only anon-readable
--     policy; a provisional guest never has a coach_profiles row so it is
--     already excluded, but we add an explicit is_provisional = false guard
--     below as belt-and-braces (approved in STEP 0).
--
-- Existing authenticated users are 100% unaffected: every current row has
-- auth_user_id set (dropping NOT NULL changes nothing for them),
-- is_provisional defaults false, provisional_until defaults NULL. No rows
-- are rewritten.

BEGIN;

-- ── 1. auth_user_id → nullable ─────────────────────────────────────────
-- Provisional (guest) users have no Supabase Auth credentials yet.
ALTER TABLE user_profiles
  ALTER COLUMN auth_user_id DROP NOT NULL;

-- ── 2. is_provisional ──────────────────────────────────────────────────
-- Marks the row as guest-created. Defaults false so all existing rows and
-- all normal sign-ups are non-provisional.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_provisional boolean NOT NULL DEFAULT false;

-- ── 3. provisional_until ───────────────────────────────────────────────
-- Set to now() + 6 months at the API layer on creation; read by a future
-- cleanup cron. NULL for non-provisional rows.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS provisional_until timestamptz;

-- ── 4. Harden the public SELECT policy ─────────────────────────────────
-- The public "live coaches" policy (20260603130000) is the only policy that
-- returns user_profiles rows to anonymous clients. Add an explicit
-- is_provisional = false guard so provisional rows can never be exposed to
-- unauthenticated requests, independent of whether a coach_profiles row ever
-- references them. DROP + CREATE in this transaction → no window without the
-- policy. Semantics are otherwise identical (still uses the non-recursive
-- SECURITY DEFINER helper user_profile_has_live_coach).
DROP POLICY IF EXISTS "Public can view user_profiles for live coaches"
  ON user_profiles;

CREATE POLICY "Public can view user_profiles for live coaches"
  ON user_profiles
  FOR SELECT
  USING (
    user_profiles.is_provisional = false
    AND public.user_profile_has_live_coach(user_profiles.id)
  );

-- ── 5. Reload the PostgREST schema cache ───────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Rollback (manual, for reference — never auto-run) ──────────────────
-- BEGIN;
--   DROP POLICY IF EXISTS "Public can view user_profiles for live coaches"
--     ON user_profiles;
--   CREATE POLICY "Public can view user_profiles for live coaches"
--     ON user_profiles FOR SELECT
--     USING (public.user_profile_has_live_coach(user_profiles.id));
--   ALTER TABLE user_profiles DROP COLUMN IF EXISTS provisional_until;
--   ALTER TABLE user_profiles DROP COLUMN IF EXISTS is_provisional;
--   -- only safe while no provisional (null auth_user_id) rows exist:
--   ALTER TABLE user_profiles ALTER COLUMN auth_user_id SET NOT NULL;
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
