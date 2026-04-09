-- Migration 014b: Coach column additions to existing tables
-- Created: 2026-04-03
-- Description: Part 2 of Migration 014 - adds 19 new columns to existing tables
-- This migration addresses schema gaps identified in docs/14_COACH_REQUIREMENTS.md
-- All changes are additive only - no columns dropped or modified

-- ============================================================================
-- SECTION 1: coach_profiles additions
-- ============================================================================
-- Adds display name, travel radius, club affiliation, languages,
-- and manual approval settings

ALTER TABLE coach_profiles
  ADD COLUMN IF NOT EXISTS display_name text NULL,
  ADD COLUMN IF NOT EXISTS travel_radius_miles integer NULL,
  ADD COLUMN IF NOT EXISTS club_affiliation text NULL,
  ADD COLUMN IF NOT EXISTS languages text[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requires_manual_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_window_hours integer NOT NULL DEFAULT 24;

-- ============================================================================
-- SECTION 2: coach_sports additions
-- ============================================================================
-- Adds age groups, per-sport scheduling overrides, and no-show policy

ALTER TABLE coach_sports
  ADD COLUMN IF NOT EXISTS age_groups text[] NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cancellation_window_hours integer NULL,
  ADD COLUMN IF NOT EXISTS min_advance_hours integer NULL,
  ADD COLUMN IF NOT EXISTS max_advance_days integer NULL,
  ADD COLUMN IF NOT EXISTS no_show_policy text NULL DEFAULT 'no_refund',
  ADD COLUMN IF NOT EXISTS no_show_refund_percentage integer NOT NULL DEFAULT 0;

-- Add check constraints for no-show policy
ALTER TABLE coach_sports
  DROP CONSTRAINT IF EXISTS coach_sports_no_show_policy_check;

ALTER TABLE coach_sports
  ADD CONSTRAINT coach_sports_no_show_policy_check
    CHECK (no_show_policy IN ('full_refund', 'partial_refund', 'no_refund'));

ALTER TABLE coach_sports
  DROP CONSTRAINT IF EXISTS coach_sports_no_show_refund_pct_check;

ALTER TABLE coach_sports
  ADD CONSTRAINT coach_sports_no_show_refund_pct_check
    CHECK (no_show_refund_percentage BETWEEN 0 AND 100);

-- ============================================================================
-- SECTION 3: availability_templates additions
-- ============================================================================
-- Adds venue reference, recurring flag, and specific date support

ALTER TABLE availability_templates
  ADD COLUMN IF NOT EXISTS coach_venue_id uuid NULL 
    REFERENCES coach_venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS specific_date date NULL;

-- Constraint: specific_date must be set when not recurring
ALTER TABLE availability_templates
  DROP CONSTRAINT IF EXISTS availability_recurring_check;

ALTER TABLE availability_templates
  ADD CONSTRAINT availability_recurring_check
    CHECK (
      (is_recurring = true AND specific_date IS NULL) OR
      (is_recurring = false AND specific_date IS NOT NULL)
    );

-- ============================================================================
-- SECTION 4: bookings status expansion
-- ============================================================================
-- Expands status enum to include pending_approval and declined states
-- Required for manual approval flow (BR-16)

-- Drop existing constraint (exact name from 005_bookings.sql line 47)
ALTER TABLE bookings 
  DROP CONSTRAINT IF EXISTS valid_status;

-- Recreate with expanded values
ALTER TABLE bookings
  ADD CONSTRAINT valid_status
    CHECK (status IN (
      'confirmed',
      'completed',
      'cancelled_parent',
      'cancelled_coach',
      'no_show',
      'pending_approval',
      'declined'
    ));

-- ============================================================================
-- SECTION 5: platform_config addition
-- ============================================================================
-- Adds performance report deadline window configuration

ALTER TABLE platform_config
  ADD COLUMN IF NOT EXISTS performance_report_window_hours integer NOT NULL DEFAULT 168;

-- ============================================================================
-- SECTION 6: performance_reports addition
-- ============================================================================
-- Adds report deadline tracking for time-sensitive reports

ALTER TABLE performance_reports
  ADD COLUMN IF NOT EXISTS report_deadline_at timestamptz NULL;
