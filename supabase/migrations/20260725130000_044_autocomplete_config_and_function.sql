-- Migration 044: Session auto-completion — config + function (C-PAY-01)
-- ============================================
-- A confirmed booking whose session ended default_autocomplete_delay_hours
-- ago flips to 'completed', which starts the BR-03 payout clock:
--   completed_at = now()
--   payout_eligible_at = now() + platform_config.default_payout_delay_hours
-- The C-PAY-02 transfer job acts on payout_eligible_at; without this
-- transition it has nothing to process.
--
-- Called by the Vercel cron route /api/cron/auto-complete-sessions (hourly,
-- CRON_SECRET-authed, service role). Idempotent by construction: the
-- status = 'confirmed' filter means a second run matches nothing.
--
-- Timezone (approved C-PAY-01 Step 0): session_date + session_end_time are
-- UK wall-clock by platform convention (see migration 036 design notes).
-- `(session_date + session_end_time) AT TIME ZONE 'Europe/London'` interprets
-- the naive timestamp as UK local time and yields the correct UTC timestamptz
-- in both GMT and BST. This conversion is not IMMUTABLE (tzdata-dependent),
-- which rules out indexing it — fine here: the query filters on
-- status = 'confirmed' first (bookings_status_idx), a small set by nature.
--
-- Additive only: one new column (existing single config row backfilled by the
-- DEFAULT), one new function. No existing column, row, RLS, or index touched.

-- 1. Auto-complete delay knob (default 2h, locked 23 Jul 2026). Admin
--    configurable like every other platform_config value — never hardcode.
ALTER TABLE platform_config
    ADD COLUMN default_autocomplete_delay_hours integer NOT NULL DEFAULT 2;

ALTER TABLE platform_config
    ADD CONSTRAINT valid_autocomplete_delay CHECK (default_autocomplete_delay_hours >= 0);

COMMENT ON COLUMN platform_config.default_autocomplete_delay_hours IS
    'Hours after session end before a confirmed booking auto-completes (C-PAY-01). Completion starts the BR-03 payout clock.';

-- 2. The auto-completion function. Reads both delays itself so the route and
--    the function can never disagree about config.
CREATE FUNCTION auto_complete_due_bookings()
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    cfg RECORD;
    completed_count integer;
BEGIN
    SELECT default_autocomplete_delay_hours, default_payout_delay_hours
    INTO cfg
    FROM platform_config
    LIMIT 1;

    IF cfg IS NULL THEN
        RAISE EXCEPTION 'auto_complete_due_bookings: platform_config row missing';
    END IF;

    -- Single set-based UPDATE: atomic, and completed_at / payout_eligible_at
    -- derive from the same transaction now() so BR-03 arithmetic is exact.
    -- Only live confirmed 1-on-1 bookings are eligible — pending_payment,
    -- cancelled_*, no_show, completed, and soft-deleted rows never match.
    UPDATE bookings
    SET status = 'completed',
        completed_at = now(),
        payout_eligible_at = now() + make_interval(hours => cfg.default_payout_delay_hours)
    WHERE status = 'confirmed'
      AND deleted_at IS NULL
      AND ((session_date + session_end_time) AT TIME ZONE 'Europe/London')
          + make_interval(hours => cfg.default_autocomplete_delay_hours) < now();

    GET DIAGNOSTICS completed_count = ROW_COUNT;
    RETURN completed_count;
END;
$$;

-- 3. Service-role only. The cron route calls via the admin client; browser
--    roles must not be able to complete bookings and start payout clocks.
REVOKE EXECUTE ON FUNCTION auto_complete_due_bookings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auto_complete_due_bookings() FROM anon;
REVOKE EXECUTE ON FUNCTION auto_complete_due_bookings() FROM authenticated;

COMMENT ON FUNCTION auto_complete_due_bookings() IS
    'C-PAY-01: completes confirmed bookings whose session ended default_autocomplete_delay_hours ago; sets completed_at and payout_eligible_at (BR-03). Idempotent. Service role only.';
