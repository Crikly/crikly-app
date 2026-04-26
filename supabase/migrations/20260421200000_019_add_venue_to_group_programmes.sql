-- Migration 019: Add inline venue fields to group_programmes
-- Coaches enter venue name + address per programme via Google Places

ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS venue_name text NULL,
  ADD COLUMN IF NOT EXISTS venue_address text NULL;

COMMENT ON COLUMN group_programmes.venue_name IS
  'Venue display name entered by coach (e.g. Oval Cricket Ground)';
COMMENT ON COLUMN group_programmes.venue_address IS
  'Full venue address from Google Places autocomplete';
