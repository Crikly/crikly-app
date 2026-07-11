// P-00c-EMAIL — webhook-safe boundary for the guest booking-confirmation email.
//
// The Stripe webhook (payment_intent.succeeded) MUST always return 200 once the
// signature passes, so a failed email can never throw out of the handler. The
// template sender in ./emails throws on Resend failure; this wrapper catches it,
// logs, and returns a boolean the caller can log without branching its control flow.

import {
  sendGuestBookingConfirmation,
  type GuestBookingConfirmationParams,
} from './emails'

/**
 * Sends the guest booking-confirmation email. Never throws.
 * @returns true if Resend accepted the send, false on any failure (already logged).
 */
export async function sendBookingConfirmation(
  params: GuestBookingConfirmationParams,
): Promise<boolean> {
  try {
    await sendGuestBookingConfirmation(params)
    return true
  } catch (err) {
    console.error(
      `[sendBookingConfirmation] failed for booking ${params.bookingReference}:`,
      err instanceof Error ? err.message : err,
    )
    return false
  }
}
