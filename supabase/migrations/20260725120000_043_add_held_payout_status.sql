-- Migration 043: Add 'held' payout status + held_reason (C-PAY-03 Guard 2)
-- ============================================
-- Defines the HELD-PAYOUT CONTRACT consumed by the C-PAY-02 transfer job.
--
-- Problem: at transfer time a coach may have no usable Stripe Connect
-- account (never connected, or onboarding incomplete/revoked). The job must
-- neither fail the whole run nor skip the row silently — money owed to the
-- coach has to stay visible and recoverable.
--
-- Contract (C-PAY-02 MUST implement exactly this):
--   1. Selection: the job picks up due rows
--        WHERE status IN ('pending', 'held') AND scheduled_at <= now()
--      Held rows are re-evaluated on EVERY run — release is automatic, no
--      webhook involvement.
--   2. Hold: if the coach's coach_profiles row has no stripe_account_id
--        → status = 'held', held_reason = 'no_stripe_account'
--      If stripe_account_id exists but stripe_onboarding_complete = false
--        → status = 'held', held_reason = 'stripe_onboarding_incomplete'
--      A hold is NOT a failure: do not increment retry_count, do not set
--      failure_reason. The job continues with the remaining rows.
--   3. Release: when eligibility passes on a later run, clear held_reason
--      and proceed with the transfer in the same flow as a 'pending' row
--      (status moves 'held' → 'processing' → 'paid'). held_reason must be
--      cleared in the SAME UPDATE that leaves 'held' — enforced by
--      held_reason_iff_held below.
--
-- Additive only: new status value, new nullable column, new partial index.
-- No existing column or row is modified.

-- 1. Extend the status enum-check with 'held'.
ALTER TABLE payouts DROP CONSTRAINT valid_payout_status;
ALTER TABLE payouts ADD CONSTRAINT valid_payout_status
    CHECK (status IN ('pending', 'processing', 'held', 'paid', 'failed'));

-- 2. Why the payout is held. NULL unless status = 'held'.
ALTER TABLE payouts ADD COLUMN held_reason text;

ALTER TABLE payouts ADD CONSTRAINT valid_held_reason
    CHECK (held_reason IS NULL OR held_reason IN ('no_stripe_account', 'stripe_onboarding_incomplete'));

-- Biconditional: a held row always says why; a non-held row never carries a
-- stale reason. Forces the release UPDATE to clear held_reason atomically.
ALTER TABLE payouts ADD CONSTRAINT held_reason_iff_held
    CHECK ((status = 'held') = (held_reason IS NOT NULL));

-- 3. Ops/job visibility — mirrors payouts_status_pending_idx.
CREATE INDEX payouts_status_held_idx ON payouts(status) WHERE status = 'held';

COMMENT ON COLUMN payouts.held_reason IS
    'C-PAY-03 held-payout contract: why a status=held payout cannot transfer yet (no_stripe_account | stripe_onboarding_incomplete). Cleared in the same UPDATE that releases the hold.';
