-- Migration 034: Replace plain slot UNIQUE constraint with a partial unique index (BUG-13)
-- Created: 2026-06-28
-- Description: The bookings table enforced slot uniqueness with a plain constraint:
--     unique_coach_session_slot UNIQUE(coach_profile_id, session_date, session_start_time)
--   (defined in migration 005, line 51). Because a plain UNIQUE has no WHERE clause,
--   it counts EVERY row — including soft-deleted rows (deleted_at IS NOT NULL) and
--   cancelled rows (status IN 'cancelled_parent','cancelled_coach','no_show'). The
--   result: once a slot was ever cancelled or abandoned, it stayed permanently
--   blocked, and the guest booking API (src/app/api/guest/bookings/route.ts) returned
--   slot_taken (409) for a slot that was actually free.
--
--   This migration drops the plain constraint and replaces it with a PARTIAL unique
--   index that only counts slots actually held by a live booking.
--     Blocks (slot held):  pending_payment, confirmed, completed
--     Frees (slot open):   cancelled_parent, cancelled_coach, no_show,
--                          and any soft-deleted row (deleted_at IS NOT NULL)
--   'completed' deliberately stays slot-holding — a finished past session must not
--   become re-bookable for its historical slot.
--
-- Risk: 🔴 HIGH — changes a uniqueness rule on the core money/booking table.
--   Reviewed and approved by Lasith in BUG-13 STEP 0.
--
-- Safety: DROP + CREATE run inside one transaction → no window without slot
--   protection. The index build cannot fail on existing data: the plain UNIQUE
--   being dropped already guaranteed uniqueness across ALL rows, so any subset
--   (this predicate's rows) is necessarily unique too. No rows are rewritten.

BEGIN;

-- Drop the plain constraint from migration 005.
ALTER TABLE bookings DROP CONSTRAINT unique_coach_session_slot;

-- Partial unique index: a slot is only "held" by a live, non-cancelled booking.
CREATE UNIQUE INDEX unique_coach_session_slot
  ON bookings (coach_profile_id, session_date, session_start_time)
  WHERE deleted_at IS NULL
    AND status NOT IN ('cancelled_parent', 'cancelled_coach', 'no_show');

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Rollback (manual, for reference — never auto-run) ──────────────────
-- ⚠️ Re-adding the plain constraint will FAIL if, after this fix, any slot is
--    held by both a freed row (cancelled/soft-deleted) and a new active booking —
--    which is exactly the scenario the fix enables. Rollback is only clean before
--    any such re-booking has occurred.
-- BEGIN;
--   DROP INDEX IF EXISTS unique_coach_session_slot;
--   ALTER TABLE bookings
--     ADD CONSTRAINT unique_coach_session_slot
--     UNIQUE (coach_profile_id, session_date, session_start_time);
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
