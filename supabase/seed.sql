-- Seed Data for Crikly Platform
-- Created: 2026-03-28
-- Description: Initial data required for platform to function
-- This file can be re-run safely using ON CONFLICT DO NOTHING

-- ============================================
-- Sports
-- ============================================
-- Cricket as the first sport

INSERT INTO sports (name, slug, is_active)
VALUES (
    'Cricket',
    'cricket',
    true
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Countries
-- ============================================
-- United Kingdom as the first country

INSERT INTO countries (code, name, currency_code, is_active)
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
-- Single-row config table with named columns. Values mirror the
-- DEFAULT clauses on each column in CREATE TABLE platform_config
-- (supabase/migrations/20260328065139_003_platform_config.sql).
-- Idempotent: WHERE NOT EXISTS skips re-insertion on reseed.

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
)
SELECT 0.1000, 48, 24, 24, 56, 2999, 'GBP', 3, 16, 30
WHERE NOT EXISTS (SELECT 1 FROM platform_config);

-- ============================================
-- Feature Flags
-- ============================================
-- All feature flags set to false initially

INSERT INTO feature_flags (
    key,
    enabled,
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
