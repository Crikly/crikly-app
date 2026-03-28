-- Seed Data for Crikly Platform
-- Created: 2026-03-28
-- Description: Initial data required for platform to function
-- This file can be re-run safely using ON CONFLICT DO NOTHING

-- ============================================
-- Sports
-- ============================================
-- Cricket as the first sport

INSERT INTO sports (name, slug, description, is_active)
VALUES (
    'Cricket',
    'cricket',
    'Cricket coaching for all ages and skill levels',
    true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Countries
-- ============================================
-- United Kingdom as the first country

INSERT INTO countries (code, name, currency, is_active)
VALUES (
    'GB',
    'United Kingdom',
    'GBP',
    true
)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Platform Config
-- ============================================
-- Default platform configuration values

INSERT INTO platform_config (
    key,
    value,
    description
)
VALUES
    ('default_commission_rate', '0.1000', 'Default commission rate (10%)'),
    ('default_payout_delay_hours', '48', 'Hours after session completion before payout is eligible'),
    ('default_cancellation_hours', '24', 'Default cancellation window in hours'),
    ('default_min_advance_hours', '24', 'Minimum hours in advance for booking'),
    ('default_max_advance_days', '56', 'Maximum days in advance for booking'),
    ('dbs_verification_fee_pence', '2999', 'DBS verification fee in pence (£29.99)'),
    ('child_transition_age', '16', 'Age at which child transitions to player')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Feature Flags
-- ============================================
-- All feature flags set to false initially

INSERT INTO feature_flags (
    key,
    is_enabled,
    description
)
VALUES
    ('group_sessions', false, 'Enable group session creation'),
    ('training_passport', false, 'Enable training passport feature'),
    ('performance_reports', false, 'Enable performance reports (Premium feature)'),
    ('messaging', false, 'Enable in-app messaging'),
    ('video_calls', false, 'Enable video call integration'),
    ('advanced_analytics', false, 'Enable advanced analytics dashboard'),
    ('tax_dashboard', false, 'Enable HMRC tax filing dashboard'),
    ('stripe_connect', false, 'Enable Stripe Connect for payouts'),
    ('push_notifications', false, 'Enable push notifications via OneSignal'),
    ('sms_notifications', false, 'Enable SMS notifications via Twilio'),
    ('whatsapp_notifications', false, 'Enable WhatsApp notifications via Twilio')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- Subscription Tiers
-- ============================================
-- Free and Premium tiers

INSERT INTO subscription_tiers (
    name,
    slug,
    description,
    price_monthly_pence,
    price_annual_pence,
    currency,
    is_active,
    is_default,
    sort_order
)
VALUES
    (
        'Free',
        'free',
        'Get started with basic features',
        0,
        0,
        'GBP',
        true,
        true,
        1
    ),
    (
        'Premium',
        'premium',
        'Unlock advanced features and grow your coaching business',
        999,
        8999,
        'GBP',
        true,
        false,
        2
    )
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Tier Features
-- ============================================
-- Feature configurations for Free and Premium tiers

DO $$
DECLARE
    free_tier_id uuid;
    premium_tier_id uuid;
BEGIN
    -- Get tier IDs
    SELECT id INTO free_tier_id FROM subscription_tiers WHERE slug = 'free';
    SELECT id INTO premium_tier_id FROM subscription_tiers WHERE slug = 'premium';

    -- Only insert if tiers exist and features don't already exist
    IF free_tier_id IS NOT NULL AND premium_tier_id IS NOT NULL THEN
        -- Free tier features
        INSERT INTO tier_features (tier_id, feature_key, is_enabled, usage_limit)
        VALUES
            (free_tier_id, 'group_sessions', true, 2),
            (free_tier_id, 'training_passport', true, null),
            (free_tier_id, 'performance_reports', false, null),
            (free_tier_id, 'featured_search', false, null),
            (free_tier_id, 'advanced_analytics', false, null),
            (free_tier_id, 'tax_dashboard', false, null),
            (free_tier_id, 'sports_listed', true, 1),
            (free_tier_id, 'profile_photos', true, 3)
        ON CONFLICT (tier_id, feature_key) DO NOTHING;

        -- Premium tier features
        INSERT INTO tier_features (tier_id, feature_key, is_enabled, usage_limit)
        VALUES
            (premium_tier_id, 'group_sessions', true, null),
            (premium_tier_id, 'training_passport', true, null),
            (premium_tier_id, 'performance_reports', true, null),
            (premium_tier_id, 'featured_search', true, null),
            (premium_tier_id, 'advanced_analytics', true, null),
            (premium_tier_id, 'tax_dashboard', true, null),
            (premium_tier_id, 'sports_listed', true, 3),
            (premium_tier_id, 'profile_photos', true, 10)
        ON CONFLICT (tier_id, feature_key) DO NOTHING;
    END IF;
END $$;
