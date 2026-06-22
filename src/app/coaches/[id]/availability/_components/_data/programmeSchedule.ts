// P-00b-D2: server-side fetch of a coach's group-programme sessions for the
// full availability calendar. Read directly via the RLS-respecting SSR client
// (NOT via /api/coaches/[id], which must not be modified).
//
// group_programme_sessions is the canonical per-date schedule (docs/03 §6.4) and
// its SELECT RLS is "public when the parent programme is status='active'", so an
// anonymous visitor receives exactly the right rows. We embed the sessions in a
// single query off group_programmes (FK group_programme_id → group_programmes.id).

import { createClient } from '@/lib/supabase/server'

export interface DayProgramme {
  id: string
  title: string
  sportName: string
  ageGroups: string[]
  /** 'HH:MM' for this session, or null when unset. */
  startTime: string | null
  pricePence: number
  per: 'session' | 'total'
  spotsLeft: number
  isFull: boolean
}

export interface ProgrammeSchedule {
  /** YYYY-MM-DD → programmes running that day (sorted by start time). */
  byDate: Record<string, DayProgramme[]>
  /** Sorted unique dates that have at least one scheduled session. */
  programmeDates: string[]
}

interface SessionRow {
  session_date: string
  start_time: string | null
  status: string
}

interface ProgrammeRow {
  id: string
  title: string
  sport_id: string
  age_groups: string[] | null
  max_spots: number
  current_spots: number
  price_per_session_pence: number | null
  payment_type: string
  group_programme_sessions: SessionRow[] | null
}

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export async function fetchProgrammeSchedule(coachProfileId: string): Promise<ProgrammeSchedule> {
  const supabase = await createClient()

  const cutoff = todayISO()

  // Embedded-resource filters (regular embed, not !inner) trim the sessions
  // array to scheduled, future rows at the DB layer — programmes with no
  // upcoming sessions still return (with an empty array) and contribute
  // nothing. The app-level guards below are kept as defence-in-depth.
  const { data, error } = await supabase
    .from('group_programmes')
    .select(
      'id, title, sport_id, age_groups, max_spots, current_spots, price_per_session_pence, payment_type, group_programme_sessions(session_date, start_time, status)',
    )
    .eq('coach_profile_id', coachProfileId)
    .eq('model', 'programme')
    .eq('status', 'active')
    .is('deleted_at', null)
    .eq('group_programme_sessions.status', 'scheduled')
    .gte('group_programme_sessions.session_date', cutoff)

  if (error || !data || data.length === 0) {
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
    const sessions = r.group_programme_sessions ?? []
    for (const s of sessions) {
      if (s.status !== 'scheduled') continue
      const date = s.session_date.slice(0, 10)
      if (date < cutoff) continue // hide past sessions
      const card: DayProgramme = {
        id: r.id,
        title: r.title,
        sportName: sportNameById.get(r.sport_id) ?? 'Programme',
        ageGroups: r.age_groups ?? [],
        startTime: s.start_time ? s.start_time.slice(0, 5) : null,
        pricePence: r.price_per_session_pence ?? 0,
        per: r.payment_type === 'block' ? 'total' : 'session',
        spotsLeft: Math.max(0, r.max_spots - r.current_spots),
        isFull: r.current_spots >= r.max_spots,
      }
      ;(byDate[date] ??= []).push(card)
    }
  }

  for (const date of Object.keys(byDate)) {
    byDate[date].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
  }

  return { byDate, programmeDates: Object.keys(byDate).sort() }
}
