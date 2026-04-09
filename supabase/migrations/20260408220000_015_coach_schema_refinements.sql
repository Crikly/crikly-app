-- Migration 015: Coach Schema Refinements
-- Addresses schema gaps identified after C-03 coach design session
-- NOTE: Tables were created in Migration 014a. This migration adds missing columns only.
-- GAP-A: blocked_dates range + label support
-- GAP-E: availability_templates price override

-- ============================================================================
-- GAP-A: blocked_dates — add range + label support
-- ============================================================================

ALTER TABLE blocked_dates 
  ADD COLUMN IF NOT EXISTS blocked_date_end date,
  ADD COLUMN IF NOT EXISTS label text;

COMMENT ON COLUMN blocked_dates.blocked_date_end IS 'NULL = single date, non-null = range end date (inclusive)';
COMMENT ON COLUMN blocked_dates.label IS 'User-facing label shown in UI (e.g. "Easter", "Christmas holiday")';

-- Drop old unique constraint (prevented ranges for same coach)
ALTER TABLE blocked_dates 
  DROP CONSTRAINT IF EXISTS blocked_dates_coach_profile_id_blocked_date_key;

-- Note: Overlap validation handled in API layer (C-10)

-- ============================================================================
-- GAP-E: availability_templates — price override + session type link
-- ============================================================================

ALTER TABLE availability_templates
  ADD COLUMN IF NOT EXISTS price_override_pence integer 
    CHECK (price_override_pence >= 0),
  ADD COLUMN IF NOT EXISTS session_type_id uuid
    REFERENCES coach_session_types(id) ON DELETE SET NULL;

COMMENT ON COLUMN availability_templates.price_override_pence IS 'NULL = use sport default price, non-null = override price for this specific block';
COMMENT ON COLUMN availability_templates.session_type_id IS 'Links to coach_session_types for specific pricing/duration combo';

-- ============================================================================
-- coach_venues — rename columns to match design spec
-- ============================================================================

-- Rename venue_name to name, venue_address to address, is_primary to is_default
ALTER TABLE coach_venues 
  RENAME COLUMN venue_name TO name;

ALTER TABLE coach_venues 
  RENAME COLUMN venue_address TO address;

ALTER TABLE coach_venues 
  RENAME COLUMN is_primary TO is_default;

-- Make address nullable (not all venues need full address)
ALTER TABLE coach_venues 
  ALTER COLUMN address DROP NOT NULL;

-- Add postcode column for distance search
ALTER TABLE coach_venues
  ADD COLUMN IF NOT EXISTS postcode text;

COMMENT ON COLUMN coach_venues.is_default IS 'Default venue shown in coach profile and availability blocks';

-- ============================================================================
-- group_programmes — add missing columns for design spec
-- ============================================================================

-- Rename 'name' to 'title' to match design spec
ALTER TABLE group_programmes 
  RENAME COLUMN name TO title;

-- Add day_of_week and start_time for recurring schedule
ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS day_of_week integer 
    CHECK (day_of_week BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS start_time time;

-- Add current_spots to track enrolments
ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS current_spots integer NOT NULL DEFAULT 0 
    CHECK (current_spots >= 0);

-- Rename max_participants to max_spots
ALTER TABLE group_programmes
  RENAME COLUMN max_participants TO max_spots;

-- Add block pricing columns
ALTER TABLE group_programmes
  ADD COLUMN IF NOT EXISTS block_price_pence integer 
    CHECK (block_price_pence >= 0),
  ADD COLUMN IF NOT EXISTS block_session_count integer 
    CHECK (block_session_count > 0);

-- Rename payment_model to payment_type
ALTER TABLE group_programmes
  RENAME COLUMN payment_model TO payment_type;

-- Update payment_type check constraint
ALTER TABLE group_programmes
  DROP CONSTRAINT IF EXISTS group_programmes_payment_model_check;

ALTER TABLE group_programmes
  ADD CONSTRAINT group_programmes_payment_type_check 
    CHECK (payment_type IN ('per_session', 'block_upfront'));

-- Update status check constraint to match design spec
ALTER TABLE group_programmes
  DROP CONSTRAINT IF EXISTS group_programmes_status_check;

ALTER TABLE group_programmes
  ADD CONSTRAINT group_programmes_status_check 
    CHECK (status IN ('draft', 'active', 'full', 'completed', 'cancelled'));

-- ============================================================================
-- group_programme_enrolments — rename column
-- ============================================================================

-- Rename group_programme_id to programme_id for consistency
ALTER TABLE group_programme_enrolments
  RENAME COLUMN group_programme_id TO programme_id;

-- ============================================================================
-- End of Migration 015
-- ============================================================================
