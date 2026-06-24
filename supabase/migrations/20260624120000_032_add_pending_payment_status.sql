-- Migration 032: Add 'pending_payment' to bookings.status (P-00c-API)
-- Created: 2026-06-24
-- Description: Guest checkout creates a booking in 'pending_payment' BEFORE the
--   Stripe PaymentIntent is confirmed. The Stripe webhook (payment_intent.succeeded)
--   transitions it to 'confirmed' (BR-06 instant confirmation).
--
-- Risk: 🔴 HIGH — modifies an existing CHECK constraint on the money/booking table.
--   Reviewed by supabase-migration-reviewer and approved by Lasith in P-00c-API STEP 0.
--
-- Safety: DROP + ADD inside one transaction → no window without the constraint.
--   Existing rows all hold one of the original 5 values, so re-adding a constraint
--   that is a strict superset can never fail validation. No rows are rewritten.

BEGIN;

ALTER TABLE bookings DROP CONSTRAINT valid_status;

ALTER TABLE bookings
  ADD CONSTRAINT valid_status
  CHECK (status IN (
    'pending_payment',
    'confirmed',
    'completed',
    'cancelled_parent',
    'cancelled_coach',
    'no_show'
  ));

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── Rollback (manual, for reference — never auto-run) ──────────────────
-- Safe only when no rows have status = 'pending_payment'.
-- BEGIN;
--   ALTER TABLE bookings DROP CONSTRAINT valid_status;
--   ALTER TABLE bookings
--     ADD CONSTRAINT valid_status
--     CHECK (status IN ('confirmed','completed','cancelled_parent','cancelled_coach','no_show'));
--   NOTIFY pgrst, 'reload schema';
-- COMMIT;
