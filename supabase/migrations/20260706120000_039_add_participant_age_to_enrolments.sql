-- Migration 039: Add participant_age to group_programme_enrolments (BUG-20)
-- Created: 2026-07-06
-- Description: The guest enrolment checkout now captures who the programme is
--   for (BUG-24 single-funnel work). participant_name already exists on this
--   table (migration 020); this adds the age half of the snapshot, mirroring
--   migration 035's bookings pattern exactly (UX-16 parity).
--
-- Nullable for backward compatibility with pre-BUG-20 rows (the data was
-- never captured, so they cannot be backfilled). New guest enrolments REQUIRE
-- participant_name at the API validation layer
-- (POST /api/guest/programme-enrolments); participant_age stays optional —
-- children have it, adult players may not.
--
-- Risk: 🟢 additive nullable column + CHECK; no rows rewritten, no RLS change
--   (existing group_programme_enrolments policies cover the new column).

ALTER TABLE group_programme_enrolments
  ADD COLUMN IF NOT EXISTS participant_age integer NULL;

ALTER TABLE group_programme_enrolments
  ADD CONSTRAINT valid_enrolment_participant_age
  CHECK (participant_age IS NULL OR (participant_age >= 1 AND participant_age <= 99));

COMMENT ON COLUMN group_programme_enrolments.participant_age IS
  'Participant age in years at enrolment time, as entered at guest checkout.
   Optional — adult players may omit it. Pairs with participant_name
   (migration 020); mirrors bookings.participant_age (migration 035).';

NOTIFY pgrst, 'reload schema';
