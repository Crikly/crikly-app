// P-00c-ENROL — display-only parent-total maths for programme enrolment.
//
// Parent pays coach_price + commission ON TOP (BR-01), exactly like the 1-to-1
// guest checkout. This module is for DISPLAY ONLY — the server
// (POST /api/guest/programme-enrolments) re-derives the price from
// platform_config and is authoritative. Mirrors the 1-to-1 book page's
// COMMISSION_RATE display constant.
//
// TODO(P-00c-COMMISSION-DISPLAY): read the rate from platform_config so the
// displayed total matches the charged amount if an admin changes BR-02's default.

export const DISPLAY_COMMISSION_RATE = 0.1

/** Commission in pence, added on top of the coach price (BR-01, integer pence). */
export function displayCommissionPence(
  coachPence: number,
  rate: number = DISPLAY_COMMISSION_RATE,
): number {
  return Math.round(coachPence * rate)
}

/** Parent total in pence = coach price + commission (BR-01, integer pence). */
export function displayParentTotalPence(
  coachPence: number,
  rate: number = DISPLAY_COMMISSION_RATE,
): number {
  return coachPence + displayCommissionPence(coachPence, rate)
}
