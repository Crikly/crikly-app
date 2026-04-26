ALTER TABLE availability_templates
  ADD COLUMN IF NOT EXISTS venue_name text NULL,
  ADD COLUMN IF NOT EXISTS venue_address text NULL;

COMMENT ON COLUMN availability_templates.venue_name IS
  'Venue display name — free text from Google Places or manual entry';
COMMENT ON COLUMN availability_templates.venue_address IS
  'Full venue address from Google Places autocomplete';
