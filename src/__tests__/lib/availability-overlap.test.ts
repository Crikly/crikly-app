// BUG-16/17/18: pure interval-overlap helpers shared by read-side suppression
// and write-side conflict guards. Half-open semantics — adjacency is NOT overlap.

import { intervalsOverlap, overlapsAny, hhmmToMinutes } from '@/lib/availability/overlap'

describe('intervalsOverlap', () => {
  it('detects a partial overlap', () => {
    expect(intervalsOverlap(540, 600, 570, 630)).toBe(true) // 09:00–10:00 vs 09:30–10:30
  })

  it('detects full containment either way', () => {
    expect(intervalsOverlap(540, 660, 570, 600)).toBe(true) // outer contains inner
    expect(intervalsOverlap(570, 600, 540, 660)).toBe(true) // inner within outer
  })

  it('treats adjacency (touching edges) as NOT overlapping', () => {
    expect(intervalsOverlap(540, 600, 600, 660)).toBe(false) // 09:00–10:00 vs 10:00–11:00
    expect(intervalsOverlap(600, 660, 540, 600)).toBe(false)
  })

  it('returns false for fully disjoint intervals', () => {
    expect(intervalsOverlap(540, 600, 660, 720)).toBe(false)
  })
})

describe('overlapsAny', () => {
  const busy = [
    { startMinutes: 600, endMinutes: 660 }, // 10:00–11:00
    { startMinutes: 780, endMinutes: 840 }, // 13:00–14:00
  ]

  it('is false against an empty busy set', () => {
    expect(overlapsAny(540, 600, [])).toBe(false)
  })

  it('is true when the range hits any one interval', () => {
    expect(overlapsAny(630, 690, busy)).toBe(true) // 10:30–11:30 hits the first
  })

  it('is false when the range sits in a gap', () => {
    expect(overlapsAny(660, 780, busy)).toBe(false) // 11:00–13:00 between the two
  })
})

describe('hhmmToMinutes', () => {
  it('parses HH:MM', () => {
    expect(hhmmToMinutes('09:30')).toBe(570)
    expect(hhmmToMinutes('00:00')).toBe(0)
    expect(hhmmToMinutes('23:59')).toBe(1439)
  })

  it('parses HH:MM:SS by ignoring seconds', () => {
    expect(hhmmToMinutes('14:00:00')).toBe(840)
  })
})
