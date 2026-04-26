-- Add human-readable slug to coach_profiles (L-UX01)
-- Nullable initially so existing rows are not affected.
-- Uniqueness enforced at DB level; application generates slugs with -2/-3 suffix on collision.

ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS slug text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_coach_profiles_slug
  ON coach_profiles (slug)
  WHERE slug IS NOT NULL;
