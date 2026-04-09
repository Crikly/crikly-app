-- Migration 014a: New coach tables
-- Part 1 of Migration 014 (coach schema additions)
-- Creates 5 new tables: coach_session_types, coach_venues, group_programmes,
-- group_programme_sessions, group_programme_enrolments

-- ============================================================================
-- TABLE 1: coach_session_types
-- Purpose: Pricing matrix — multiple durations at different prices per sport
-- ============================================================================

CREATE TABLE coach_session_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_sport_id uuid NOT NULL REFERENCES coach_sports(id) ON DELETE CASCADE,
  duration_minutes integer NOT NULL,
  price_individual_pence integer NULL,
  price_group_pence integer NULL,
  currency text NOT NULL DEFAULT 'GBP',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coach_sport_id, duration_minutes)
);

COMMENT ON TABLE coach_session_types IS 'Pricing matrix for different session durations per coach sport';
COMMENT ON COLUMN coach_session_types.price_individual_pence IS 'Price for 1-on-1 sessions in pence';
COMMENT ON COLUMN coach_session_types.price_group_pence IS 'Price per participant for group sessions in pence';

-- ============================================================================
-- TABLE 2: coach_venues
-- Purpose: Specific venues a coach regularly coaches at
-- ============================================================================

CREATE TABLE coach_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
  venue_name text NOT NULL,
  venue_address text NOT NULL,
  lat numeric(10,7) NULL,
  lng numeric(10,7) NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE coach_venues IS 'Specific venues where a coach regularly coaches';
COMMENT ON COLUMN coach_venues.is_primary IS 'Primary venue shown first in coach profile';

-- ============================================================================
-- TABLE 3: group_programmes
-- Purpose: Named group coaching programmes and shared slot group sessions
-- ============================================================================

CREATE TABLE group_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
  sport_id uuid NOT NULL REFERENCES sports(id),
  name text NOT NULL,
  description text NULL,
  model text NOT NULL CHECK (model IN ('programme', 'shared_slot')),
  schedule_type text NOT NULL CHECK (schedule_type IN ('fixed', 'rolling')),
  session_count integer NULL,
  skill_level text NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  age_groups text[] NOT NULL DEFAULT '{}',
  duration_minutes integer NOT NULL,
  max_participants integer NOT NULL,
  min_participants integer NULL,
  price_per_session_pence integer NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  payment_model text NOT NULL CHECK (payment_model IN ('per_session', 'block')),
  late_joining_allowed boolean NOT NULL DEFAULT false,
  cancellation_window_hours integer NOT NULL DEFAULT 24,
  coach_venue_id uuid NULL REFERENCES coach_venues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled')),
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE group_programmes IS 'Group coaching programmes (Model A) and shared slot sessions (Model B)';
COMMENT ON COLUMN group_programmes.model IS 'programme = Model A (named programme), shared_slot = Model B (recurring slot)';
COMMENT ON COLUMN group_programmes.schedule_type IS 'fixed = set dates, rolling = ongoing with no end date';
COMMENT ON COLUMN group_programmes.payment_model IS 'per_session = pay per session, block = pay upfront for all sessions';

-- ============================================================================
-- TABLE 4: group_programme_sessions
-- Purpose: Individual session occurrences within a programme
-- ============================================================================

CREATE TABLE group_programme_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_programme_id uuid NOT NULL REFERENCES group_programmes(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  coach_venue_id uuid NULL REFERENCES coach_venues(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  cancelled_at timestamptz NULL,
  cancellation_reason text NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE group_programme_sessions IS 'Individual session occurrences within a group programme';

-- ============================================================================
-- TABLE 5: group_programme_enrolments
-- Purpose: Each participant's enrolment in a programme
-- ============================================================================

CREATE TABLE group_programme_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_programme_id uuid NOT NULL REFERENCES group_programmes(id) ON DELETE CASCADE,
  child_profile_id uuid NULL REFERENCES child_profiles(id) ON DELETE SET NULL,
  player_profile_id uuid NULL REFERENCES player_profiles(id) ON DELETE SET NULL,
  booked_by_user_id uuid NOT NULL REFERENCES user_profiles(id),
  payment_type text NOT NULL CHECK (payment_type IN ('platform', 'offline')),
  payment_model text NOT NULL CHECK (payment_model IN ('per_session', 'block')),
  block_amount_pence integer NULL,
  sessions_paid_for integer NULL,
  joined_at_session_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed')),
  cancelled_at timestamptz NULL,
  cancellation_reason text NULL,
  refund_amount_pence integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE group_programme_enrolments IS 'Participant enrolments in group programmes';
COMMENT ON COLUMN group_programme_enrolments.joined_at_session_number IS 'Session number when participant joined (for late joiners, used in refund calculation per BR-18)';

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE coach_session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_programme_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_programme_enrolments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: coach_session_types
-- ============================================================================

-- SELECT: Public can view session types for live coaches
CREATE POLICY "coach_session_types_select_public"
  ON coach_session_types FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_sports cs
      JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
      WHERE cs.id = coach_session_types.coach_sport_id
        AND cp.is_profile_live = true
    )
  );

-- INSERT: Coaches can add their own session types
CREATE POLICY "coach_session_types_insert_own"
  ON coach_session_types FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_sports cs
      JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
      WHERE cs.id = coach_sport_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- UPDATE: Coaches can update their own session types
CREATE POLICY "coach_session_types_update_own"
  ON coach_session_types FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_sports cs
      JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
      WHERE cs.id = coach_session_types.coach_sport_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- DELETE: Coaches can delete their own session types
CREATE POLICY "coach_session_types_delete_own"
  ON coach_session_types FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM coach_sports cs
      JOIN coach_profiles cp ON cs.coach_profile_id = cp.id
      WHERE cs.id = coach_session_types.coach_sport_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES: coach_venues
-- ============================================================================

-- SELECT: Public can view venues for live coaches
CREATE POLICY "coach_venues_select_public"
  ON coach_venues FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = coach_venues.coach_profile_id
        AND cp.is_profile_live = true
    )
  );

-- INSERT: Coaches can add their own venues
CREATE POLICY "coach_venues_insert_own"
  ON coach_venues FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = coach_profile_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- UPDATE: Coaches can update their own venues
CREATE POLICY "coach_venues_update_own"
  ON coach_venues FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = coach_venues.coach_profile_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- DELETE: Coaches can delete their own venues
CREATE POLICY "coach_venues_delete_own"
  ON coach_venues FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = coach_venues.coach_profile_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES: group_programmes
-- ============================================================================

-- SELECT: Public can view active programmes
CREATE POLICY "group_programmes_select_public"
  ON group_programmes FOR SELECT
  USING (status = 'active');

-- INSERT: Coaches can create their own programmes
CREATE POLICY "group_programmes_insert_own"
  ON group_programmes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = coach_profile_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- UPDATE: Coaches can update their own programmes
CREATE POLICY "group_programmes_update_own"
  ON group_programmes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = group_programmes.coach_profile_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- DELETE: Coaches can delete their own programmes
CREATE POLICY "group_programmes_delete_own"
  ON group_programmes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM coach_profiles cp
      WHERE cp.id = group_programmes.coach_profile_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES: group_programme_sessions
-- ============================================================================

-- SELECT: Public can view sessions for active programmes
CREATE POLICY "group_programme_sessions_select_public"
  ON group_programme_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_programmes gp
      WHERE gp.id = group_programme_sessions.group_programme_id
        AND gp.status = 'active'
    )
  );

-- INSERT: Coaches can create sessions for their own programmes
CREATE POLICY "group_programme_sessions_insert_own"
  ON group_programme_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_programmes gp
      JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
      WHERE gp.id = group_programme_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- UPDATE: Coaches can update sessions for their own programmes
CREATE POLICY "group_programme_sessions_update_own"
  ON group_programme_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM group_programmes gp
      JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
      WHERE gp.id = group_programme_sessions.group_programme_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- DELETE: Coaches can delete sessions for their own programmes
CREATE POLICY "group_programme_sessions_delete_own"
  ON group_programme_sessions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM group_programmes gp
      JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
      WHERE gp.id = group_programme_sessions.group_programme_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- ============================================================================
-- RLS POLICIES: group_programme_enrolments
-- ============================================================================

-- SELECT: Coaches can view enrolments for their own programmes
CREATE POLICY "group_programme_enrolments_select_coach"
  ON group_programme_enrolments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_programmes gp
      JOIN coach_profiles cp ON gp.coach_profile_id = cp.id
      WHERE gp.id = group_programme_enrolments.group_programme_id
        AND cp.user_profile_id = auth.uid()
    )
  );

-- SELECT: Parents/players can view their own enrolments
CREATE POLICY "group_programme_enrolments_select_own"
  ON group_programme_enrolments FOR SELECT
  USING (booked_by_user_id = auth.uid());

-- INSERT: Authenticated users can create enrolments
CREATE POLICY "group_programme_enrolments_insert_auth"
  ON group_programme_enrolments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: Users can update their own enrolments
CREATE POLICY "group_programme_enrolments_update_own"
  ON group_programme_enrolments FOR UPDATE
  USING (booked_by_user_id = auth.uid());

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_coach_session_types_updated_at
  BEFORE UPDATE ON coach_session_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coach_venues_updated_at
  BEFORE UPDATE ON coach_venues
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_programmes_updated_at
  BEFORE UPDATE ON group_programmes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_programme_sessions_updated_at
  BEFORE UPDATE ON group_programme_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_group_programme_enrolments_updated_at
  BEFORE UPDATE ON group_programme_enrolments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INDEXES
-- ============================================================================

-- coach_session_types indexes
CREATE INDEX idx_coach_session_types_coach_sport_id
  ON coach_session_types(coach_sport_id);

-- coach_venues indexes
CREATE INDEX idx_coach_venues_coach_profile_id
  ON coach_venues(coach_profile_id);

-- group_programmes indexes
CREATE INDEX idx_group_programmes_coach_profile_id
  ON group_programmes(coach_profile_id);

CREATE INDEX idx_group_programmes_sport_id
  ON group_programmes(sport_id);

CREATE INDEX idx_group_programmes_status
  ON group_programmes(status);

-- group_programme_sessions indexes
CREATE INDEX idx_group_programme_sessions_group_programme_id
  ON group_programme_sessions(group_programme_id);

CREATE INDEX idx_group_programme_sessions_session_date
  ON group_programme_sessions(session_date);

-- group_programme_enrolments indexes
CREATE INDEX idx_group_programme_enrolments_group_programme_id
  ON group_programme_enrolments(group_programme_id);

CREATE INDEX idx_group_programme_enrolments_booked_by_user_id
  ON group_programme_enrolments(booked_by_user_id);
