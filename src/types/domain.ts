// Domain types shared across API routes and jobs.

// ─── Payouts (C-PAY-03 held-payout contract) ─────────────────────────────────
//
// Mirrors supabase/migrations/20260725120000_043_add_held_payout_status.sql —
// the migration header is the canonical contract; keep both in sync.
//
// The C-PAY-02 transfer job:
//   - selects due rows WHERE status IN ('pending', 'held')
//   - holds a row (status='held' + held_reason, no retry_count increment, no
//     failure_reason) when the coach has no usable Stripe Connect account
//   - releases automatically on a later run: clear held_reason and transfer
//     in the same UPDATE that leaves 'held' (DB-enforced: held_reason_iff_held)

export const PAYOUT_STATUSES = ['pending', 'processing', 'held', 'paid', 'failed'] as const
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number]

export const PAYOUT_HELD_REASONS = ['no_stripe_account', 'stripe_onboarding_incomplete'] as const
export type PayoutHeldReason = (typeof PAYOUT_HELD_REASONS)[number]

/**
 * Statuses representing money still owed to the coach. Account deletion is
 * blocked while any payout is in one of these states (C-PAY-03: 'held' counts —
 * a coach with a held payout must reconnect Stripe, not delete their account).
 */
export const PAYOUT_OWED_STATUSES: readonly PayoutStatus[] = ['pending', 'processing', 'held']
