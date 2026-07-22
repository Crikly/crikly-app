// BUG-24: carries "who is this for?" (participant name + age) from the
// availability panel to the programme-enrolment checkout WITHOUT putting a
// child's name in a URL. The programme detail page is a shareable link —
// query params would leak child PII into copied links, browser history, and
// server logs (docs/06_SECURITY_COMPLIANCE.md child-data rules) —
// sessionStorage is same-tab only, survives the availability → detail →
// checkout navigation chain, and dies with the tab.
//
// Writer: AvailabilityClient's programme Enrol path. Reader:
// GuestEnrolmentFlow, which uses it only to PRE-FILL its own participant
// fields — the form remains the source of truth and validates on submit, so
// a parent arriving at the detail page directly just types the values there.

const KEY = 'crikly:enrol-participant'

export interface ParticipantHandoff {
  /** Participant name as typed on the availability panel ('' when omitted). */
  name: string
  /** Age as typed ('' when omitted) — kept as string, it's form state. */
  age: string
}

/** Stores the handoff; a no-op when both values are empty or storage throws
 * (private browsing) — the parent simply types the values at checkout. */
export function stashParticipant(name: string, age: string): void {
  try {
    const trimmed = name.trim()
    if (!trimmed && !age) return
    window.sessionStorage.setItem(KEY, JSON.stringify({ name: trimmed, age }))
  } catch {
    // Storage unavailable — checkout collects the values instead.
  }
}

/** The stashed handoff, or null when absent/malformed/unavailable. Read-once:
 * the key is cleared on read so a later, unrelated enrolment in the same tab
 * (e.g. a direct link to a different programme) never inherits a stale
 * participant. */
export function readParticipantHandoff(): ParticipantHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as Partial<ParticipantHandoff>
    const name = typeof parsed.name === 'string' ? parsed.name : ''
    const age = typeof parsed.age === 'string' ? parsed.age : ''
    if (!name && !age) return null
    return { name, age }
  } catch {
    return null
  }
}
