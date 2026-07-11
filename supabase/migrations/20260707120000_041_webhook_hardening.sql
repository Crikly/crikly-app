-- Migration 041: Stripe webhook hardening (BUG-15)
-- Created: 2026-07-07
-- Description: Three pieces, approved in BUG-15 Step 0 (Lasith, 7 Jul 2026):
--   M1 — stripe_webhook_events: durable event.id idempotency ledger. Replays
--        terminate before any handler runs; transient failures return 5xx so
--        Stripe redelivers (~72h window); attempts >= 8 poison-bounds a
--        broken event (permanent + payment_alerts row). Pruned at 30 days by
--        the existing reaper cron — no new cron.
--   M2 — payment_alerts: durable, queryable record of every situation where
--        money needs human attention (refund policy B: manual refund via the
--        Stripe Dashboard; the admin module later reads this table). Never
--        auto-pruned.
--   M3 — confirm_programme_enrolment(): atomic confirm-and-claim. The old
--        webhook flow flipped payment_status THEN claimed the spot as two
--        separate writes — a crash between them, followed by a Stripe
--        redelivery, hit the pending-scoped idempotency guard and the spot
--        was NEVER claimed (silently). One transaction removes the window:
--        a crash rolls back both, the redelivery re-runs cleanly, and the
--        spot is claimed exactly once. Preserves both BUG-23 capacity
--        mechanisms by calling the existing functions, not re-implementing.
--
-- Risk: 🔴 HIGH — the money pipe's reliability layer. Approved with rulings
--   1–4 + email-suppression addition in BUG-15 Step 0.

BEGIN;

-- ============================================================================
-- M1 — stripe_webhook_events (idempotency ledger)
-- ============================================================================
-- event_id is Stripe's globally unique evt_… id — the natural PK. No uuid.

CREATE TABLE stripe_webhook_events (
    event_id text PRIMARY KEY,
    event_type text NOT NULL,
    status text NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'processed', 'failed')),
    attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
    last_error text,
    first_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE stripe_webhook_events IS
    'Event-level idempotency ledger for POST /api/webhooks/stripe (BUG-15). Insert-first on signature pass; processed = terminal (replays 200 immediately); failed = awaiting Stripe redelivery; processing older than 10 min = stale lease, retry allowed. Rows older than 30 days pruned by the reaper cron.';

-- The reaper's prune scans by age.
CREATE INDEX stripe_webhook_events_first_seen_idx
    ON stripe_webhook_events (first_seen_at);

CREATE TRIGGER update_stripe_webhook_events_updated_at
    BEFORE UPDATE ON stripe_webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only (the webhook and the reaper both use the
-- admin client). Nothing user-facing lives here.

-- ============================================================================
-- M2 — payment_alerts (money needs a human)
-- ============================================================================

CREATE TABLE payment_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind text NOT NULL CHECK (kind IN ('needs_refund', 'restore_conflict', 'webhook_poisoned')),
    booking_id uuid REFERENCES bookings(id),
    enrolment_id uuid REFERENCES group_programme_enrolments(id),
    stripe_payment_intent_id text,
    amount_pence integer CHECK (amount_pence IS NULL OR amount_pence >= 0),
    currency text NOT NULL DEFAULT 'GBP',
    detail text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CONSTRAINT alert_resolution_consistent CHECK ((status = 'open') = (resolved_at IS NULL))
);

COMMENT ON TABLE payment_alerts IS
    'Durable record of payment situations needing human attention (BUG-15, refund policy B): paid-but-no-spot (needs_refund), booking restore conflicts (restore_conflict), poisoned webhook events (webhook_poisoned). Refunds are manual via the Stripe Dashboard until the admin module adds one-click resolution. Never auto-pruned.';

CREATE INDEX payment_alerts_open_idx ON payment_alerts (created_at) WHERE status = 'open';
-- FK lookups for the future admin module (cheap now, avoids a follow-up).
CREATE INDEX payment_alerts_booking_id_idx ON payment_alerts (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX payment_alerts_enrolment_id_idx ON payment_alerts (enrolment_id) WHERE enrolment_id IS NOT NULL;

CREATE TRIGGER update_payment_alerts_updated_at
    BEFORE UPDATE ON payment_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE payment_alerts ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only until the admin module defines admin reads.

-- ============================================================================
-- M3 — confirm_programme_enrolment(): atomic confirm-and-claim
-- ============================================================================
-- Returns jsonb {confirmed: bool, spot_claimed: bool}.
--   confirmed=false                      → redelivery no-op (enrolment was not
--                                          pending); caller does nothing.
--   confirmed=true, spot_claimed=true    → happy path; caller sends the email.
--   confirmed=true, spot_claimed=false   → capacity overrun in the race
--                                          window; a payment_alerts row was
--                                          inserted IN THIS TRANSACTION; the
--                                          caller must SUPPRESS the
--                                          confirmation email (approved
--                                          ruling) and log loudly.
-- Any raise rolls back everything — flip, claim, and alert — so a Stripe
-- redelivery re-runs the whole unit; the spot is claimed exactly once.

CREATE OR REPLACE FUNCTION public.confirm_programme_enrolment(
    p_enrolment_id uuid,
    p_intent_id text,
    p_amount_pence integer,
    p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_programme_id uuid;
    v_reference text;
    v_camp boolean;
    v_claimed boolean;
BEGIN
    -- Status-scoped flip: the idempotency anchor. No row = already succeeded
    -- (redelivery) or not pending — the caller treats it as a no-op.
    UPDATE public.group_programme_enrolments
       SET payment_status = 'succeeded', updated_at = now()
     WHERE id = p_enrolment_id
       AND payment_status = 'pending'
    RETURNING programme_id, enrolment_reference
      INTO v_programme_id, v_reference;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('confirmed', false, 'spot_claimed', false);
    END IF;

    SELECT p.camp_mode INTO v_camp
      FROM public.group_programmes p
     WHERE p.id = v_programme_id;

    -- Claim the spot via the SHIPPED mechanism for the programme's shape
    -- (BUG-23): camps re-check per (session, slot) — current_spots stays 0;
    -- regular programmes take the counter spot. Same transaction as the flip.
    IF v_camp IS TRUE THEN
        v_claimed := public.confirm_camp_slot_spots(p_enrolment_id);
    ELSE
        v_claimed := public.increment_programme_spots(v_programme_id);
    END IF;

    IF v_claimed IS NOT TRUE THEN
        -- Money was taken but no spot exists (only reachable past the
        -- reservation-hold TTL). Durable alert in the SAME transaction —
        -- refund policy B: manual refund via the Stripe Dashboard.
        INSERT INTO public.payment_alerts
            (kind, enrolment_id, stripe_payment_intent_id, amount_pence, currency, detail)
        VALUES (
            'needs_refund',
            p_enrolment_id,
            p_intent_id,
            p_amount_pence,
            COALESCE(NULLIF(p_currency, ''), 'GBP'),
            'Enrolment ' || COALESCE(v_reference, p_enrolment_id::text)
                || ' paid via ' || COALESCE(p_intent_id, 'unknown intent')
                || ' but the programme/slot filled in the race window. Confirmation email suppressed; refund manually and contact the parent.'
        );
    END IF;

    RETURN jsonb_build_object('confirmed', true, 'spot_claimed', v_claimed IS TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_programme_enrolment(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_programme_enrolment(uuid, text, integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
