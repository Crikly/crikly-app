// Unit tests for src/lib/booking/commission-display.ts
//
// Business rules covered:
//   BR-01  Commission is added ON TOP of the coach price (never deducted).
//          parent_total = coach_price + commission
//   BR-02  Default commission rate = 10% (DISPLAY_COMMISSION_RATE = 0.1).
//   BR-10  All amounts are integer pence; no floats.
//
// No mocks needed — these are pure functions.

import {
  displayCommissionPence,
  displayParentTotalPence,
  DISPLAY_COMMISSION_RATE,
} from '@/lib/booking/commission-display'

// ─── DISPLAY_COMMISSION_RATE constant ──────────────────────────────────────────

describe('DISPLAY_COMMISSION_RATE', () => {
  it('is 0.1 (10% — BR-02 default)', () => {
    expect(DISPLAY_COMMISSION_RATE).toBe(0.1)
  })
})

// ─── displayCommissionPence ────────────────────────────────────────────────────

describe('displayCommissionPence', () => {
  it('BR-01: calculates 10% commission on a round price (6000p = £60)', () => {
    expect(displayCommissionPence(6000)).toBe(600)
  })

  it('BR-01: calculates 10% commission for the worked example from BR-01 docs (8400p = £84)', () => {
    // 3 × £28 = £84 coach price → commission = £8.40 = 840p
    expect(displayCommissionPence(8400)).toBe(840)
  })

  it('BR-01: calculates 10% commission for block price 22400p (£224)', () => {
    // £224 × 10% = £22.40 = 2240p
    expect(displayCommissionPence(22400)).toBe(2240)
  })

  it('BR-10: result is an integer (no float residue)', () => {
    expect(Number.isInteger(displayCommissionPence(6000))).toBe(true)
    expect(Number.isInteger(displayCommissionPence(8400))).toBe(true)
    expect(Number.isInteger(displayCommissionPence(22400))).toBe(true)
  })

  it('rounds to nearest penny using Math.round for odd values', () => {
    // 9999p × 0.1 = 999.9 → rounds to 1000
    expect(displayCommissionPence(9999)).toBe(1000)
    // 9994p × 0.1 = 999.4 → rounds to 999
    expect(displayCommissionPence(9994)).toBe(999)
  })

  it('returns 0 for a zero coach price', () => {
    expect(displayCommissionPence(0)).toBe(0)
  })

  it('accepts a custom rate and uses it', () => {
    // 5% custom rate on 6000p = 300p
    expect(displayCommissionPence(6000, 0.05)).toBe(300)
  })

  it('defaults to DISPLAY_COMMISSION_RATE when no rate is supplied', () => {
    expect(displayCommissionPence(6000)).toBe(displayCommissionPence(6000, DISPLAY_COMMISSION_RATE))
  })
})

// ─── displayParentTotalPence ───────────────────────────────────────────────────

describe('displayParentTotalPence', () => {
  it('BR-01: parent total = coach price + commission (6000p + 600p = 6600p)', () => {
    expect(displayParentTotalPence(6000)).toBe(6600)
  })

  it('BR-01: parent total for 8400p coach price (£84 + £8.40 commission = £92.40 = 9240p)', () => {
    expect(displayParentTotalPence(8400)).toBe(9240)
  })

  it('BR-01: parent total for 22400p coach price (£224 + £22.40 commission = £246.40 = 24640p)', () => {
    expect(displayParentTotalPence(22400)).toBe(24640)
  })

  it('BR-01: parent total is always coach_price + commission, never coach_price - commission', () => {
    const coachPence = 6000
    const commission = displayCommissionPence(coachPence)
    const parentTotal = displayParentTotalPence(coachPence)
    expect(parentTotal).toBe(coachPence + commission)
    // Explicit: parent pays MORE than the coach price (commission is on top)
    expect(parentTotal).toBeGreaterThan(coachPence)
  })

  it('BR-10: result is an integer pence (no floats)', () => {
    expect(Number.isInteger(displayParentTotalPence(6000))).toBe(true)
    expect(Number.isInteger(displayParentTotalPence(8400))).toBe(true)
    expect(Number.isInteger(displayParentTotalPence(22400))).toBe(true)
  })

  it('returns 0 for a zero coach price', () => {
    expect(displayParentTotalPence(0)).toBe(0)
  })

  it('accepts a custom rate', () => {
    // 5% on 6000p = 300p commission → parent total = 6300p
    expect(displayParentTotalPence(6000, 0.05)).toBe(6300)
  })

  it('rounding: odd per-session price still yields integer total (2500p × 3 = 7500p → 8250p)', () => {
    // 3 × 2500 = 7500p coach. 10% = 750p. Total = 8250p.
    const coachPence = 7500
    const total = displayParentTotalPence(coachPence)
    expect(Number.isInteger(total)).toBe(true)
    expect(total).toBe(8250)
  })

  it('rounding: 9999p with default rate — total is integer', () => {
    const total = displayParentTotalPence(9999)
    expect(Number.isInteger(total)).toBe(true)
    // 9999 + round(9999 × 0.1) = 9999 + round(999.9) = 9999 + 1000 = 10999
    expect(total).toBe(10999)
  })
})
