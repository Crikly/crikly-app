// P-10: carries the authed booking flow's slot hold between the slot picker
// (/parent/book/[coachSlug]) and the summary (/parent/book/[coachSlug]/summary)
// WITHOUT restarting the advisory 10-minute countdown — and, from Step 2,
// carries additional group players' details without putting a child's name in
// a URL (same rationale as participant-handoff.ts: query params leak PII into
// copied links, history, and server logs — docs/06 child-data rules).
//
// Unlike readParticipantHandoff this read is NON-destructive: the summary page
// re-reads it on back-navigation and P-13 (checkout) reads it again. It is
// cleared when a new slot selection starts, when the hold expires, and by
// P-13 once the booking is created. Slot facts (date/startTime/players) also
// travel in the URL so the summary can server-render; the handoff only adds
// what must not (hold clock, player names).

const KEY = 'crikly:p10-booking-hold'

/** A group player beyond the primary child — name + age only, no profile
 * required (P-10 approved Option C). Age kept as string: it is form state. */
export interface AdditionalPlayer {
  firstName: string
  age: string
}

export interface AuthedBookingHold {
  /** Coach the hold belongs to — a hold never transfers between coaches. */
  coachSlug: string
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM' (24h). */
  startTime: string
  /** Total players including the primary child (1 = 1-on-1). */
  players: number
  /** Epoch ms when the slot was tapped — the countdown anchor. */
  holdStartedAt: number
  /** Step 2: extra group players (players - 1 entries when complete). */
  additionalPlayers?: AdditionalPlayer[]
  /** Step 2: the selected primary child's profile id. */
  childProfileId?: string
}

/** Stores the hold; a no-op when storage throws (private browsing) — the
 * flow still works, the countdown just restarts on the summary page. */
export function stashBookingHold(hold: AuthedBookingHold): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(hold))
  } catch {
    // Storage unavailable — summary falls back to a fresh hold window.
  }
}

/** The stashed hold, or null when absent/malformed/unavailable. */
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
