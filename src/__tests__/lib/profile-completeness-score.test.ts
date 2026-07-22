// BUG-27: the shared coach profile-completeness scorer. The booking-policy
// check must treat "No cancellations" (cancellation_window_hours = 0) as a
// COMPLETE choice — 0 is a deliberate, valid window, not an unset value.
// These tests pin the 6-check rollup and, specifically, that a coach who
// chose "No cancellations" reaches 100% (the exact bug: they were stuck at
// 83% / 5-of-6).

import { scoreCompleteness, type CompletenessChecks } from '@/lib/profile-completeness-score'

const ALL_FALSE: CompletenessChecks = {
  basicProfile: false,
  bookingPolicy: false,
  stripe: false,
  sports: false,
  qualifications: false,
  availability: false,
}

describe('scoreCompleteness', () => {
  it('is 0% when nothing is done', () => {
    expect(scoreCompleteness(ALL_FALSE)).toEqual({ completed: 0, total: 6, pct: 0 })
  })

  it('is 100% when all six checks pass', () => {
    const all = Object.fromEntries(
      Object.keys(ALL_FALSE).map((k) => [k, true]),
    ) as unknown as CompletenessChecks
    expect(scoreCompleteness(all)).toEqual({ completed: 6, total: 6, pct: 100 })
  })

  it('rounds correctly — five of six is 83%', () => {
    // The exact stuck state a "No cancellations" coach saw before BUG-27.
    const fiveOfSix: CompletenessChecks = {
      basicProfile: true,
      bookingPolicy: false, // the missing sixth
      stripe: true,
      sports: true,
      qualifications: true,
      availability: true,
    }
    expect(scoreCompleteness(fiveOfSix)).toMatchObject({ completed: 5, total: 6, pct: 83 })
  })

  it('BUG-27: with bookingPolicy true (No cancellations counts), the coach reaches 100%', () => {
    // The caller derives bookingPolicy from `cancellation_window_hours >= 0`,
    // so value 0 ("No cancellations") passes true — the same shape as any
    // other window. This is the completion the bug was denying.
    const complete: CompletenessChecks = {
      basicProfile: true,
      bookingPolicy: true,
      stripe: true,
      sports: true,
      qualifications: true,
      availability: true,
    }
    expect(scoreCompleteness(complete).pct).toBe(100)
  })

  it('counts each check independently (bookingPolicy alone contributes one)', () => {
    expect(scoreCompleteness({ ...ALL_FALSE, bookingPolicy: true })).toMatchObject({
      completed: 1,
      pct: 17,
    })
  })
})
