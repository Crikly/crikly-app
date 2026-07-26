// C-PAY-04 — display-only payout estimate shown live wherever a coach sets a
// session or programme price.
//
// The REAL payout is computed by the C-PAY-02 cron from the actual Stripe fee
// on the charge (balance_transaction.fee — BR-02); this module never feeds any
// money movement. The estimate uses the UK Visa rate (1.5% + 20p fixed) purely
// so coaches see roughly what they'll receive before saving, and every
// rendered figure must carry PAYOUT_ESTIMATE_REMARK alongside it.
//
// Integer pence throughout — conversion to pounds happens only at render time.

export const PAYOUT_ESTIMATE_REMARK =
  'Estimated. Actual payout may vary slightly by card type.'

/**
 * Estimated coach payout in pence for a given price in pence:
 * price − (round(price × 1.5%) + 20p).
 *
 * Returns null when no valid estimate exists — non-integer or non-positive
 * input, or a price so low the estimated fee consumes it — so callers can
 * hide the estimate rather than show £0.00 or a negative figure.
 */
export function estimatePayoutPence(pricePence: number): number | null {
  if (!Number.isInteger(pricePence) || pricePence <= 0) return null
  const feePence = Math.round((pricePence * 15) / 1000) + 20
  const netPence = pricePence - feePence
  return netPence > 0 ? netPence : null
}

/**
 * Parses a pounds text-input value ("40", "39.50") to integer pence for the
 * estimator — the same round(parse × 100) conversion the price save paths
 * already use. Returns null for empty or unparseable input so the estimate
 * hides instead of showing a bogus figure.
 */
export function poundsInputToPence(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const pounds = Number(trimmed)
  if (!Number.isFinite(pounds) || pounds < 0) return null
  return Math.round(pounds * 100)
}
