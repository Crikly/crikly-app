// P-04-A: parent dashboard data contract. All child data is fetched
// server-side in src/app/parent/dashboard/page.tsx (COPPA rule: no
// client-side DB calls for child data) and passed down as one typed prop.

export interface ChildSummary {
  id: string
  fullName: string
  /** First word of full_name — DiceBear seed + all greeting copy. */
  firstName: string
  /** Identity colour by child order (1st = teal, ...). */
  colour: string
}

export interface UpcomingSessionCard {
  id: string
  /** Null for player self-bookings. */
  childProfileId: string | null
  coachName: string
  sportName: string
  /** Pre-formatted display date, e.g. "Sat 9 Aug". */
  dateLabel: string
  /** HH:MM start time. */
  timeLabel: string
  venueName: string | null
  daysUntil: number
}

export interface ProgrammeCardData {
  id: string
  title: string
  coachName: string
  venueName: string | null
  /** Pre-formatted next-occurrence label, or null if not derivable. */
  nextDateLabel: string | null
  spotsRemaining: number
  /** Display-only, derived from *_pence / 100 — never stored back. */
  priceLabel: string
}

export interface ParentDashboardData {
  /** Parent/player first name for the hero greeting. */
  firstName: string
  /** active_role === 'player' with zero children — self-booking copy. */
  playerMode: boolean
  locationCity: string | null
  children: ChildSummary[]
  /** Upcoming confirmed sessions across all children (+ self for players). */
  sessions: UpcomingSessionCard[]
  programmes: ProgrammeCardData[]
  /** Lifetime bookings count — hides "How booking works" when > 0. */
  lifetimeBookingsCount: number
}
