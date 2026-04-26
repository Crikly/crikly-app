-- Migration 020: Add participant_name to group_programme_enrolments
-- Replaces the cancellation_reason workaround for offline participants

ALTER TABLE group_programme_enrolments
  ADD COLUMN IF NOT EXISTS participant_name text NULL;

COMMENT ON COLUMN group_programme_enrolments.participant_name IS
  'Display name for offline/cash participants added manually by coach.
   NULL for platform enrolments (use child_profiles.full_name instead).
   Replaces the cancellation_reason workaround from CF-05c.';
