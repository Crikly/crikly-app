-- Migration 056: payouts.enrolment_id — programme enrolment payouts (TECH-06)
-- ============================================
-- Programme enrolments (group_programme_enrolments) have never been paid out:
-- payouts.booking_id was NOT NULL, so an enrolment payout could not even be
-- represented, and the C-PAY-02 transfer job discovers work from bookings
-- only. This migration lets one payouts row pay EITHER a booking OR an
-- enrolment, exactly one, mirroring payment_intents_booking_xor_enrolment
-- (migration 033).
--
-- Additive and safe on live rows:
--   * every existing row has booking_id set and enrolment_id NULL, so the XOR
--     check holds for all of them (validated in place, no table rewrite);
--   * DROP NOT NULL is a catalogue change only;
--   * the new column is nullable with no default — no data is written;
--   * a UNIQUE constraint over an all-NULL column is trivially valid, and
--     payouts_booking_id_key (migration 045) is kept — NULLs never collide in
--     a UNIQUE constraint, so enrolment rows do not conflict with each other
--     on booking_id;
--   * RLS is untouched: the coach SELECT policy (migration 006) keys on
--     coach_profile_id, so coaches see their enrolment payouts automatically;
--     INSERT/UPDATE remain service-role only.
--
-- Deploy order: apply this migration to an environment BEFORE deploying the
-- TECH-06 application code to it. With PAYOUTS_ENROLMENTS_ENABLED unset the
-- booking payout path never references enrolment_id, so the reverse order is
-- harmless for bookings but the enrolment path would fail on the missing
-- column.

ALTER TABLE payouts ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE payouts
    ADD COLUMN enrolment_id uuid
        REFERENCES group_programme_enrolments(id) ON DELETE RESTRICT;

-- Exactly one of booking_id / enrolment_id. Same shape as migration 033's
-- payment_intents_booking_xor_enrolment.
ALTER TABLE payouts
    ADD CONSTRAINT payouts_booking_xor_enrolment
        CHECK ((booking_id IS NULL) <> (enrolment_id IS NULL));

-- One payout row per enrolment, ever. The row UUID doubles as the Stripe
-- transfer idempotency key (C-PAY-02), so uniqueness here is what makes a
-- double transfer impossible for enrolments — the same guarantee
-- payouts_booking_id_key gives bookings. (Creates the lookup index too.)
ALTER TABLE payouts
    ADD CONSTRAINT payouts_enrolment_id_key UNIQUE (enrolment_id);

COMMENT ON COLUMN payouts.enrolment_id IS
    'TECH-06: the programme enrolment this payout pays (exactly one of booking_id / enrolment_id is set). UNIQUE so the row UUID is a stable Stripe transfer idempotency key per enrolment, mirroring payouts_booking_id_key.';

COMMENT ON COLUMN payouts.booking_id IS
    'The 1-to-1 or group booking this payout pays. Nullable since migration 056 — NULL for programme enrolment payouts (see enrolment_id). UNIQUE (migration 045).';

COMMENT ON CONSTRAINT payouts_booking_xor_enrolment ON payouts IS
    'TECH-06: a payout pays exactly one source — a booking or a programme enrolment, never both, never neither.';

-- PostgREST schema-cache reload so the new column is visible to the API
-- without a restart (same pattern as migration 033).
NOTIFY pgrst, 'reload schema';
