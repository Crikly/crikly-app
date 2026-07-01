// BUG-17/18: server-side aggregation of every busy interval a coach already
// holds on a given calendar date, across ALL of their scheduling surfaces:
//   1. availability_templates — recurring (by weekday) + ad-hoc (by specific_date)
//   2. group_programme_sessions — persisted rows, PLUS the recurring day_of_week
//      fallback for programmes that carry no session rows (Decision A: the
//      write-side guard must match exactly what the public calendar shows;
//      programmeSchedule.ts uses the same persisted-else-recurring resolution)
//   3. bookings — confirmed 1-on-1 bookings (non-cancelled, non-soft-deleted)
//
// Single-actor / single-action scope only (BUG-16/17/18). The cross-table
// payment-race guard is BUG-19 and deliberately untouched here.
//
// Callers pass a Supabase client. Every query is filtered by coach_profile_id,
// so ownership is enforced explicitly regardless of the client's RLS context —
// pass the admin client to sidestep the dev-DB auth_user_id mismatch (same
// pattern the programme routes already use).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { hhmmToMinutes, type Interval } from './overlap'

type Client = SupabaseClient<Database>

export type CommitmentSource = 'recurring' | 'ad_hoc' | 'programme' | 'booking'

export interface Commitment extends Interval {
  source: CommitmentSource
  /** Human-readable description used to build the 409 conflict message. */
  label: string
}

/** Local-timezone YYYY-MM-DD for "today" (mirrors slots.localISODate). */
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** 0=Sun..6=Sat for a 'YYYY-MM-DD' string, parsed as LOCAL midnight (no UTC shift). */
function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/** Date portion ('YYYY-MM-DD') of a timestamptz/date string, or null. */
function datePart(ts: string | null): string | null {
  return ts ? ts.slice(0, 10) : null
}

interface AvailabilityRow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_recurring: boolean | null
  specific_date: string | null
}

interface ProgrammeRow {
  id: string
  day_of_week: number | null
  days_of_week: number[] | null
  start_time: string
  duration_minutes: number
  starts_at: string | null
  ends_at: string | null
}

interface SessionRow {
  group_programme_id: string
  session_date: string
  start_time: string
  end_time: string
}

interface BookingRow {
  session_start_time: string
  session_end_time: string
}

/**
 * True when a programme's recurring weekday pattern places a session on
 * `isoDate`, honouring its starts_at / ends_at anchors. Mirrors
 * programmeSchedule.recurringDates for a single date.
 */
function recurringMatches(prog: ProgrammeRow, isoDate: string): boolean {
  const days = prog.days_of_week && prog.days_of_week.length > 0 ? prog.days_of_week : [prog.day_of_week]
  if (!days.includes(weekdayOf(isoDate))) return false
  const startAnchor = datePart(prog.starts_at)
  if (startAnchor && isoDate < startAnchor) return false
  const endAnchor = datePart(prog.ends_at)
  if (endAnchor && isoDate > endAnchor) return false
  return true
}

/**
 * All busy intervals for `coachProfileId` on `isoDate` ('YYYY-MM-DD').
 *
 * @param opts.excludeAvailabilityBlockId omit a template row (PATCH self-exclusion)
 * @param opts.excludeProgrammeId omit a programme's sessions (PATCH self-exclusion)
 */
export async function getCoachCommitments(
  supabase: Client,
  coachProfileId: string,
  isoDate: string,
  opts: { excludeAvailabilityBlockId?: string; excludeProgrammeId?: string } = {},
): Promise<Commitment[]> {
  const dow = weekdayOf(isoDate)
  const commitments: Commitment[] = []

  // ── 1. availability_templates (recurring by weekday + ad-hoc by specific_date) ──
  // Sport-agnostic by design: a busy slot occupies the coach regardless of sport.
  const { data: templates } = await supabase
    .from('availability_templates')
    .select('id, day_of_week, start_time, end_time, is_recurring, specific_date')
    .eq('coach_profile_id', coachProfileId)
    .eq('is_active', true)

  for (const t of (templates ?? []) as AvailabilityRow[]) {
    if (opts.excludeAvailabilityBlockId && t.id === opts.excludeAvailabilityBlockId) continue
    const isAdHoc = t.is_recurring === false
    if (isAdHoc) {
      if (t.specific_date !== isoDate) continue
    } else {
      if (t.day_of_week !== dow) continue
    }
    commitments.push({
      startMinutes: hhmmToMinutes(t.start_time),
      endMinutes: hhmmToMinutes(t.end_time),
      source: isAdHoc ? 'ad_hoc' : 'recurring',
      label: isAdHoc ? 'an ad-hoc slot' : 'a recurring availability block',
    })
  }

  // ── 2. group programmes: persisted sessions, else recurring fallback ──
  // Include draft/active/full (the coach's real intended schedule); exclude
  // completed/cancelled and soft-deleted. Mirrors the calendar's persisted-else-
  // recurring resolution per programme (Decision A).
  const { data: programmes } = await supabase
    .from('group_programmes')
    .select('id, day_of_week, days_of_week, start_time, duration_minutes, starts_at, ends_at')
    .eq('coach_profile_id', coachProfileId)
    .in('status', ['draft', 'active', 'full'])
    .is('deleted_at', null)

  const progRows = ((programmes ?? []) as ProgrammeRow[]).filter(
    (p) => !(opts.excludeProgrammeId && p.id === opts.excludeProgrammeId),
  )

  if (progRows.length > 0) {
    const programmeIds = progRows.map((p) => p.id)
    // Fetch all scheduled sessions from today forward (matching programmeSchedule's
    // window semantics), so we can tell which programmes are in "persisted mode".
    const cutoff = isoDate < todayISO() ? isoDate : todayISO()
    const { data: sessions } = await supabase
      .from('group_programme_sessions')
      .select('group_programme_id, session_date, start_time, end_time')
      .in('group_programme_id', programmeIds)
      .eq('status', 'scheduled')
      .gte('session_date', cutoff)

    const sessionRows = (sessions ?? []) as SessionRow[]
    const programmesWithSessions = new Set(sessionRows.map((s) => s.group_programme_id))

    // 2a. persisted sessions landing on isoDate
    for (const s of sessionRows) {
      if (datePart(s.session_date) !== isoDate) continue
      commitments.push({
        startMinutes: hhmmToMinutes(s.start_time),
        endMinutes: hhmmToMinutes(s.end_time),
        source: 'programme',
        label: 'a programme session',
      })
    }

    // 2b. recurring fallback for programmes with NO persisted sessions
    for (const p of progRows) {
      if (programmesWithSessions.has(p.id)) continue
      if (!recurringMatches(p, isoDate)) continue
      const startMin = hhmmToMinutes(p.start_time)
      commitments.push({
        startMinutes: startMin,
        endMinutes: startMin + p.duration_minutes,
        source: 'programme',
        label: 'a programme session',
      })
    }
  }

  // ── 3. confirmed 1-on-1 bookings on isoDate ──
  // Non-cancelled, non-no-show, not soft-deleted (mirrors the migration-034
  // partial-unique-index philosophy: freed/cancelled slots don't occupy time).
  const { data: bookings } = await supabase
    .from('bookings')
    .select('session_start_time, session_end_time')
    .eq('coach_profile_id', coachProfileId)
    .eq('session_date', isoDate)
    .is('deleted_at', null)
    // Unquoted PostgREST in-list — matches the established pattern in
    // src/app/api/coaches/bookings/route.ts. Quoted values silently no-match.
    .not('status', 'in', '(cancelled_parent,cancelled_coach,no_show)')

  for (const b of (bookings ?? []) as BookingRow[]) {
    commitments.push({
      startMinutes: hhmmToMinutes(b.session_start_time),
      endMinutes: hhmmToMinutes(b.session_end_time),
      source: 'booking',
      label: 'a confirmed booking',
    })
  }

  return commitments
}

/**
 * First commitment overlapping [startMinutes, endMinutes), or null. Half-open
 * overlap (adjacency is not a conflict) — see overlap.intervalsOverlap.
 */
export function findFirstConflict(
  startMinutes: number,
  endMinutes: number,
  commitments: readonly Commitment[],
): Commitment | null {
  for (const c of commitments) {
    if (startMinutes < c.endMinutes && endMinutes > c.startMinutes) return c
  }
  return null
}
