// BUG-23 (REQ-P-NEW-01): the wire format for a per-session programme
// selection, everywhere one travels — SessionPicker → ?sessions= URL param →
// checkout page → GuestEnrolmentFlow prop → POST /api/guest/programme-enrolments
// body. A selection is a (sessionId, slotIndex) PAIR:
//
//   "uuid"     → slot 0 (the only block of a non-camp session — byte-identical
//                to the pre-BUG-23 format, so non-camp URLs never change)
//   "uuid.N"   → block N of a camp-mode session (ordinal into
//                group_programme_sessions.slots, mirroring
//                coach_time_claims.slot_index)
//
// slotIndex — not date#start — because it survives a coach editing a block's
// time. The dot separator is URL-safe and cannot collide with UUID hyphens.
//
// IDENTITY ONLY: nothing here touches money. The API re-derives every price
// from DB rows; a tampered entry can only ever produce a 400/409.

export interface SlotSelection {
  sessionId: string
  slotIndex: number
}

/** Bounds mirror the migration-040 CHECK (slot_index 0–19). */
const MAX_SLOT_INDEX = 19

const ENTRY_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.(\d{1,2}))?$/i

/** One wire entry → a selection, or null when malformed/out of bounds. */
export function parseSelectionEntry(entry: string): SlotSelection | null {
  const m = ENTRY_RE.exec(entry)
  if (!m) return null
  const slotIndex = m[2] === undefined ? 0 : Number.parseInt(m[2], 10)
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > MAX_SLOT_INDEX) return null
  return { sessionId: m[1].toLowerCase(), slotIndex }
}

/**
 * A list of wire entries → deduped selections, or null when ANY entry is
 * malformed (reject-all: a partially-valid tampered body must not half-price).
 * Dedupe is by PAIR — the same session's morning and afternoon are two
 * distinct selections; listing one pair twice pays once (mirrors the
 * pre-BUG-23 id dedupe).
 */
export function parseSelectionList(entries: readonly string[]): SlotSelection[] | null {
  const seen = new Set<string>()
  const out: SlotSelection[] = []
  for (const entry of entries) {
    const sel = parseSelectionEntry(entry)
    if (!sel) return null
    const key = `${sel.sessionId}.${sel.slotIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(sel)
  }
  return out
}

/** A selection → its wire entry (bare uuid for slot 0 — non-camp unchanged). */
export function encodeSelection(sel: SlotSelection): string {
  return sel.slotIndex === 0 ? sel.sessionId : `${sel.sessionId}.${sel.slotIndex}`
}
