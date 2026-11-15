// STAGE1-CANCEL-OFFLINE (Decision T-21, 14 Nov 2026): the single source of the
// approved wording about programme fees and refunds. In the pilot, programme
// refunds are arranged directly between the coach and the parent — Crikly does
// not refund programme fees.
//
// Copy here is APPROVED WORDING. Do not rephrase it in a component; change it
// here (with Lasith's sign-off) so every screen stays in step.

/**
 * Shown to parents on the programme checkout BEFORE they pay. Approved wording
 * (T-21) — rendered wherever a programme enrolment can be paid for.
 */
export const PROGRAMME_FEE_DISCLOSURE =
  'Programme fees are paid to your coach shortly after you buy. If you withdraw, or the coach cancels, any refund is arranged directly with the coach.'

/**
 * Error code returned by PATCH /api/coaches/programmes/[programmeId] when a
 * cancel would affect paid enrolments and the coach has not yet confirmed.
 * MIRROR of the literal in that route — kept inline there so the API route
 * does not import from a UI constants module. Update both together.
 */
export const PAID_ENROLMENTS_CONFIRM_REQUIRED = 'PAID_ENROLMENTS_CONFIRM_REQUIRED'

/** Coach warning shown before cancelling a programme parents have paid for. */
export const PROGRAMME_CANCEL_WARNING = {
  title: 'Parents have already paid',
  /** First line — how many paid places the cancellation affects. */
  paidPlaces: (count: number): string =>
    count === 1
      ? 'A parent has paid for 1 place on this programme.'
      : `Parents have paid for ${count} places on this programme.`,
  duty: 'If you cancel, you must refund them directly. Crikly does not refund programme fees.',
  emails:
    'We’ll email each parent to say the programme is cancelled and that you will arrange their refund.',
  keep: 'Keep programme',
  confirm: 'Cancel and refund parents myself',
  confirming: 'Cancelling…',
} as const

/**
 * STAGE1-CANCEL-OFFLINE-2: reminder shown above the coach's read-only list of
 * cancelled programmes. Approved wording.
 */
export const PROGRAMME_CANCELLED_REMINDER =
  'Cancelled programmes are kept here as a record. If parents had paid, you must refund them directly. Crikly does not refund programme fees.'
