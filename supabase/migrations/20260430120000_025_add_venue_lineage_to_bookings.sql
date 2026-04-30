-- Fix-86 — Snapshot venue + lineage onto bookings rows
--
-- Adds four nullable columns to bookings so the Booking Detail screen
-- (CF-D04) can show where a session is happening, and so Step 5
-- booking creation (B-11) has the lineage it needs without a second
-- migration.
--
-- Schema decision: snapshot model (FK + denormalised text).
-- - venue_id / availability_template_id: live FKs (nullable)
-- - venue_name / venue_address: historical snapshot at booking time
--
-- Rationale: bookings are historical receipts. Render the snapshot in
-- the UI so the booking always reflects what was true at booking time,
-- even if the coach later renames or deletes the venue.

-- ────────────────────────────────────────────────────────────
-- Schema
-- ────────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS venue_id uuid
    REFERENCES coach_venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS venue_address text,
  ADD COLUMN IF NOT EXISTS availability_template_id uuid
    REFERENCES availability_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_venue_id
  ON bookings(venue_id)
  WHERE venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_availability_template_id
  ON bookings(availability_template_id)
  WHERE availability_template_id IS NOT NULL;

COMMENT ON COLUMN bookings.venue_id IS
  'FK to coach_venues for live data. Nullable for group programme bookings (no FK source) and historical bookings.';

COMMENT ON COLUMN bookings.venue_name IS
  'Historical snapshot of venue name at booking time. Always populated when venue is known. Render this in UI, not the joined coach_venues.name, to preserve historical accuracy.';

COMMENT ON COLUMN bookings.venue_address IS
  'Historical snapshot of venue address at booking time.';

COMMENT ON COLUMN bookings.availability_template_id IS
  'FK to the availability_template this booking was created against, for 1-on-1 bookings only. Group programme bookings remain NULL.';

-- RLS: existing bookings RLS policies cover these new columns
-- (they live on the same row). No new policies needed.


-- ────────────────────────────────────────────────────────────
-- DEV DATA BACKFILL — NOT A PRODUCTION PATTERN
-- ────────────────────────────────────────────────────────────
-- Existing seed bookings have no venue lineage. Backfill each
-- booking to its coach's primary venue (the first coach_venues
-- row per coach, ordered by created_at). This makes the Booking
-- Detail UI look complete in dev. Real bookings created via
-- POST /api/bookings (Step 5, B-11) must populate these fields
-- from the actual source (availability_template or group_programme).
--
-- Note: coach_venues has no deleted_at column (schema §3.9), so
-- there is no soft-delete filter on the subquery below.
-- ────────────────────────────────────────────────────────────

UPDATE bookings b
SET
  venue_id = cv.id,
  venue_name = cv.name,
  venue_address = COALESCE(cv.address, '')
FROM (
  SELECT DISTINCT ON (coach_profile_id)
    coach_profile_id,
    id,
    name,
    address
  FROM coach_venues
  ORDER BY coach_profile_id, created_at ASC
) cv
WHERE b.coach_profile_id = cv.coach_profile_id
  AND b.venue_id IS NULL
  AND b.deleted_at IS NULL;
