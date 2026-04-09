-- Migration 003: Create platform configuration tables
-- Created: 2026-03-28
-- Description: Sports, qualification types, countries, platform config, and feature flags

-- ============================================
-- Table: sports
-- ============================================
-- Admin-configured list of sports and activities available on the platform.
-- Generic sport table — adding a new sport is one row, zero code changes.

CREATE TABLE sports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    icon_url text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_sport_slug UNIQUE(slug)
);

-- ============================================
-- Table: qualification_types
-- ============================================
-- Admin-defined list of coaching qualifications coaches can select.
-- Structured qualification list for filtering and trust.

CREATE TABLE qualification_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sport_id uuid REFERENCES sports(id) ON DELETE CASCADE,
    name text NOT NULL,
    issuing_body text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: countries
-- ============================================
-- Admin-configured list of countries the platform operates in.
-- Multi-country support — adding a new country is config, not code.

CREATE TABLE countries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL,
    name text NOT NULL,
    currency_code text NOT NULL,
    default_commission_rate numeric(5,4) NOT NULL DEFAULT 0.1000,
    payout_delay_hours integer NOT NULL DEFAULT 48,
    default_cancellation_hours integer NOT NULL DEFAULT 24,
    default_min_advance_hours integer NOT NULL DEFAULT 24,
    default_max_advance_days integer NOT NULL DEFAULT 56,
    tax_year_start_month integer NOT NULL DEFAULT 4,
    is_active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_country_code UNIQUE(code)
);

-- ============================================
-- Table: platform_config
-- ============================================
-- Global platform configuration values. Single row table.
-- Admin-configurable business rules that affect the whole platform.

CREATE TABLE platform_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    default_commission_rate numeric(5,4) NOT NULL DEFAULT 0.1000,
    default_payout_delay_hours integer NOT NULL DEFAULT 48,
    default_cancellation_hours integer NOT NULL DEFAULT 24,
    default_min_advance_hours integer NOT NULL DEFAULT 24,
    default_max_advance_days integer NOT NULL DEFAULT 56,
    dbs_verification_fee_pence integer NOT NULL DEFAULT 2999,
    dbs_fee_currency text NOT NULL DEFAULT 'GBP',
    max_featured_coaches_per_page integer NOT NULL DEFAULT 3,
    child_transition_age integer NOT NULL DEFAULT 16,
    child_transition_window_days integer NOT NULL DEFAULT 30,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Table: feature_flags
-- ============================================
-- Admin-controlled feature toggles. No deployment needed to enable/disable features.
-- Enable gradual rollouts, A/B testing, rapid response to issues.

CREATE TABLE feature_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_feature_flag_key UNIQUE(key)
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE sports ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualification_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: sports
-- ============================================

-- SELECT: Public
CREATE POLICY "Public can view sports"
    ON sports
    FOR SELECT
    USING (true);

-- INSERT/UPDATE/DELETE: Admin only (placeholder - will be implemented when admin_roles table exists)
-- For now, these operations will require service role key

-- ============================================
-- RLS Policies: qualification_types
-- ============================================

-- SELECT: Public
CREATE POLICY "Public can view qualification types"
    ON qualification_types
    FOR SELECT
    USING (true);

-- INSERT/UPDATE/DELETE: Admin only (placeholder - will be implemented when admin_roles table exists)

-- ============================================
-- RLS Policies: countries
-- ============================================

-- SELECT: Public
CREATE POLICY "Public can view countries"
    ON countries
    FOR SELECT
    USING (true);

-- INSERT/UPDATE/DELETE: Admin only (placeholder - will be implemented when admin_roles table exists)

-- ============================================
-- RLS Policies: platform_config
-- ============================================

-- SELECT: Authenticated users
CREATE POLICY "Authenticated users can view platform config"
    ON platform_config
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- UPDATE: Admin only (placeholder - will be implemented when admin_roles table exists)

-- ============================================
-- RLS Policies: feature_flags
-- ============================================

-- SELECT: Authenticated users
CREATE POLICY "Authenticated users can view feature flags"
    ON feature_flags
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE: Admin only (placeholder - will be implemented when admin_roles table exists)

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for sports
CREATE TRIGGER update_sports_updated_at
    BEFORE UPDATE ON sports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for countries
CREATE TRIGGER update_countries_updated_at
    BEFORE UPDATE ON countries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for platform_config
CREATE TRIGGER update_platform_config_updated_at
    BEFORE UPDATE ON platform_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for feature_flags
CREATE TRIGGER update_feature_flags_updated_at
    BEFORE UPDATE ON feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed Data
-- ============================================

-- Seed sports: Cricket as first sport
INSERT INTO sports (name, slug, is_active, sort_order)
VALUES ('Cricket', 'cricket', true, 1);

-- Seed countries: United Kingdom with GBP currency
INSERT INTO countries (code, name, currency_code, is_active)
VALUES ('GB', 'United Kingdom', 'GBP', true);

-- Seed platform_config: Single row with default values
INSERT INTO platform_config (
    default_commission_rate,
    default_payout_delay_hours,
    default_cancellation_hours,
    default_min_advance_hours,
    default_max_advance_days,
    dbs_verification_fee_pence,
    dbs_fee_currency,
    max_featured_coaches_per_page,
    child_transition_age,
    child_transition_window_days
) VALUES (
    0.1000,
    48,
    24,
    24,
    56,
    2999,
    'GBP',
    3,
    16,
    30
);

-- Seed feature_flags: All flags set to false initially
INSERT INTO feature_flags (key, enabled, description) VALUES
    ('training_passport', false, 'Enable Training Passport feature for players and children'),
    ('group_sessions', false, 'Enable group session bookings'),
    ('performance_reports', false, 'Enable performance reports from coaches'),
    ('coach_subscriptions', false, 'Enable tiered subscription plans for coaches'),
    ('multi_sport_search', false, 'Enable searching for coaches across multiple sports'),
    ('advanced_filters', false, 'Enable advanced search filters (gender, DBS status, etc.)'),
    ('chat_messaging', false, 'Enable in-app messaging between parents and coaches'),
    ('video_uploads', false, 'Enable video uploads in Training Passport'),
    ('stripe_connect', false, 'Enable Stripe Connect for coach payouts'),
    ('email_notifications', false, 'Enable email notifications via Resend'),
    ('push_notifications', false, 'Enable push notifications via OneSignal');
