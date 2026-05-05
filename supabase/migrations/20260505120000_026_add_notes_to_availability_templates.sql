ALTER TABLE availability_templates
  ADD COLUMN IF NOT EXISTS notes text NULL;

COMMENT ON COLUMN availability_templates.notes IS
  'Coach-only memo for ad-hoc availability slots — free text, optional';
