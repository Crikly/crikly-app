import {
  isSessionActiveAt,
  londonSessionToMs,
  londonTodayDateString,
  londonWallClockToMs,
  nextDateString,
} from '@/lib/time/london'

// P-14 — BUG-66-safe wall-clock → epoch conversion. The whole point of these
// helpers is BST correctness: an August 10am London session is 09:00 UTC,
// a January 10am London session is 10:00 UTC.

describe('londonSessionToMs', () => {
  it('resolves a BST (summer) wall-clock 1h behind UTC', () => {
    // 27 Aug 2026 is BST (UTC+1) → 10:00 London = 09:00Z.
    expect(londonSessionToMs('2026-08-27', '10:00:00')).toBe(
      Date.UTC(2026, 7, 27, 9, 0),
    )
  })

  it('resolves a GMT (winter) wall-clock equal to UTC', () => {
    // 15 Jan 2026 is GMT → 10:00 London = 10:00Z.
    expect(londonSessionToMs('2026-01-15', '10:00:00')).toBe(
      Date.UTC(2026, 0, 15, 10, 0),
    )
  })

  it('accepts HH:MM times without seconds', () => {
    expect(londonSessionToMs('2026-01-15', '16:30')).toBe(
      Date.UTC(2026, 0, 15, 16, 30),
    )
  })

  it('handles the day after the spring clock change', () => {
    // BST began 29 Mar 2026 01:00Z — 30 Mar 10:00 London = 09:00Z.
    expect(londonSessionToMs('2026-03-30', '10:00:00')).toBe(
      Date.UTC(2026, 2, 30, 9, 0),
    )
  })
})

describe('londonWallClockToMs', () => {
  it('matches londonSessionToMs for the same components', () => {
    expect(londonWallClockToMs(2026, 8, 27, 10, 0)).toBe(
      londonSessionToMs('2026-08-27', '10:00:00'),
    )
  })
})

describe('londonTodayDateString', () => {
  it('reports the London date, not the UTC date, late on a BST evening', () => {
    // 23:30Z on 26 Aug = 00:30 London on 27 Aug (BST).
    expect(londonTodayDateString(Date.UTC(2026, 7, 26, 23, 30))).toBe('2026-08-27')
  })

  it('matches the UTC date in winter', () => {
    expect(londonTodayDateString(Date.UTC(2026, 0, 15, 23, 30))).toBe('2026-01-15')
  })
})

describe('nextDateString', () => {
  it('advances a simple date', () => {
    expect(nextDateString('2026-08-27')).toBe('2026-08-28')
  })

  it('rolls over month and year ends', () => {
    expect(nextDateString('2026-08-31')).toBe('2026-09-01')
    expect(nextDateString('2026-12-31')).toBe('2027-01-01')
  })
})

// BUG-68: dashboard isActive compared a server-local HH:MM:SS string (UTC on
// Vercel) against UK wall-clock times — an hour late during BST.
describe('isSessionActiveAt', () => {
  const bstSession = ['2026-08-23', '15:00:00', '16:00:00'] as const

  it('BST: active at 15:30 London (14:30Z), which the old UTC string compare missed', () => {
    expect(isSessionActiveAt(...bstSession, Date.UTC(2026, 7, 23, 14, 30))).toBe(true)
  })

  it('BST: not active at 14:30 London (13:30Z)', () => {
    expect(isSessionActiveAt(...bstSession, Date.UTC(2026, 7, 23, 13, 30))).toBe(false)
  })

  it('BST: not active at 16:30 London (15:30Z) — old code wrongly said active here', () => {
    expect(isSessionActiveAt(...bstSession, Date.UTC(2026, 7, 23, 15, 30))).toBe(false)
  })

  it('bounds are inclusive (matches prior >= start && <= end semantics)', () => {
    expect(isSessionActiveAt(...bstSession, Date.UTC(2026, 7, 23, 14, 0))).toBe(true)
    expect(isSessionActiveAt(...bstSession, Date.UTC(2026, 7, 23, 15, 0))).toBe(true)
  })

  it('GMT: 15:00-16:00 London equals 15:00-16:00Z', () => {
    expect(isSessionActiveAt('2026-01-15', '15:00:00', '16:00:00', Date.UTC(2026, 0, 15, 15, 30))).toBe(true)
    expect(isSessionActiveAt('2026-01-15', '15:00:00', '16:00:00', Date.UTC(2026, 0, 15, 14, 30))).toBe(false)
  })
})
