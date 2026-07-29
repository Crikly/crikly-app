-- PILOT-01: manual coach approval for pilot launch.
-- Three states on coach_profiles:
--   submitted_for_review_at NULL                        → draft (still building)
--   submitted_for_review_at NOT NULL + is_profile_live=false → pending approval
--   submitted_for_review_at NOT NULL + is_profile_live=true  → live
ALTER TABLE coach_profiles
  ADD COLUMN submitted_for_review_at timestamptz NULL;

-- Coaches already live predate the review flow. NULL + live=true would be a
-- fourth, undefined state — backfill so the invariant above holds everywhere.
UPDATE coach_profiles
SET submitted_for_review_at = updated_at
WHERE is_profile_live = true;

-- Enforce the invariant at the DB layer (043's held_reason_iff_held pattern):
-- a live profile must always carry its submission timestamp. Validates against
-- existing data because the backfill above runs first in the same migration.
ALTER TABLE coach_profiles
  ADD CONSTRAINT valid_review_state
  CHECK (NOT (is_profile_live = true AND submitted_for_review_at IS NULL));

-- Approval-queue shape: pending = submitted but not yet live. Partial index
-- now, while the table is small (L-02d p95 target as coach volume grows).
CREATE INDEX idx_coach_profiles_pending_review
  ON coach_profiles (submitted_for_review_at)
  WHERE submitted_for_review_at IS NOT NULL AND is_profile_live = false;
