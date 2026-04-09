-- Migration 006: Create payment and payout tables
-- Created: 2026-03-28
-- Description: Payment intents, payouts, and refunds - handles real money transactions with Stripe
-- CRITICAL: This migration handles payment data. All amounts in pence (integers).
-- SECURITY: No card data is ever stored. Stripe handles all card details.
-- SECURITY: Service role only for INSERT/UPDATE operations.

-- ============================================
-- Table: payment_intents
-- ============================================
-- Tracks Stripe payment intents for every booking.
-- Audit trail and reconciliation for all payment activity.

CREATE TABLE payment_intents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    stripe_payment_intent_id text NOT NULL,
    amount_pence integer NOT NULL,
    currency text NOT NULL DEFAULT 'GBP',
    status text NOT NULL DEFAULT 'pending',
    stripe_status text,
    application_fee_pence integer NOT NULL,
    coach_transfer_amount_pence integer NOT NULL,
    idempotency_key text NOT NULL,
    stripe_error_code text,
    stripe_error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_payment_status CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
    CONSTRAINT valid_amounts CHECK (amount_pence > 0 AND application_fee_pence >= 0 AND coach_transfer_amount_pence >= 0),
    CONSTRAINT unique_stripe_payment_intent_id UNIQUE(stripe_payment_intent_id),
    CONSTRAINT unique_idempotency_key UNIQUE(idempotency_key)
);

-- ============================================
-- Table: payouts
-- ============================================
-- Tracks payouts to coaches after session completion.
-- Full audit trail of every coach payout.

CREATE TABLE payouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    coach_profile_id uuid NOT NULL REFERENCES coach_profiles(id) ON DELETE RESTRICT,
    stripe_transfer_id text,
    amount_pence integer NOT NULL,
    currency text NOT NULL DEFAULT 'GBP',
    status text NOT NULL DEFAULT 'pending',
    scheduled_at timestamptz NOT NULL,
    processed_at timestamptz,
    failure_reason text,
    retry_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_payout_status CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    CONSTRAINT valid_payout_amount CHECK (amount_pence > 0),
    CONSTRAINT valid_retry_count CHECK (retry_count >= 0)
);

-- ============================================
-- Table: refunds
-- ============================================
-- Tracks refunds issued for cancelled bookings.
-- Audit trail for all refunds — parent-initiated or coach-initiated.

CREATE TABLE refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
    payment_intent_id uuid NOT NULL REFERENCES payment_intents(id) ON DELETE RESTRICT,
    stripe_refund_id text,
    amount_pence integer NOT NULL,
    currency text NOT NULL DEFAULT 'GBP',
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    initiated_by text NOT NULL,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_refund_reason CHECK (reason IN ('coach_cancelled', 'parent_cancelled_before_window', 'admin_manual')),
    CONSTRAINT valid_refund_status CHECK (status IN ('pending', 'succeeded', 'failed')),
    CONSTRAINT valid_initiated_by CHECK (initiated_by IN ('parent', 'coach', 'admin', 'system')),
    CONSTRAINT valid_refund_amount CHECK (amount_pence > 0)
);

-- ============================================
-- Indexes
-- ============================================

-- payment_intents indexes
CREATE INDEX payment_intents_booking_id_idx ON payment_intents(booking_id);
CREATE INDEX payment_intents_status_idx ON payment_intents(status);

-- payouts indexes
CREATE INDEX payouts_booking_id_idx ON payouts(booking_id);
CREATE INDEX payouts_coach_profile_id_idx ON payouts(coach_profile_id);
CREATE INDEX payouts_status_pending_idx ON payouts(status) WHERE status = 'pending';
CREATE INDEX payouts_scheduled_at_idx ON payouts(scheduled_at);

-- refunds indexes
CREATE INDEX refunds_booking_id_idx ON refunds(booking_id);
CREATE INDEX refunds_payment_intent_id_idx ON refunds(payment_intent_id);
CREATE INDEX refunds_status_idx ON refunds(status);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies: payment_intents
-- ============================================

-- SELECT: Parent who made payment, or coach receiving payment
CREATE POLICY "Parents can view own payment intents"
    ON payment_intents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN user_profiles ON user_profiles.id = bookings.booked_by_user_id
            WHERE bookings.id = payment_intents.booking_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

CREATE POLICY "Coaches can view payment intents for their bookings"
    ON payment_intents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN coach_profiles ON coach_profiles.id = bookings.coach_profile_id
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE bookings.id = payment_intents.booking_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT/UPDATE: Service role only (no user policies = service role only)
-- No INSERT or UPDATE policies means only service role can perform these operations

-- ============================================
-- RLS Policies: payouts
-- ============================================

-- SELECT: Coach who receives payout
CREATE POLICY "Coaches can view own payouts"
    ON payouts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM coach_profiles
            JOIN user_profiles ON user_profiles.id = coach_profiles.user_profile_id
            WHERE coach_profiles.id = payouts.coach_profile_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT/UPDATE: Service role only (no user policies = service role only)
-- No INSERT or UPDATE policies means only service role can perform these operations

-- ============================================
-- RLS Policies: refunds
-- ============================================

-- SELECT: Parent who received refund
CREATE POLICY "Parents can view own refunds"
    ON refunds
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings
            JOIN user_profiles ON user_profiles.id = bookings.booked_by_user_id
            WHERE bookings.id = refunds.booking_id
            AND user_profiles.auth_user_id = auth.uid()
        )
    );

-- INSERT/UPDATE: Service role only (no user policies = service role only)
-- No INSERT or UPDATE policies means only service role can perform these operations

-- ============================================
-- Triggers for updated_at
-- ============================================

-- Trigger for payment_intents
CREATE TRIGGER update_payment_intents_updated_at
    BEFORE UPDATE ON payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for payouts
CREATE TRIGGER update_payouts_updated_at
    BEFORE UPDATE ON payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for refunds
CREATE TRIGGER update_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
