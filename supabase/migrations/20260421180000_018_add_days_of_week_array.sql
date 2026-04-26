-- Migration 018: Add days_of_week array to group_programmes
-- Supports multi-day recurring programmes (e.g. Mon + Wed, Sat + Sun)
-- Keeps existing day_of_week integer for backwards compatibility

ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS days_of_week integer[]
  DEFAULT NULL;

COMMENT ON COLUMN group_programmes.days_of_week IS
  'Array of JS day numbers (0=Sun, 1=Mon ... 6=Sat). NULL means use day_of_week single value.';
