// BUG-16/17/18: pure, framework-free interval-overlap helpers shared by the
// read-side slot suppression (slots.ts, client-bundled) and the write-side
// commitment guard (commitments.ts, server-only). No DOM, no Supabase, no
// React — safe to import from either environment and unit-testable in
// isolation.

export interface Interval {
  /** Minutes from midnight, inclusive. e.g. 540 = 09:00. */
  startMinutes: number
  /** Minutes from midnight, exclusive. e.g. 600 = 10:00. */
  endMinutes: number
}

/**
 * Half-open overlap test: two intervals [aStart, aEnd) and [bStart, bEnd)
 * overlap iff aStart < bEnd AND aEnd > bStart. Adjacency (one ends exactly
 * where the next begins) is NOT an overlap — e.g. 09:00–10:00 and 10:00–11:00
 * do not conflict.
 */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && aEnd > bStart
}

/**
 * True when [startMinutes, endMinutes) overlaps ANY interval in `busy`.
 * Empty `busy` → always false (no suppression / no conflict).
 */
export function overlapsAny(
  startMinutes: number,
  endMinutes: number,
  busy: readonly Interval[],
): boolean {
  for (const b of busy) {
    if (intervalsOverlap(startMinutes, endMinutes, b.startMinutes, b.endMinutes)) {
      return true
    }
  }
  return false
}

/** 'HH:MM' or 'HH:MM:SS' → minutes from midnight. Returns NaN on malformed input. */
export function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
