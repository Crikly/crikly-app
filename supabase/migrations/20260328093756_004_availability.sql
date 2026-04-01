-- Migration 004: Create availability and scheduling tables
-- Created: 2026-03-28
-- Description: Availability templates and blocked dates for coach scheduling

-- ============================================
-- Table: availability_templates
-- ============================================
-- Weekly recurring availability pattern for a coach per sport.
-- Coach sets their schedule once — it repeats automatically.

CREATE TABLE availability_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    sport_id uuid REFERENCES sports(id) ON DELETE CASCADE,
    day_of_week integer NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- ============================================
-- Table: blocked_dates
-- ============================================
-- Specific dates a coach is unavailable despite their weekly template.
-- Holidays, personal time, events — override the recurring template.

CREATE TABLE blocked_dates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    blocked_date date NOT NULL,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_coach_blocked_date UNIQUE(coach_profile_id, blocked_date)
);

-- ============================================
-- Indexes
-- ============================================

-- availability_templates indexes
CREATE INDEX availability_templates_coach_profile_id_idx ON availability_templates(coach_profile_id);
CREATE INDEX availability_templates_coach_day_idx ON availability_templates(coach_profile_id, day_of_week);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on both tables
ALTER TABLE availability_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: availability_templates
-- ============================================

-- SELECT: Public (used to show availability in search)
CREATE POLICY "Public can view availability templates"
    ON availability_templates
    FOR SELECT
    USING (true);

-- INSERT: Coach only
CREATE POLICY "Coaches can insert own availability templates"
    ON availability_templates
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = availability_templates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Coach only
CREATE POLICY "Coaches can update own availability templates"
    ON availability_templates
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = availability_templates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = availability_templates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- DELETE: Coach only
CREATE POLICY "Coaches can delete own availability templates"
    ON availability_templates
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = availability_templates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: blocked_dates
-- ============================================

-- SELECT: Coach only (blocked dates are private)
CREATE POLICY "Coaches can view own blocked dates"
    ON blocked_dates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = blocked_dates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Coach only
CREATE POLICY "Coaches can insert own blocked dates"
    ON blocked_dates
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = blocked_dates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Coach only
CREATE POLICY "Coaches can update own blocked dates"
    ON blocked_dates
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = blocked_dates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = blocked_dates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- DELETE: Coach only
CREATE POLICY "Coaches can delete own blocked dates"
    ON blocked_dates
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = blocked_dates.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for availability_templates
CREATE TRIGGER update_availability_templates_updated_at
    BEFORE UPDATE ON availability_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for blocked_dates
CREATE TRIGGER update_blocked_dates_updated_at
    BEFORE UPDATE ON blocked_dates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
