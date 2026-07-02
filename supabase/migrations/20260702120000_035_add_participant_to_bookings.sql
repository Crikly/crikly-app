-- Migration 035: Add participant snapshot to bookings (UX-16)
-- Guest checkout captures who the session is for (a parent's child, or an
-- adult player booking for themselves) but had nowhere to persist it — guest
-- participants have no child_profiles row, so the name/age died in URL params.
-- Snapshot columns mirror migration 020's participant_name on
-- group_programme_enrolments.
--
-- Nullable for backward compatibility with pre-UX-16 rows (the data was never
-- captured server-side, so they cannot be backfilled). New guest bookings
-- REQUIRE participant_name at the API validation layer
-- (POST /api/guest/bookings); participant_age stays optional — children have
-- it, adult players may not.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS participant_name text NULL,
  ADD COLUMN IF NOT EXISTS participant_age integer NULL;

ALTER TABLE bookings
  ADD CONSTRAINT valid_participant_age
  CHECK (participant_age IS NULL OR (participant_age >= 1 AND participant_age <= 99));

COMMENT ON COLUMN bookings.participant_name IS
  'Who the session is for, as entered at guest checkout (child name or the
   player themselves). Snapshot — no FK. NULL on pre-UX-16 rows and on
   logged-in bookings that link child_profile_id instead.';

COMMENT ON COLUMN bookings.participant_age IS
  'Participant age in years at booking time, as entered at guest checkout.
   Optional — adult players may omit it.';
