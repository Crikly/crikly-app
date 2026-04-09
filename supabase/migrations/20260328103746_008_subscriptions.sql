-- Migration 008: Create subscription and tier tables
-- Created: 2026-03-28
-- Description: Subscription tiers, tier features, coach subscriptions, and tier usage tracking
-- Fully configurable tier engine — new tiers without code changes

-- ============================================
-- Table: subscription_tiers
-- ============================================
-- Admin-configurable subscription plans for coaches.
-- Fully configurable tier engine — new tiers without code changes.

CREATE TABLE subscription_tiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    price_monthly_pence integer NOT NULL DEFAULT 0,
    price_annual_pence integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'GBP',
    stripe_monthly_price_id text,
    stripe_annual_price_id text,
    is_active boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_tier_slug UNIQUE(slug),
    CONSTRAINT valid_prices CHECK (price_monthly_pence >= 0 AND price_annual_pence >= 0)
);

-- ============================================
-- Table: tier_features
-- ============================================
-- Feature toggles and limits per subscription tier. Admin-configurable.
-- Define what each tier includes without code changes.

CREATE TABLE tier_features (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_id uuid NOT NULL REFERENCES subscription_tiers(id) ON DELETE CASCADE,
    feature_key text NOT NULL,
    is_enabled boolean NOT NULL DEFAULT false,
    usage_limit integer,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_tier_feature UNIQUE(tier_id, feature_key)
);

-- ============================================
-- Table: coach_subscriptions
-- ============================================
-- Tracks a coach's active subscription.
-- Which tier is a coach on, and when does it renew.

CREATE TABLE coach_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    tier_id uuid NOT NULL REFERENCES subscription_tiers(id) ON DELETE RESTRICT,
    billing_period text,
    stripe_subscription_id text,
    stripe_customer_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_billing_period CHECK (billing_period IS NULL OR billing_period IN ('monthly', 'annual')),
    CONSTRAINT valid_subscription_status CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing'))
);

-- ============================================
-- Table: tier_usage
-- ============================================
-- Tracks monthly feature usage against limits for free tier coaches.
-- Enforce usage limits (e.g. max 2 group sessions/month on Free).

CREATE TABLE tier_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE CASCADE,
    feature_key text NOT NULL,
    usage_month date NOT NULL,
    usage_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_coach_feature_month UNIQUE(coach_profile_id, feature_key, usage_month),
    CONSTRAINT valid_usage_count CHECK (usage_count >= 0)
);

-- ============================================
-- Indexes
-- ============================================

-- subscription_tiers indexes
CREATE INDEX subscription_tiers_slug_idx ON subscription_tiers(slug);
CREATE INDEX subscription_tiers_is_active_idx ON subscription_tiers(is_active) WHERE is_active = true;

-- tier_features indexes
CREATE INDEX tier_features_tier_id_idx ON tier_features(tier_id);
CREATE INDEX tier_features_feature_key_idx ON tier_features(feature_key);

-- coach_subscriptions indexes
CREATE INDEX coach_subscriptions_coach_profile_id_idx ON coach_subscriptions(coach_profile_id);
CREATE INDEX coach_subscriptions_tier_id_idx ON coach_subscriptions(tier_id);
CREATE INDEX coach_subscriptions_status_idx ON coach_subscriptions(status);

-- tier_usage indexes
CREATE INDEX tier_usage_coach_profile_id_idx ON tier_usage(coach_profile_id);
CREATE INDEX tier_usage_feature_key_idx ON tier_usage(feature_key);
CREATE INDEX tier_usage_usage_month_idx ON tier_usage(usage_month);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tier_usage ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: subscription_tiers
-- ============================================

-- SELECT: Public
CREATE POLICY "Public can view active subscription tiers"
    ON subscription_tiers
    FOR SELECT
    USING (true);

-- INSERT/UPDATE/DELETE: Admin only (no policies = admin/service role only)
-- No INSERT, UPDATE, or DELETE policies means only service role can perform these operations

-- ============================================
-- RLS Policies: tier_features
-- ============================================

-- SELECT: Public
CREATE POLICY "Public can view tier features"
    ON tier_features
    FOR SELECT
    USING (true);

-- INSERT/UPDATE/DELETE: Admin only (no policies = admin/service role only)
-- No INSERT, UPDATE, or DELETE policies means only service role can perform these operations

-- ============================================
-- RLS Policies: coach_subscriptions
-- ============================================

-- SELECT: Coach who owns the subscription
CREATE POLICY "Coaches can view own subscription"
    ON coach_subscriptions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = coach_subscriptions.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT/UPDATE: Service role only (no user policies = service role only)
-- No INSERT or UPDATE policies means only service role can perform these operations

-- ============================================
-- RLS Policies: tier_usage
-- ============================================

-- SELECT: Coach only
CREATE POLICY "Coaches can view own tier usage"
    ON tier_usage
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = tier_usage.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT/UPDATE: Service role only (no user policies = service role only)
-- No INSERT or UPDATE policies means only service role can perform these operations

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for subscription_tiers
CREATE TRIGGER update_subscription_tiers_updated_at
    BEFORE UPDATE ON subscription_tiers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tier_features
CREATE TRIGGER update_tier_features_updated_at
    BEFORE UPDATE ON tier_features
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for coach_subscriptions
CREATE TRIGGER update_coach_subscriptions_updated_at
    BEFORE UPDATE ON coach_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tier_usage
CREATE TRIGGER update_tier_usage_updated_at
    BEFORE UPDATE ON tier_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed Data: Subscription Tiers
-- ============================================

INSERT INTO subscription_tiers (name, slug, description, price_monthly_pence, price_annual_pence, is_default, is_active, sort_order)
VALUES
    ('Free', 'free', 'Get started with basic features', 0, 0, true, true, 1),
    ('Premium', 'premium', 'Unlock advanced features and grow your coaching business', 999, 8999, false, true, 2);

-- ============================================
-- Seed Data: Tier Features
-- ============================================

-- Get tier IDs for seed data
DO $$
DECLARE
    free_tier_id uuid;
    premium_tier_id uuid;
BEGIN
    -- Get tier IDs
    SELECT id INTO free_tier_id FROM subscription_tiers WHERE slug = 'free';
    SELECT id INTO premium_tier_id FROM subscription_tiers WHERE slug = 'premium';

    -- Free tier features
    INSERT INTO tier_features (tier_id, feature_key, is_enabled, usage_limit) VALUES
        (free_tier_id, 'group_sessions', true, 2),
        (free_tier_id, 'training_passport', true, null),
        (free_tier_id, 'performance_reports', false, null),
        (free_tier_id, 'featured_search', false, null),
        (free_tier_id, 'advanced_analytics', false, null),
        (free_tier_id, 'tax_dashboard', false, null),
        (free_tier_id, 'sports_listed', true, 1),
        (free_tier_id, 'profile_photos', true, 3);

    -- Premium tier features
    INSERT INTO tier_features (tier_id, feature_key, is_enabled, usage_limit) VALUES
        (premium_tier_id, 'group_sessions', true, null),
        (premium_tier_id, 'training_passport', true, null),
        (premium_tier_id, 'performance_reports', true, null),
        (premium_tier_id, 'featured_search', true, null),
        (premium_tier_id, 'advanced_analytics', true, null),
        (premium_tier_id, 'tax_dashboard', true, null),
        (premium_tier_id, 'sports_listed', true, 3),
        (premium_tier_id, 'profile_photos', true, 10);
END $$;
