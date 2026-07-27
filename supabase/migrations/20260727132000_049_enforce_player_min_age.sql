-- Migration 049: DB-level player minimum-age enforcement
-- Created: 2026-07-27
-- Task: P-01 (Block 1 parent schema foundations) — GAP-P-04 in task brief
--   (REQ-P-017: player minimum age = configured adult age, default 18)
-- Description: Rejects any player_profiles row whose date_of_birth makes the
--   player younger than platform_config.adult_age (migration 047). Anyone
--   under the adult age is, for safeguarding, a child (REQ-P-017/018).
--
-- Why a constraint trigger, not a CHECK: a CHECK constraint cannot reference
--   another table (platform_config), and RLS would not bind service-role
--   inserts. A trigger binds every write path, including service role.
--   Precedent: migration 038 constraint triggers.
--
-- Known app-side mismatch (accepted, Lasith Step 0 decision): the role-
--   selection route (src/app/api/auth/roles/route.ts) still gates at a
--   hardcoded 16. Harmless today — no code path inserts player_profiles and
--   the table is empty in every environment. Follow-up logged for Block 3:
--   point that route at platform_config.adult_age.
--
-- SECURITY DEFINER + pinned empty search_path (house style, migration 038):
--   required so RLS-scoped writers can read platform_config regardless of
--   their own grants; fully-qualified references throughout.
--
-- Risk: 🔴 High — new rejection surface on a profile table (currently
--   unexercised: zero player_profiles rows everywhere, no app insert path).
--   Approved by Lasith in Step 0.
--
-- Down migration:
--   DROP TRIGGER enforce_player_min_age_on_write ON player_profiles;
--   DROP FUNCTION public.enforce_player_min_age();

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_player_min_age()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_adult_age integer;
BEGIN
    SELECT adult_age INTO v_adult_age FROM public.platform_config LIMIT 1;

    -- Fail-safe: if the single config row is ever missing, enforce the
    -- REQ-P-017 default rather than silently allowing under-age players.
    IF v_adult_age IS NULL THEN
        v_adult_age := 18;
    END IF;

    IF NEW.date_of_birth > (current_date - make_interval(years => v_adult_age))::date THEN
        RAISE EXCEPTION 'PLAYER_MIN_AGE: players must be at least % years old (REQ-P-017)', v_adult_age
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- AFTER + constraint trigger so the check sees the final row values and
-- fails the whole transaction (matches migration 038 pattern).
CREATE CONSTRAINT TRIGGER enforce_player_min_age_on_write
    AFTER INSERT OR UPDATE OF date_of_birth ON player_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_player_min_age();

COMMIT;
