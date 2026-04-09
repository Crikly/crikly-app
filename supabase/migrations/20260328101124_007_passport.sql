-- Migration 007: Create Training Passport and reviews tables
-- Created: 2026-03-28
-- Description: Passport entries, performance reports, and reviews
-- Training Passport: Portable coaching history that follows child/player across coaches
-- Performance Reports: Premium coach feature for detailed assessments
-- Reviews: Trust building - visible on coach profiles

-- ============================================
-- Table: passport_entries
-- ============================================
-- Auto-created for every completed session. The core of the Training Passport.
-- Portable coaching history that follows a child or player across coaches.

CREATE TABLE passport_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    child_profile_id uuid REFERENCES child_profiles(id) ON DELETE RESTRICT,
    player_profile_id uuid REFERENCES player_profiles(id) ON DELETE RESTRICT,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    sport_id uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    session_date date NOT NULL,
    session_duration_minutes integer NOT NULL,
    coach_basic_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_duration CHECK (session_duration_minutes > 0),
    CONSTRAINT valid_profile CHECK (
        (child_profile_id IS NOT NULL AND player_profile_id IS NULL) OR
        (child_profile_id IS NULL AND player_profile_id IS NOT NULL)
    )
);

-- ============================================
-- Table: performance_reports
-- ============================================
-- Premium coach feature. Structured reports attached to passport entries.
-- Coaches write detailed performance assessments (Premium only).

CREATE TABLE performance_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_entry_id uuid NOT NULL REFERENCES passport_entries(id) ON DELETE RESTRICT,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    overall_rating integer,
    strengths text,
    areas_to_improve text,
    drills_homework text,
    coach_notes text,
    is_shared_with_parent boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_overall_rating CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5))
);

-- ============================================
-- Table: reviews
-- ============================================
-- Reviews left by parents/players after a session.
-- Trust building — visible on coach profile and search results.

CREATE TABLE reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    reviewer_user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    rating integer NOT NULL,
    comment text,
    is_visible boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_booking_review UNIQUE(booking_id),
    CONSTRAINT valid_rating CHECK (rating >= 1 AND rating <= 5)
);

-- ============================================
-- Indexes
-- ============================================

-- passport_entries indexes
CREATE INDEX passport_entries_booking_id_idx ON passport_entries(booking_id);
CREATE INDEX passport_entries_child_profile_id_idx ON passport_entries(child_profile_id) WHERE child_profile_id IS NOT NULL;
CREATE INDEX passport_entries_player_profile_id_idx ON passport_entries(player_profile_id) WHERE player_profile_id IS NOT NULL;
CREATE INDEX passport_entries_coach_profile_id_idx ON passport_entries(coach_profile_id);
CREATE INDEX passport_entries_sport_id_idx ON passport_entries(sport_id);
CREATE INDEX passport_entries_session_date_idx ON passport_entries(session_date);

-- performance_reports indexes
CREATE INDEX performance_reports_passport_entry_id_idx ON performance_reports(passport_entry_id);
CREATE INDEX performance_reports_coach_profile_id_idx ON performance_reports(coach_profile_id);

-- reviews indexes
CREATE INDEX reviews_coach_profile_id_idx ON reviews(coach_profile_id);
CREATE INDEX reviews_reviewer_user_id_idx ON reviews(reviewer_user_id);
CREATE INDEX reviews_is_visible_idx ON reviews(is_visible) WHERE is_visible = true;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE passport_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: passport_entries
-- ============================================

-- SELECT: Parent/player who owns the passport
CREATE POLICY "Parents can view own child passport entries"
    ON passport_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM child_profiles
            JOIN parent_profiles ON parent_profiles.id = child_profiles.parent_profile_id
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE child_profiles.id = passport_entries.child_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Players can view own passport entries"
    ON passport_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM player_profiles
            JOIN user_profiles ON user_profiles.id = player_profiles.user_profile_id
            WHERE player_profiles.id = passport_entries.player_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- SELECT (coach): Only coaches with confirmed booking for this child/player
CREATE POLICY "Coaches can view passport entries for their confirmed bookings"
    ON passport_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = passport_entries.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Service role only (auto-created on session completion)
-- No INSERT policy = service role only

-- UPDATE: Not permitted after creation
-- No UPDATE policy = no updates allowed

-- ============================================
-- RLS Policies: performance_reports
-- ============================================

-- SELECT: Parent/player who owns the passport (if is_shared_with_parent = true)
CREATE POLICY "Parents can view shared performance reports for own children"
    ON performance_reports
    FOR SELECT
    USING (
        is_shared_with_parent = true
        AND EXISTS (
            SELECT 1 FROM passport_entries
            JOIN child_profiles ON child_profiles.id = passport_entries.child_profile_id
            JOIN parent_profiles ON parent_profiles.id = child_profiles.parent_profile_id
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE passport_entries.id = performance_reports.passport_entry_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Players can view shared performance reports for themselves"
    ON performance_reports
    FOR SELECT
    USING (
        is_shared_with_parent = true
        AND EXISTS (
            SELECT 1 FROM passport_entries
            JOIN player_profiles ON player_profiles.id = passport_entries.player_profile_id
            JOIN user_profiles ON user_profiles.id = player_profiles.user_profile_id
            WHERE passport_entries.id = performance_reports.passport_entry_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- SELECT: Coach who wrote the report (can see all their reports including private notes)
CREATE POLICY "Coaches can view own performance reports"
    ON performance_reports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = performance_reports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Premium coach only, for their confirmed bookings
-- Note: Premium tier check must be enforced in application code
CREATE POLICY "Coaches can create performance reports for own sessions"
    ON performance_reports
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = performance_reports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1 FROM passport_entries
            WHERE passport_entries.id = performance_reports.passport_entry_id
            AND passport_entries.coach_profile_id = performance_reports.coach_profile_id
        )
    );

-- UPDATE: Coach only, within 7 days of session
-- Note: 7-day window must be enforced in application code
CREATE POLICY "Coaches can update own performance reports"
    ON performance_reports
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = performance_reports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = performance_reports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: reviews
-- ============================================

-- SELECT: Public (all visible reviews)
CREATE POLICY "Public can view visible reviews"
    ON reviews
    FOR SELECT
    USING (is_visible = true);

-- INSERT: Authenticated parent/player who made the booking
CREATE POLICY "Bookers can create reviews for own bookings"
    ON reviews
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN user_profiles ON user_profiles.id = bookings.booked_by_user_id
            WHERE bookings.id = reviews.booking_id
            AND user_profiles.auth_user_id = auth.uid()
            AND user_profiles.id = reviews.reviewer_user_id
        )
    );

-- UPDATE: Not permitted (reviews are permanent)
-- No UPDATE policy = no updates allowed

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for passport_entries
CREATE TRIGGER update_passport_entries_updated_at
    BEFORE UPDATE ON passport_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for performance_reports
CREATE TRIGGER update_performance_reports_updated_at
    BEFORE UPDATE ON performance_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: reviews table has no updated_at trigger (immutable)
