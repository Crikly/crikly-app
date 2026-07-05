// P-00b-D2: server-side fetch of a coach's group-programme sessions for the
// full availability calendar. Read directly via the RLS-respecting SSR client
// (NOT via /api/coaches/[id], which must not be modified).
//
// Two schedule sources, in priority order, per programme:
//   1. Persisted rows in group_programme_sessions (the canonical schedule,
//      docs/03 §6.4). SELECT RLS is public when the parent programme is
//      status='active', so a guest sees exactly the right rows.
//   2. Fallback — many programmes have NO session rows and instead carry a
//      recurring day_of_week / days_of_week + start_time on group_programmes
//      itself. We expand that pattern across the visible calendar window.

import { createClient } from '@/lib/supabase/server'
import { expandSessionBlocks } from '@/lib/availability/campSlots'
import { localISODate } from './slots'

export interface DayProgramme {
  id: string
  title: string
  sportName: string
  ageGroups: string[]
  /** 'HH:MM' for this session, or null when unset. */
  startTime: string | null
  /**
   * BUG-16: 'HH:MM' end of this session — the persisted session's end_time, or
   * (for recurring-pattern programmes with no session rows) start_time +
   * duration_minutes. Drives the overlap test that suppresses a colliding 1-on-1
   * slot on the public calendar. Null only when startTime is also null.
   */
  endTime: string | null
  /**
   * UX-11: where this programme's sessions take place (group_programmes.venue_name),
   * or null when the coach set no venue.
   */
  venueName: string | null
  /**
   * UX-12: the programme's commencing date (group_programmes.starts_at), or null
   * for rolling programmes with no fixed start. Drives the "Starting …" label.
   */
  startsAt: string | null
  pricePence: number
  per: 'session' | 'total'
  spotsLeft: number
  isFull: boolean
}

export interface ProgrammeSchedule {
  /** YYYY-MM-DD → programmes running that day (sorted by start time). */
  byDate: Record<string, DayProgramme[]>
  /** Sorted unique dates that have at least one session. */
  programmeDates: string[]
}

interface SessionRow {
  session_date: string
  start_time: string | null
  end_time: string | null
  status: string
  /** Camp-mode blocks (jsonb) — expanded via expandSessionBlocks (BUG-19 Phase 2). */
  slots: unknown
}

interface ProgrammeRow {
  id: string
  title: string
  sport_id: string
  age_groups: string[] | null
  max_spots: number
  current_spots: number
  price_per_session_pence: number | null
  block_price_pence: number | null
  payment_type: string
  day_of_week: number
  days_of_week: number[] | null
  start_time: string
  duration_minutes: number
  starts_at: string | null
  ends_at: string | null
  venue_name: string | null
  group_programme_sessions: SessionRow[] | null
}

/**
 * Calendar dates for a programme with NO persisted session rows: expand its
 * recurring weekday pattern (days_of_week when present, else the legacy
 * day_of_week) across [windowStart, windowEnd], bounded by the programme's own
 * starts_at / ends_at anchors when set.
 */
/**
 * Parse the date portion of a timestamptz/date string as LOCAL midnight. Using
 * `new Date(ts)` then flooring would shift midnight-UTC anchors back a day in
 * BST (UTC+1); these anchors conceptually carry a date, so we take YYYY-MM-DD.
 */
function dateAnchor(ts: string | null): Date | null {
  if (!ts) return null
  const [y, m, d] = ts.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * BUG-16: 'HH:MM' (or 'HH:MM:SS') + N minutes → 'HH:MM', clamped to 23:59 so a
 * late session can't wrap past midnight. Used to derive a recurring-pattern
 * programme's end time from start_time + duration_minutes.
 */
function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function recurringDates(row: ProgrammeRow, windowStart: Date, windowEnd: Date): string[] {
  const days = row.days_of_week && row.days_of_week.length > 0 ? row.days_of_week : [row.day_of_week]
  const daySet = new Set(days)

  let start = new Date(windowStart)
  const startAnchor = dateAnchor(row.starts_at)
  if (startAnchor && startAnchor > start) start = startAnchor

  let end = new Date(windowEnd)
  const endAnchor = dateAnchor(row.ends_at)
  if (endAnchor && endAnchor < end) end = endAnchor

  const out: string[] = []
  const cur = new Date(start)
  while (cur <= end) {
    if (daySet.has(cur.getDay())) out.push(localISODate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export async function fetchProgrammeSchedule(coachProfileId: string): Promise<ProgrammeSchedule> {
  const supabase = await createClient()

  // Visible window: today through the end of next month (the calendar opens on
  // the current month and pages forward one). Recurring programmes are expanded
  // across this window; persisted sessions are filtered to it at the DB layer.
  const now = new Date()
  const windowStart = new Date(now)
  windowStart.setHours(0, 0, 0, 0)
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  windowEnd.setHours(0, 0, 0, 0)
  const cutoff = localISODate(windowStart)

  const { data, error } = await supabase
    .from('group_programmes')
    .select(
      'id, title, sport_id, age_groups, max_spots, current_spots, price_per_session_pence, block_price_pence, payment_type, day_of_week, days_of_week, start_time, duration_minutes, starts_at, ends_at, venue_name, group_programme_sessions(session_date, start_time, end_time, status, slots)',
    )
    .eq('coach_profile_id', coachProfileId)
    .eq('model', 'programme')
    // active + full are both publicly visible (RLS §6.3); a full programme
    // still shows on the calendar with its "Full" indicator.
    .in('status', ['active', 'full'])
    .is('deleted_at', null)
    .eq('group_programme_sessions.status', 'scheduled')
    .gte('group_programme_sessions.session_date', cutoff)

  if (error) {
    console.error('[fetchProgrammeSchedule] Supabase error:', error.message)
    return { byDate: {}, programmeDates: [] }
  }
  if (!data || data.length === 0) {
    return { byDate: {}, programmeDates: [] }
  }

  const rows = data as ProgrammeRow[]

  // Resolve sport names — group_programmes.sport_id has no FK to sports for a
  // nested join (same pattern as the profile programmes fetch), so look them up.
  const sportIds = [...new Set(rows.map(r => r.sport_id).filter(Boolean))]
  const sportNameById = new Map<string, string>()
  if (sportIds.length > 0) {
    const { data: sportsData } = await supabase.from('sports').select('id, name').in('id', sportIds)
    for (const s of (sportsData ?? []) as { id: string; name: string }[]) {
      sportNameById.set(s.id, s.name)
    }
  }

  const byDate: Record<string, DayProgramme[]> = {}

  for (const r of rows) {
    const base = {
      id: r.id,
      title: r.title,
      sportName: sportNameById.get(r.sport_id) ?? 'Programme',
      ageGroups: r.age_groups ?? [],
      venueName: r.venue_name,
      startsAt: r.starts_at,
      pricePence:
        r.payment_type === 'block_upfront'
          ? r.block_price_pence ?? 0
          : r.price_per_session_pence ?? 0,
      per: (r.payment_type === 'block_upfront' ? 'total' : 'session') as 'session' | 'total',
      spotsLeft: Math.max(0, r.max_spots - r.current_spots),
      isFull: r.current_spots >= r.max_spots,
    }

    // Prefer persisted future sessions; fall back to the recurring pattern when
    // a programme has none (group_programme_sessions empty).
    const persisted = (r.group_programme_sessions ?? []).filter(
      s => s.status === 'scheduled' && s.session_date.slice(0, 10) >= cutoff,
    )

    // BUG-16: each dated entry now carries an end time too. Persisted rows use
    // their own end_time; recurring-pattern rows derive it from the programme's
    // start_time + duration_minutes.
    //
    // BUG-19 Phase 2 (Option B): a camp-mode session expands to one entry PER
    // slots-array block, so a camp's afternoon block suppresses colliding
    // 1-on-1 slots (and renders on the calendar) exactly like its first block.
    // A session with no usable times still yields a single null-times entry —
    // the pre-existing "programme chip without a time" behaviour.
    const recurringEnd = r.start_time ? addMinutesToHHMM(r.start_time, r.duration_minutes) : null
    const dated: { date: string; startTime: string | null; endTime: string | null }[] =
      persisted.length > 0
        ? persisted.flatMap((s): { date: string; startTime: string | null; endTime: string | null }[] => {
            const date = s.session_date.slice(0, 10)
            const blocks = expandSessionBlocks(s)
            if (blocks.length === 0) return [{ date, startTime: null, endTime: null }]
            return blocks.map(block => ({ date, startTime: block.startTime, endTime: block.endTime }))
          })
        : recurringDates(r, windowStart, windowEnd).map(date => ({
            date,
            startTime: r.start_time ? r.start_time.slice(0, 5) : null,
            endTime: recurringEnd,
          }))

    for (const { date, startTime, endTime } of dated) {
      ;(byDate[date] ??= []).push({ ...base, startTime, endTime })
    }
  }

  for (const date of Object.keys(byDate)) {
    byDate[date].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }

  return { byDate, programmeDates: Object.keys(byDate).sort() }
}
