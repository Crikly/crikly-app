// BUG-19 Phase 2 (Option B, approved 5 Jul 2026): camp-mode programme sessions
// carry MULTIPLE time blocks in group_programme_sessions.slots (jsonb array of
// {"startTime":"HH:MM","endTime":"HH:MM"}); the row's own start_time/end_time
// mirror only slots[0] (migration 031 convention). Before this fix every
// consumer read the row columns only, so a camp's second block (e.g. the
// 13:00–17:00 afternoon) was invisible to the calendar AND the write-side
// guard — a bookable hole. This helper is the single expansion used by:
//   - src/lib/availability/commitments.ts  (write-side busy intervals)
//   - programmeSchedule.ts                 (public calendar read)
//   - coach_time_claims triggers (SQL twin in migration 038) — one claim per block
// so read side, write side, and the DB constraint agree block-for-block.

export interface SessionBlock {
  /** 'HH:MM' (24h). */
  startTime: string
  /** 'HH:MM' (24h). */
  endTime: string
}

// Matches 'HH:MM' with an optional ':SS' tail (DB time columns are HH:MM:SS).
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

/** 'HH:MM:SS' | 'HH:MM' → 'HH:MM'. */
function toHHMM(t: string): string {
  return t.slice(0, 5)
}

/**
 * All time blocks a session occupies, in slots-array order. A valid non-empty
 * slots array wins (one block per element — slots[0] already mirrors the row
 * columns, so the row interval is never ADDED to the expansion); otherwise the
 * row's own start/end is the single block. Malformed slot entries (wrong
 * shape, unparseable or inverted times) are skipped defensively — the API
 * validators enforce shape on write, so this only guards legacy/manual rows.
 * Returns [] only when no usable times exist at all.
 */
export function expandSessionBlocks(session: {
  start_time: string | null
  end_time: string | null
  slots?: unknown
}): SessionBlock[] {
  if (Array.isArray(session.slots) && session.slots.length > 0) {
    const blocks: SessionBlock[] = []
    for (const raw of session.slots) {
      if (typeof raw !== 'object' || raw === null) continue
      const b = raw as Record<string, unknown>
      if (typeof b.startTime !== 'string' || typeof b.endTime !== 'string') continue
      if (!HHMM_RE.test(b.startTime) || !HHMM_RE.test(b.endTime)) continue
      const startTime = toHHMM(b.startTime)
      const endTime = toHHMM(b.endTime)
      if (endTime <= startTime) continue
      blocks.push({ startTime, endTime })
    }
    if (blocks.length > 0) return blocks
  }

  if (!session.start_time || !session.end_time) return []
  return [{ startTime: toHHMM(session.start_time), endTime: toHHMM(session.end_time) }]
}
