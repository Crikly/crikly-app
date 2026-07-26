-- Migration 045: One payout row per booking (C-PAY-02)
-- ============================================
-- The C-PAY-02 transfer job uses the payout row UUID as the Stripe transfer
-- idempotency key. The guarantee "one booking never receives two transfers"
-- only holds if the row itself is unique per booking — migration 006 gave
-- payouts a NON-unique index on booking_id, so nothing at the DB level
-- prevented a second row (and therefore a second UUID → a second idempotency
-- key → a second transfer).
--
-- Full uniqueness (not a partial index) is correct because rows are reused
-- across their whole lifecycle: retries reuse the row (retry_count
-- increments, C-PAY-02) and holds reuse the row (C-PAY-03 contract,
-- migration 043). No flow ever needs a second payouts row for a booking.
--
-- Safe to apply: no payout job has ever run, so payouts is empty in every
-- environment — the constraint cannot collide with existing data.

ALTER TABLE payouts ADD CONSTRAINT payouts_booking_id_key UNIQUE (booking_id);

-- The constraint's backing unique index supersedes the non-unique index from
-- migration 006 — keeping both would maintain two identical indexes on every
-- write for no read benefit.
DROP INDEX payouts_booking_id_idx;

COMMENT ON CONSTRAINT payouts_booking_id_key ON payouts IS
    'C-PAY-02: one payout row per booking, ever. The row UUID doubles as the Stripe transfer idempotency key, so uniqueness here is what makes a double transfer impossible.';
