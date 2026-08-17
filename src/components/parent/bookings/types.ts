// P-14 — parent bookings page types. Assembled server-side in
// src/app/parent/bookings/page.tsx and handed to the client orchestrator as
// one typed prop (same shape convention as parent/dashboard).

export type ParentBookingStatus =
  | 'confirmed'
  | 'completed'
  | 'cancelled_parent'
  | 'cancelled_coach'
  | 'no_show'

export interface ParentBookingItem {
  id: string
  reference: string
  status: ParentBookingStatus
  coachName: string
  coachInitials: string
  sportName: string
  /** "Cricket · 1-to-1" | "Cricket · Group · 6 players" */
  sessionLine: string
  /** "Thursday, 27 August · 10am – 11am (1 hr)" */
  whenLabel: string
  /** "Thu 27 Aug, 10am" */
  shortWhenLabel: string
  /** Venue fallback already applied server-side. */
  venueLabel: string
  /** First name of the child / participant the session is for. */
  participantLabel: string
  /** "£55.00" */
  paidLabel: string
  /** True Europe/London instants (BUG-66-safe), for window/past checks. */
  sessionStartMs: number
  sessionEndMs: number
  /** Snapshot from the booking row. 0 = coach allows no cancellations. */
  cancellationWindowHours: number
  /** Cancel is possible at all (status, window, not started). Phase 3 wires the UI. */
  allowsCancel: boolean
  isCancelled: boolean
  /** e.g. "This booking was cancelled on 12 August." — null when not cancelled. */
  cancelledLine: string | null
  // Raw fields for the .ics download.
  sessionDate: string
  startTime: string
  endTime: string
  /** Venue for the .ics LOCATION — null when unknown (label shows fallback copy). */
  icsVenue: string | null
}

export interface ParentBookingsData {
  upcoming: ParentBookingItem[]
  past: ParentBookingItem[]
}
