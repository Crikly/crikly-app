// BUG-13b: shared vocabulary for releasing a pending_payment booking.
//
// "Released" = soft-deleted (deleted_at set) with status left at
// 'pending_payment' and cancellation_reason set to one of the values below.
// Soft delete is the release mechanism because all three slot-truth surfaces
// — the migration-034 partial unique index, the public calendar read
// (GET /api/coaches/[id]/availability), and the write-side commitments guard
// (src/lib/availability/commitments.ts) — already free a slot on
// deleted_at IS NOT NULL, so one write frees the slot everywhere at once.
//
// Writers: the Stripe webhook (payment_intent.canceled) and the reaper
// (GET /api/cron/release-expired-bookings). Reader: the webhook's
// succeeded-after-release backstop, which uses isReleaseReason() to tell a
// released row apart from every other soft-deleted booking.

/** Reaper release: the pending_payment TTL elapsed with no definitive signal. */
export const RELEASE_REASON_EXPIRED = 'expired_pending_payment'

/** Webhook release: the Stripe PaymentIntent was cancelled (can never charge). */
export const RELEASE_REASON_PI_CANCELLED = 'payment_intent_cancelled'

const RELEASE_REASONS: readonly string[] = [
  RELEASE_REASON_EXPIRED,
  RELEASE_REASON_PI_CANCELLED,
]

/** True when a soft-deleted booking was released by BUG-13b (vs any other soft delete). */
export function isReleaseReason(reason: string | null): boolean {
  return reason !== null && RELEASE_REASONS.includes(reason)
}
