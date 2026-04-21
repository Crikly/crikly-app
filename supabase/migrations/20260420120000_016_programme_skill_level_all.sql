-- Migration 016: Expand group_programmes skill_level to include 'all'
-- 'All levels' is a valid UI option meaning no skill filter.

ALTER TABLE group_programmes
  DROP CONSTRAINT IF EXISTS group_programmes_skill_level_check;

ALTER TABLE group_programmes
  ADD CONSTRAINT group_programmes_skill_level_check
    CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'all'));
