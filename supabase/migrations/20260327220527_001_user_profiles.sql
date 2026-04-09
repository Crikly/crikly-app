-- Migration 001: Create user_profiles and user_roles tables
-- Created: 2026-03-27
-- Description: Core identity and auth tables extending Supabase auth.users

-- ============================================
-- Table: user_profiles
-- ============================================
-- One row per registered user. Extends Supabase auth.users.
-- Stores shared identity data used across all roles.

CREATE TABLE user_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text NOT NULL,
    avatar_url text,
    phone text,
    whatsapp_number text,
    location_city text,
    location_postcode text,
    location_lat numeric(10,7),
    location_lng numeric(10,7),
    country_code text NOT NULL DEFAULT 'GB',
    active_role text NOT NULL DEFAULT 'parent',
    auth_provider text NOT NULL DEFAULT 'email',
    terms_accepted_at timestamptz,
    deletion_requested_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: user_roles
-- ============================================
-- Tracks which roles a user has activated.
-- One row per role per user. Multi-role account support.

CREATE TABLE user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_profile_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_role UNIQUE(user_profile_id, role)
);

-- ============================================
-- Indexes
-- ============================================

-- user_profiles indexes
CREATE UNIQUE INDEX user_profiles_auth_user_id_idx ON user_profiles(auth_user_id);
CREATE INDEX user_profiles_deleted_at_idx ON user_profiles(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on both tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: user_profiles
-- ============================================

-- SELECT: Own record only
CREATE POLICY "Users can view own profile"
    ON user_profiles
    FOR SELECT
    USING (auth.uid() = auth_user_id);

-- INSERT: Own record only
CREATE POLICY "Users can insert own profile"
    ON user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = auth_user_id);

-- UPDATE: Own record only
CREATE POLICY "Users can update own profile"
    ON user_profiles
    FOR UPDATE
    USING (auth.uid() = auth_user_id)
    WITH CHECK (auth.uid() = auth_user_id);

-- DELETE: Not permitted (soft delete via deleted_at)
-- No DELETE policy = no one can hard delete

-- ============================================
-- RLS Policies: user_roles
-- ============================================

-- SELECT: Own records only
CREATE POLICY "Users can view own roles"
    ON user_roles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = user_roles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT: Own records only
CREATE POLICY "Users can insert own roles"
    ON user_roles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = user_roles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- UPDATE: Own records only
CREATE POLICY "Users can update own roles"
    ON user_roles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = user_roles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = user_roles.user_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for user_profiles
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_roles
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
