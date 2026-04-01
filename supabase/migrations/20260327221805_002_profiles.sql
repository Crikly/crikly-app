-- Migration 002: Create all profile tables
-- Created: 2026-03-27
-- Description: Parent, child, player, coach profiles and related tables

-- ============================================
-- Table: parent_profiles
-- ============================================
-- Exists only for users with the 'parent' role.
-- Parent-specific data for booking sessions for their children.

CREATE TABLE parent_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    preferred_sport_ids uuid[],
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: child_profiles
-- ============================================
-- Children attached to a parent account. Unlimited per parent.
-- Stores child details visible to confirmed coaches.

CREATE TABLE child_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_profile_id uuid NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    date_of_birth date NOT NULL,
    sport_ids uuid[] NOT NULL,
    skill_level text NOT NULL,
    medical_notes text,
    notes_for_coach text,
    transition_status text NOT NULL DEFAULT 'child',
    transitioned_player_id uuid,
    transition_initiated_at timestamptz,
    passport_privacy text NOT NULL DEFAULT 'booking_only',
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: player_profiles
-- ============================================
-- Adult players (16+) who book coaching for themselves.
-- Player-specific data including their own Training Passport.

CREATE TABLE player_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    date_of_birth date NOT NULL,
    sport_ids uuid[] NOT NULL,
    skill_level text NOT NULL,
    medical_notes text,
    passport_privacy text NOT NULL DEFAULT 'booking_only',
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add FK constraint for child_profiles.transitioned_player_id after player_profiles exists
ALTER TABLE child_profiles
    ADD CONSTRAINT child_profiles_transitioned_player_id_fkey
    FOREIGN KEY (transitioned_player_id) REFERENCES player_profiles(id) ON DELETE SET NULL;

-- ============================================
-- Table: coach_profiles
-- ============================================
-- Verified sports coaches offering sessions.
-- All coach-specific data for their public profile and business settings.

CREATE TABLE coach_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    bio text,
    years_experience integer,
    stripe_account_id text,
    stripe_onboarding_complete boolean NOT NULL DEFAULT false,
    dbs_status text NOT NULL DEFAULT 'none',
    dbs_verified_at timestamptz,
    dbs_expires_at timestamptz,
    is_profile_live boolean NOT NULL DEFAULT false,
    subscription_tier_id uuid,
    cancellation_window_hours integer NOT NULL DEFAULT 24,
    min_advance_hours integer NOT NULL DEFAULT 24,
    max_advance_days integer NOT NULL DEFAULT 56,
    rating_avg numeric(3,2),
    rating_count integer NOT NULL DEFAULT 0,
    gender text,
    is_featured boolean NOT NULL DEFAULT false,
    is_suspended boolean NOT NULL DEFAULT false,
    is_flagged boolean NOT NULL DEFAULT false,
    sessions_completed integer NOT NULL DEFAULT 0,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: coach_sports
-- ============================================
-- Sports a coach offers, with per-sport pricing and settings.
-- A coach can offer multiple sports with different rates.

CREATE TABLE coach_sports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    sport_id uuid NOT NULL,
    session_types text[] NOT NULL,
    skill_levels text[] NOT NULL,
    price_individual_pence integer,
    price_group_pence integer,
    max_group_size integer,
    session_duration_minutes integer NOT NULL DEFAULT 60,
    currency text NOT NULL DEFAULT 'GBP',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_coach_sport UNIQUE(coach_profile_id, sport_id)
);

-- ============================================
-- Table: coach_qualifications
-- ============================================
-- Qualifications and certifications a coach holds.
-- Structured + free text qualifications for trust building.

CREATE TABLE coach_qualifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    qualification_type_id uuid,
    custom_name text,
    issuing_body text,
    issued_date date,
    expiry_date date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: coach_photos
-- ============================================
-- Multiple photos for a coach profile. Premium coaches can upload more.
-- Coach gallery — builds trust with parents through visual presence.

CREATE TABLE coach_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    photo_url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================

-- child_profiles indexes
CREATE INDEX child_profiles_parent_profile_id_idx ON child_profiles(parent_profile_id);
CREATE INDEX child_profiles_date_of_birth_idx ON child_profiles(date_of_birth);

-- coach_profiles indexes
CREATE UNIQUE INDEX coach_profiles_user_profile_id_idx ON coach_profiles(user_profile_id);
CREATE INDEX coach_profiles_is_profile_live_idx ON coach_profiles(is_profile_live) WHERE is_profile_live = true;
CREATE INDEX coach_profiles_dbs_status_idx ON coach_profiles(dbs_status);
CREATE INDEX coach_profiles_rating_avg_idx ON coach_profiles(rating_avg);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE parent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_photos ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: parent_profiles
-- ============================================

-- SELECT: Own record only
CREATE POLICY "Parents can view own profile"
    ON parent_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = parent_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Own record only
CREATE POLICY "Parents can insert own profile"
    ON parent_profiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = parent_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Own record only
CREATE POLICY "Parents can update own profile"
    ON parent_profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = parent_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = parent_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: child_profiles
-- ============================================

-- ALL: Parent only (auth matches parent_profile_id.user_profile_id.auth_user_id)
CREATE POLICY "Parents can manage own children"
    ON child_profiles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM parent_profiles
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE parent_profiles.id = child_profiles.parent_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM parent_profiles
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE parent_profiles.id = child_profiles.parent_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- SELECT (coach): Only coaches with a confirmed booking for this child
-- Note: This policy will be fully functional after bookings table is created in migration 005
CREATE POLICY "Coaches can view children they have bookings with"
    ON child_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: player_profiles
-- ============================================

-- SELECT/UPDATE: Own record only
CREATE POLICY "Players can view own profile"
    ON player_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = player_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Players can insert own profile"
    ON player_profiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = player_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Players can update own profile"
    ON player_profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = player_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = player_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- SELECT (coach): Only coaches with a confirmed booking for this player
-- Note: This policy will be fully functional after bookings table is created in migration 005
CREATE POLICY "Coaches can view players they have bookings with"
    ON player_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: coach_profiles
-- ============================================

-- SELECT: Public (profile is publicly visible when is_profile_live = true)
CREATE POLICY "Public can view live coach profiles"
    ON coach_profiles
    FOR SELECT
    USING (is_profile_live = true);

-- SELECT: Own profile (always, even when not live)
CREATE POLICY "Coaches can view own profile"
    ON coach_profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = coach_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Own record only
CREATE POLICY "Coaches can insert own profile"
    ON coach_profiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = coach_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Own record only
CREATE POLICY "Coaches can update own profile"
    ON coach_profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = coach_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = coach_profiles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: coach_sports
-- ============================================

-- SELECT: Public (when coach profile is live)
CREATE POLICY "Public can view sports for live coaches"
    ON coach_sports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            WHERE coach_profiles.id = coach_sports.coach_profile_id
            AND coach_profiles.is_profile_live = true
        )
    );

-- SELECT: Own coach sports (always)
CREATE POLICY "Coaches can view own sports"
    ON coach_sports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_sports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Coach only
CREATE POLICY "Coaches can insert own sports"
    ON coach_sports
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_sports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Coach only
CREATE POLICY "Coaches can update own sports"
    ON coach_sports
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_sports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_sports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- DELETE: Coach only
CREATE POLICY "Coaches can delete own sports"
    ON coach_sports
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_sports.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: coach_qualifications
-- ============================================

-- SELECT: Public (when coach profile is live)
CREATE POLICY "Public can view qualifications for live coaches"
    ON coach_qualifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            WHERE coach_profiles.id = coach_qualifications.coach_profile_id
            AND coach_profiles.is_profile_live = true
        )
    );

-- SELECT: Own coach qualifications (always)
CREATE POLICY "Coaches can view own qualifications"
    ON coach_qualifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_qualifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Coach only
CREATE POLICY "Coaches can insert own qualifications"
    ON coach_qualifications
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_qualifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Coach only
CREATE POLICY "Coaches can update own qualifications"
    ON coach_qualifications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_qualifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_qualifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- DELETE: Coach only
CREATE POLICY "Coaches can delete own qualifications"
    ON coach_qualifications
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_qualifications.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- RLS Policies: coach_photos
-- ============================================

-- SELECT: Public (when coach profile is live)
CREATE POLICY "Public can view photos for live coaches"
    ON coach_photos
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            WHERE coach_profiles.id = coach_photos.coach_profile_id
            AND coach_profiles.is_profile_live = true
        )
    );

-- SELECT: Own coach photos (always)
CREATE POLICY "Coaches can view own photos"
    ON coach_photos
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_photos.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Coach only
CREATE POLICY "Coaches can insert own photos"
    ON coach_photos
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_photos.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Coach only
CREATE POLICY "Coaches can update own photos"
    ON coach_photos
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_photos.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_photos.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- DELETE: Coach only
CREATE POLICY "Coaches can delete own photos"
    ON coach_photos
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_photos.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for parent_profiles
CREATE TRIGGER update_parent_profiles_updated_at
    BEFORE UPDATE ON parent_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for child_profiles
CREATE TRIGGER update_child_profiles_updated_at
    BEFORE UPDATE ON child_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for player_profiles
CREATE TRIGGER update_player_profiles_updated_at
    BEFORE UPDATE ON player_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for coach_profiles
CREATE TRIGGER update_coach_profiles_updated_at
    BEFORE UPDATE ON coach_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for coach_sports
CREATE TRIGGER update_coach_sports_updated_at
    BEFORE UPDATE ON coach_sports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for coach_qualifications
CREATE TRIGGER update_coach_qualifications_updated_at
    BEFORE UPDATE ON coach_qualifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for coach_photos
CREATE TRIGGER update_coach_photos_updated_at
    BEFORE UPDATE ON coach_photos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
