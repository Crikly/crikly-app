// C-PAY-04 — display-only payout estimator. Integer pence throughout:
// estimate = price − (round(price × 1.5%) + 20p), null when no valid
// estimate exists so the UI hides rather than showing £0.00 or a negative.

import {
  estimatePayoutPence,
  poundsInputToPence,
  PAYOUT_ESTIMATE_REMARK,
} from '@/lib/payout-estimate'

describe('estimatePayoutPence', () => {
  it('applies 1.5% + 20p to a typical price (£40.00 → £39.20)', () => {
    expect(estimatePayoutPence(4000)).toBe(3920)
  })

  it('rounds the percentage fee to the nearest penny (£9.99 → £9.64)', () => {
    // 999 × 1.5% = 14.985 → 15p, + 20p fixed = 35p fee
    expect(estimatePayoutPence(999)).toBe(964)
  })

  it('rounds half-up on the .5 boundary (£33.33 → fee 70p)', () => {
    // 3333 × 1.5% = 49.995 → 50p, + 20p = 70p
    expect(estimatePayoutPence(3333)).toBe(3263)
  })

  it('returns the smallest valid estimate at 21p (fee 20p → 1p net)', () => {
    expect(estimatePayoutPence(21)).toBe(1)
  })

  it('returns null when the fee consumes the price (≤ 20p)', () => {
    expect(estimatePayoutPence(20)).toBeNull()
    expect(estimatePayoutPence(1)).toBeNull()
  })

  it('returns null for zero, negative, and non-integer input', () => {
    expect(estimatePayoutPence(0)).toBeNull()
    expect(estimatePayoutPence(-4000)).toBeNull()
    expect(estimatePayoutPence(40.5)).toBeNull()
    expect(estimatePayoutPence(NaN)).toBeNull()
  })
})

describe('poundsInputToPence', () => {
  it('parses whole pounds and decimals to integer pence', () => {
    expect(poundsInputToPence('40')).toBe(4000)
    expect(poundsInputToPence('39.50')).toBe(3950)
    expect(poundsInputToPence(' 12.5 ')).toBe(1250)
  })

  it('rounds sub-penny input to the nearest penny', () => {
    expect(poundsInputToPence('39.999')).toBe(4000)
  })

  it('returns null for empty or unparseable input', () => {
    expect(poundsInputToPence('')).toBeNull()
    expect(poundsInputToPence('   ')).toBeNull()
    expect(poundsInputToPence('abc')).toBeNull()
    expect(poundsInputToPence('-5')).toBeNull()
  })

  it('parses zero (estimator then hides it downstream)', () => {
    expect(poundsInputToPence('0')).toBe(0)
    expect(estimatePayoutPence(0)).toBeNull()
  })
})

describe('PAYOUT_ESTIMATE_REMARK', () => {
  it('is the mandated verbatim remark', () => {
    expect(PAYOUT_ESTIMATE_REMARK).toBe(
      'Estimated. Actual payout may vary slightly by card type.',
    )
  })
})
