-- Migration 050: child_sports / player_sports junction tables
-- Created: 2026-07-27
-- Task: P-01 (Block 1 parent schema foundations) — GAP-P-01 in task brief /
--   GAP-P-02 in docs/15 (REQ-P-015, REQ-P-021)
-- Description: Proper many-to-many between child/player profiles and sports,
--   carrying per-sport skill_level (REQ-P-015: "skill level moves off the
--   child record onto a per-sport record"). Mirrors coach_sports. The old
--   uuid[] columns (child_profiles.sport_ids, player_profiles.sport_ids) and
--   the profile-level skill_level columns are DROPPED — sport membership is
--   now derived from these tables.
--
-- Data safety (verified in Step 0, confirmed by Lasith): child_profiles and
--   player_profiles hold ZERO rows in local, staging AND production, and no
--   live code path reads or writes sport_ids / skill_level on either table
--   (coach booking routes select only full_name / date_of_birth). No
--   backfill required; the column drops destroy nothing.
--
-- skill_level values: beginner / intermediate / advanced — the platform's
--   person-skill set (coach group_programmes uses the same plus 'all', but
--   'all' is a filter concept, not a person's skill — migration 016).
--
-- FK behaviour:
--   *_profile_id → ON DELETE CASCADE (a profile's sport rows die with it,
--     matching coach_sports → coach_profiles).
--   sport_id → ON DELETE RESTRICT (sports is an admin list managed via
--     is_active, never hard-deleted — same reasoning as migration 042).
--
-- No deleted_at: mirrors coach_sports — junction rows are managed
--   membership, not user content; owners may hard-DELETE their own rows.
--
-- RLS:
--   - Parents manage (ALL) their own children's sport rows; players manage
--     their own — same ownership join chains as migration 002.
--   - Coaches may SELECT rows only for children/players they hold a
--     confirmed or completed booking with (session context: sport + skill).
--     Deliberately TIGHTER than the migration-002 child_profiles coach
--     policy (which is any-coach and already flagged for rework).
--
-- Risk: 🔴 High — drops columns from Phase-1 tables (empty everywhere) and
--   adds RLS on new tables. Approved by Lasith in Step 0.
--
-- Down migration (structure only — dropped-column data is unrecoverable,
-- moot at 0 rows):
--   DROP TABLE player_sports;
--   DROP TABLE child_sports;
--   ALTER TABLE child_profiles  ADD COLUMN sport_ids uuid[] NOT NULL DEFAULT '{}',
--                               ADD COLUMN skill_level text NOT NULL DEFAULT 'beginner';
--   ALTER TABLE player_profiles ADD COLUMN sport_ids uuid[] NOT NULL DEFAULT '{}',
--                               ADD COLUMN skill_level text NOT NULL DEFAULT 'beginner';

BEGIN;

-- ============================================
-- Table: child_sports
-- ============================================
-- Sports a child plays, with per-sport skill level. Parent > Child > Sport.

CREATE TABLE child_sports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    child_profile_id uuid NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
    sport_id uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    skill_level text NOT NULL
        CONSTRAINT child_sports_skill_level_check
        CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_child_sport UNIQUE(child_profile_id, sport_id)
);

-- ============================================
-- Table: player_sports
-- ============================================
-- Sports an adult player plays, with per-sport skill level (REQ-P-021).

CREATE TABLE player_sports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_profile_id uuid NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    sport_id uuid NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    skill_level text NOT NULL
        CONSTRAINT player_sports_skill_level_check
        CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_player_sport UNIQUE(player_profile_id, sport_id)
);

-- ============================================
-- Indexes
-- ============================================
-- profile_id-leading lookups are covered by the UNIQUE constraints' implicit
-- indexes; sport_id FKs need their own (Postgres adds none automatically —
-- same reasoning as migration 042).

CREATE INDEX child_sports_sport_id_idx ON child_sports(sport_id);
CREATE INDEX player_sports_sport_id_idx ON player_sports(sport_id);

-- ============================================
-- updated_at triggers (function from migration 001)
-- ============================================

CREATE TRIGGER update_child_sports_updated_at
    BEFORE UPDATE ON child_sports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_sports_updated_at
    BEFORE UPDATE ON player_sports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE child_sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_sports ENABLE ROW LEVEL SECURITY;

-- ALL: the child's parent (same ownership chain as migration 002
-- "Parents can manage own children").
CREATE POLICY "Parents can manage own child sports"
    ON child_sports
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM child_profiles
            JOIN parent_profiles ON parent_profiles.id = child_profiles.parent_profile_id
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE child_profiles.id = child_sports.child_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM child_profiles
            JOIN parent_profiles ON parent_profiles.id = child_profiles.parent_profile_id
            JOIN user_profiles ON user_profiles.id = parent_profiles.user_profile_id
            WHERE child_profiles.id = child_sports.child_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- SELECT (coach): only for children the coach holds a confirmed or
-- completed booking with — session context (BR-08 spirit: child data is
-- confirmed-coach only).
CREATE POLICY "Coaches can view sports for booked children"
    ON child_sports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN coach_profiles ON coach_profiles.id = bookings.coach_profile_id
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE bookings.child_profile_id = child_sports.child_profile_id
            AND bookings.status IN ('confirmed', 'completed')
            AND bookings.deleted_at IS NULL
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ALL: the player themself (same ownership chain as migration 002
-- player_profiles policies).
CREATE POLICY "Players can manage own sports"
    ON player_sports
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM player_profiles
            JOIN user_profiles ON user_profiles.id = player_profiles.user_profile_id
            WHERE player_profiles.id = player_sports.player_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM player_profiles
            JOIN user_profiles ON user_profiles.id = player_profiles.user_profile_id
            WHERE player_profiles.id = player_sports.player_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- SELECT (coach): only for players the coach holds a confirmed or
-- completed booking with.
CREATE POLICY "Coaches can view sports for booked players"
    ON player_sports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN coach_profiles ON coach_profiles.id = bookings.coach_profile_id
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE bookings.player_profile_id = player_sports.player_profile_id
            AND bookings.status IN ('confirmed', 'completed')
            AND bookings.deleted_at IS NULL
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- Drop the superseded array/scalar columns
-- ============================================
-- Zero rows + zero code references in every environment (Step 0, confirmed).

ALTER TABLE child_profiles
    DROP COLUMN sport_ids,
    DROP COLUMN skill_level;

ALTER TABLE player_profiles
    DROP COLUMN sport_ids,
    DROP COLUMN skill_level;

COMMIT;
