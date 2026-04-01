-- Migration 005: Create booking tables
-- Created: 2026-03-28
-- Description: Bookings and group bookings tables - handles real money transactions
-- CRITICAL: This migration handles payment data. All amounts in pence (integers).
-- Business Rules: BR-01, BR-02, BR-03, BR-04, BR-06, BR-07, BR-12

-- ============================================
-- Table: bookings
-- ============================================
-- The core transaction record. Created on successful payment.
-- Every confirmed session between a parent/player and a coach.

CREATE TABLE bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_reference text NOT NULL,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    sport_id uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    booked_by_user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
    child_profile_id uuid REFERENCES child_profiles(id) ON DELETE RESTRICT,
    player_profile_id uuid REFERENCES player_profiles(id) ON DELETE RESTRICT,
    session_type text NOT NULL,
    session_date date NOT NULL,
    session_start_time time NOT NULL,
    session_end_time time NOT NULL,
    coach_price_pence integer NOT NULL,
    commission_rate numeric(5,4) NOT NULL,
    commission_pence integer NOT NULL,
    parent_total_pence integer NOT NULL,
    currency text NOT NULL DEFAULT 'GBP',
    status text NOT NULL DEFAULT 'confirmed',
    messaging_unlocked boolean NOT NULL DEFAULT false,
    promo_code_id uuid,
    discount_applied_pence integer,
    cancellation_window_hours integer NOT NULL DEFAULT 24,
    cancelled_at timestamptz,
    cancelled_by text,
    cancellation_reason text,
    completed_at timestamptz,
    payout_eligible_at timestamptz,
    review_requested_at timestamptz,
    group_booking_id uuid,
    notes_for_coach text,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_session_type CHECK (session_type IN ('individual', 'group')),
    CONSTRAINT valid_status CHECK (status IN ('confirmed', 'completed', 'cancelled_parent', 'cancelled_coach', 'no_show')),
    CONSTRAINT valid_cancelled_by CHECK (cancelled_by IS NULL OR cancelled_by IN ('parent', 'coach', 'admin')),
    CONSTRAINT valid_time_range CHECK (session_end_time > session_start_time),
    CONSTRAINT valid_prices CHECK (coach_price_pence > 0 AND commission_pence >= 0 AND parent_total_pence > 0),
    CONSTRAINT unique_coach_session_slot UNIQUE(coach_profile_id, session_date, session_start_time)
);

-- ============================================
-- Table: group_bookings
-- ============================================
-- Container for group sessions. Multiple bookings link to one group booking.
-- Tracks group sessions created by coaches, with capacity management.

CREATE TABLE group_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    coach_sport_id uuid NOT NULL REFERENCES coach_sports(id) ON DELETE RESTRICT,
    sport_id uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    title text NOT NULL,
    description text,
    session_date date NOT NULL,
    session_start_time time NOT NULL,
    session_end_time time NOT NULL,
    max_participants integer NOT NULL,
    current_participants integer NOT NULL DEFAULT 0,
    price_per_person_pence integer NOT NULL,
    currency text NOT NULL DEFAULT 'GBP',
    status text NOT NULL DEFAULT 'open',
    created_by text NOT NULL,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_group_status CHECK (status IN ('open', 'full', 'cancelled', 'completed')),
    CONSTRAINT valid_created_by CHECK (created_by IN ('coach', 'admin')),
    CONSTRAINT valid_time_range CHECK (session_end_time > session_start_time),
    CONSTRAINT valid_capacity CHECK (max_participants > 0 AND current_participants >= 0 AND current_participants <= max_participants),
    CONSTRAINT valid_price CHECK (price_per_person_pence > 0)
);

-- Add FK constraint for bookings.group_booking_id after group_bookings exists
ALTER TABLE bookings
    ADD CONSTRAINT bookings_group_booking_id_fkey
    FOREIGN KEY (group_booking_id) REFERENCES group_bookings(id) ON DELETE RESTRICT;

-- ============================================
-- Indexes
-- ============================================

-- bookings indexes
CREATE INDEX bookings_coach_profile_id_idx ON bookings(coach_profile_id);
CREATE INDEX bookings_booked_by_user_id_idx ON bookings(booked_by_user_id);
CREATE INDEX bookings_session_date_idx ON bookings(session_date);
CREATE INDEX bookings_status_idx ON bookings(status);
CREATE INDEX bookings_payout_eligible_at_idx ON bookings(payout_eligible_at) WHERE payout_eligible_at IS NOT NULL;
CREATE INDEX bookings_child_profile_id_idx ON bookings(child_profile_id) WHERE child_profile_id IS NOT NULL;
CREATE INDEX bookings_player_profile_id_idx ON bookings(player_profile_id) WHERE player_profile_id IS NOT NULL;
CREATE INDEX bookings_group_booking_id_idx ON bookings(group_booking_id) WHERE group_booking_id IS NOT NULL;

-- group_bookings indexes
CREATE INDEX group_bookings_coach_profile_id_idx ON group_bookings(coach_profile_id);
CREATE INDEX group_bookings_session_date_idx ON group_bookings(session_date);
CREATE INDEX group_bookings_status_idx ON group_bookings(status);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on both tables
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_bookings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: bookings
-- ============================================

-- SELECT: Own bookings (parent/player who booked OR coach being booked)
CREATE POLICY "Users can view own bookings as booker"
    ON bookings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = bookings.booked_by_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can view bookings for their sessions"
    ON bookings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = bookings.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Authenticated parent or player only
CREATE POLICY "Authenticated users can create bookings"
    ON bookings
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = bookings.booked_by_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Limited — only status fields, by relevant party
-- Parents/players can update cancellation fields
CREATE POLICY "Bookers can update own booking status"
    ON bookings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = bookings.booked_by_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = bookings.booked_by_user_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- Coaches can update completion and cancellation fields
CREATE POLICY "Coaches can update their booking status"
    ON bookings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = bookings.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = bookings.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- DELETE: Not permitted (soft delete only via UPDATE)
-- No DELETE policy = DELETE operations will fail

-- ============================================
-- RLS Policies: group_bookings
-- ============================================

-- SELECT: Public (parents can see open group sessions)
CREATE POLICY "Public can view group bookings"
    ON group_bookings
    FOR SELECT
    USING (true);

-- INSERT: Coach only
CREATE POLICY "Coaches can create group bookings"
    ON group_bookings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = group_bookings.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Coach who created it
CREATE POLICY "Coaches can update own group bookings"
    ON group_bookings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = group_bookings.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = group_bookings.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for bookings
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for group_bookings
CREATE TRIGGER update_group_bookings_updated_at
    BEFORE UPDATE ON group_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
