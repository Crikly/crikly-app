// P-10: carries the authed booking flow's slot hold between the slot picker
// (/parent/book/[coachSlug]) and the summary/checkout steps WITHOUT
// restarting the advisory 10-minute countdown — and carries who each player
// is without putting a child's name or id in a URL (same rationale as
// participant-handoff.ts: query params leak PII into copied links, history,
// and server logs — docs/06 child-data rules).
//
// Unlike readParticipantHandoff this read is NON-destructive: the picker
// re-reads it on back-navigation and later steps read it again. It is
// cleared when a new slot selection starts, when the hold expires, and by
// checkout once the booking is created. Slot facts (date/startTime/players)
// also travel in the URL so later pages can server-render; the handoff adds
// only what must not (hold clock, player identities).

const KEY = 'crikly:p10-booking-hold'

/**
 * One player slot's occupant in a group booking (index 0 = Player 1).
 * 'child' links one of the parent's child profiles (name/age denormalised
 * for display); 'guest' is ONE-SESSION details only — no profile is ever
 * created and nothing is written to Supabase (approved Option C).
 */
export type PlayerAssignment =
  | { kind: 'child'; childProfileId: string; firstName: string; age: string }
  | { kind: 'guest'; firstName: string; age: string }

export interface AuthedBookingHold {
  /** Coach the hold belongs to — a hold never transfers between coaches. */
  coachSlug: string
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM' (24h). */
  startTime: string
  /** Total players (1 = 1-on-1). */
  players: number
  /** Epoch ms when the slot was tapped — the countdown anchor. */
  holdStartedAt: number
  /** The primary child's profile id — set for 1-on-1 bookings, and for group
   * bookings when Player 1 is a profile child (unset when Player 1 is a
   * "someone else" guest). */
  childProfileId?: string
  /** Group bookings (players > 1): one entry per player slot, index 0 =
   * Player 1. A profile child can occupy at most one slot. */
  playerAssignments?: PlayerAssignment[]
}

function isValidAssignment(value: unknown): value is PlayerAssignment {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Partial<PlayerAssignment> & { childProfileId?: unknown }
  if (typeof entry.firstName !== 'string' || typeof entry.age !== 'string') return false
  if (entry.kind === 'guest') return true
  if (entry.kind === 'child') return typeof entry.childProfileId === 'string'
  return false
}

/** Stores the hold; a no-op when storage throws (private browsing) — the
 * flow still works, the countdown just restarts on the next page. */
export function stashBookingHold(hold: AuthedBookingHold): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(hold))
  } catch {
    // Storage unavailable — later steps fall back to a fresh hold window.
  }
}

/** The stashed hold, or null when absent/malformed/unavailable. Optional
 * fields are shape-checked and dropped when malformed (defence-in-depth
 * against stale or hand-edited storage). */
export function readBookingHold(): AuthedBookingHold | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthedBookingHold>
    if (
      typeof parsed.coachSlug !== 'string' ||
      typeof parsed.date !== 'string' ||
      typeof parsed.startTime !== 'string' ||
      typeof parsed.players !== 'number' ||
      typeof parsed.holdStartedAt !== 'number'
    ) {
      return null
    }
    if (parsed.childProfileId !== undefined && typeof parsed.childProfileId !== 'string') {
      delete parsed.childProfileId
    }
    if (parsed.playerAssignments !== undefined) {
      if (
        !Array.isArray(parsed.playerAssignments) ||
        !parsed.playerAssignments.every(isValidAssignment)
      ) {
        delete parsed.playerAssignments
      }
    }
    return parsed as AuthedBookingHold
  } catch {
    return null
  }
}

export function clearBookingHold(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
