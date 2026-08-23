// P-00c-ENROL / BUG-70 — display-only parent-total maths for checkout.
//
// Parent pays coach_price + commission ON TOP (BR-01). This module is for
// DISPLAY ONLY — the guest booking routes re-derive the price from
// platform_config and are authoritative. The rate is REQUIRED (no hardcoded
// default — BUG-70): server components fetch it via getCommissionRate()
// (commission-rate.ts) and thread it down, so the displayed total always
// matches the charged amount. Rounding mirrors computeBookingTotals
// (guest-checkout.ts) so display and charge agree to the penny.

/** Commission in pence, added on top of the coach price (BR-01, integer pence). */
export function displayCommissionPence(coachPence: number, rate: number): number {
  return Math.round(coachPence * rate)
}

/** Parent total in pence = coach price + commission (BR-01, integer pence). */
export function displayParentTotalPence(coachPence: number, rate: number): number {
  return coachPence + displayCommissionPence(coachPence, rate)
}
