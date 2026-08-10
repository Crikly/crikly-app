// CF-NOTIFY-02 — webhook-safe boundary for the coach new-booking email.
//
// The Stripe webhook (payment_intent.succeeded) MUST always return 200 once the
// signature passes, so a failed email can never throw out of the handler. The
// template sender in ./emails throws on Resend failure; this wrapper catches it,
// logs, and returns a boolean the caller can log without branching its control flow.
// Mirrors send-booking-confirmation.ts exactly.

import {
  sendNewBookingToCoach,
  type NewBookingToCoachParams,
} from './emails'

/**
 * Sends the coach new-booking notification email. Never throws.
 * @returns true if Resend accepted the send, false on any failure (already logged).
 */
export async function sendNewBookingNotification(
  params: NewBookingToCoachParams,
): Promise<boolean> {
  try {
    await sendNewBookingToCoach(params)
    return true
  } catch (err) {
    console.error(
      `[sendNewBookingNotification] failed for booking ${params.bookingReference}:`,
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
