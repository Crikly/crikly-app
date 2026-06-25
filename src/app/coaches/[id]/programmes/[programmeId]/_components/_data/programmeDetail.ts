// P-00c-D1: server-side data layer for the public programme detail page
// (/coaches/[id]/programmes/[programmeId]). Mirrors the P-00b carousel data
// pattern — separate, RLS-respecting queries via the SSR client, never nested
// `!inner` joins (Fix-16d safe). The coach is resolved through the existing
// /api/coaches/[id] route (slug-or-UUID aware, untouched); the programme,
// its sessions, and the sport name are read directly from the database.
//
// Camp detection uses the authoritative group_programmes.camp_mode flag
// (migration 031). A camp programme groups its sessions by date; a standard
// programme renders one row per session.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ─── View types (serialisable — passed to client components) ───────────────────

export interface CoachLite {
  id: string
  fullName: string
  dbsVerified: boolean
  ratingAvg: number | null
  ratingCount: number
}

export interface SessionView {
  /** Stable key — `${dateISO}#${startTime}` (unique within a programme). */
  key: string
  dateISO: string
  dateLabel: string // "Sat 28 June"
  timeLabel: string // "9:00am – 10:00am"
  timeShort: string // "9–10am"
  slotName: string | null // camp only — derived time-of-day label
  pricePence: number
  /** Selectable when scheduled and not in the past. */
  selectable: boolean
  /** Disabled-pill copy when not selectable ("Closed"). */
  closedLabel: string | null
}

export interface CampDay {
  dateISO: string
  dateLabel: string // "Mon 28 July"
  slots: SessionView[]
}

export interface ScheduleRow {
  number: number
  dateLabel: string // "Sat 28 June"
  timeShort: string // "9–10am"
}

export interface ProgrammeDetailView {
  id: string
  coach: CoachLite
  title: string
  sportName: string
  ageGroups: string[]
  scheduleType: string
  paymentType: 'per_session' | 'block_upfront'
  campMode: boolean
  currency: string
  scheduleLabel: string // "Every Saturday · 9:00am – 10:00am"
  startingLabel: string | null // "28 June 2026"
  durationLabel: string | null // "8 weeks" / "Ongoing" / "5 days"
  spanLabel: string | null // "28 Jun – 16 Aug 2026"
  maxSpots: number
  currentSpots: number
  spotsLeft: number
  fillPct: number
  scarcity: string | null // "Filling up" / "Almost full"
  pricePerSessionPence: number | null
  blockTotalPence: number | null
  sessionCount: number
  // State 1 (per_session)
  sessions: SessionView[]
  campDays: CampDay[]
  // State 2 (block_upfront)
  schedule: ScheduleRow[]
}

// ─── Row shapes ────────────────────────────────────────────────────────────────

interface ProgrammeRow {
  id: string
  coach_profile_id: string
  sport_id: string
  title: string
  age_groups: string[] | null
  schedule_type: string
  day_of_week: number | null
  days_of_week: number[] | null
  start_time: string | null
  duration_minutes: number
  max_spots: number
  current_spots: number
  payment_type: string
  price_per_session_pence: number | null
  block_price_pence: number | null
  block_session_count: number | null
  starts_at: string | null
  ends_at: string | null
  camp_mode: boolean
  currency: string
  status: string
}

interface SessionRow {
  session_date: string
  start_time: string
  end_time: string
  slots: { startTime: string; endTime: string }[] | null
  status: string
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse a 'YYYY-MM-DD' date at local noon to avoid timezone date-rollover. */
function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`)
}

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** "09:00:00" → { h: 9, m: 0 }. Number() yields NaN (not null) on bad input,
 * which nullish coalescing won't catch — guard with isFinite so a malformed
 * time never renders as "NaN:NaNam" on the public page. */
function parseTime(t: string): { h: number; m: number } {
  const parts = t.split(':').map(Number)
  return {
    h: Number.isFinite(parts[0]) ? parts[0] : 0,
    m: Number.isFinite(parts[1]) ? parts[1] : 0,
  }
}

/** Normalise a time to "HH:MM:SS" — accepts "HH:MM" (slot jsonb) or "HH:MM:SS". */
function normaliseTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t.slice(0, 8)
}

/** "09:00:00" → "9:00am" */
function fmt12(t: string): string {
  const { h, m } = parseTime(t)
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

/** Compact hour for a range edge — "9" or "9:30". */
function compactHour(t: string): string {
  const { h, m } = parseTime(t)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, '0')}`
}

function ampm(t: string): string {
  return parseTime(t).h < 12 ? 'am' : 'pm'
}

/** "09:00:00","10:00:00" → "9:00am – 10:00am" */
function fmtRange(start: string, end: string): string {
  return `${fmt12(start)} – ${fmt12(end)}`
}

/** "09:00:00","10:00:00" → "9–10am" (drops the am/pm on the start when shared). */
function fmtRangeShort(start: string, end: string): string {
  const sa = ampm(start)
  const ea = ampm(end)
  const startPart = sa === ea ? compactHour(start) : `${compactHour(start)}${sa}`
  return `${startPart}–${compactHour(end)}${ea}`
}

/** "2026-06-28" → "Sat 28 June" */
function fmtDateLabel(iso: string): string {
  const d = parseDate(iso)
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MON_LONG[d.getMonth()]}`
}

/** ISO timestamp/date → "28 June 2026" */
function fmtStarting(iso: string): string {
  const d = parseDate(iso)
  return `${d.getDate()} ${MON_LONG[d.getMonth()]} ${d.getFullYear()}`
}

/** "28 Jun – 16 Aug 2026" from first/last session dates. */
function fmtSpan(firstISO: string, lastISO: string): string {
  const a = parseDate(firstISO)
  const b = parseDate(lastISO)
  const left = `${a.getDate()} ${MON_SHORT[a.getMonth()]}`
  const right = `${b.getDate()} ${MON_SHORT[b.getMonth()]} ${b.getFullYear()}`
  return `${left} – ${right}`
}

/** Time-of-day name for a camp slot, derived from its start hour. */
function slotName(start: string): string {
  const { h } = parseTime(start)
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

// ─── Coach (read-only via the existing API route) ──────────────────────────────

interface CoachApiResponse {
  id: string
  full_name: string
  dbs_status: string
  rating_avg: number | null
  rating_count: number
}

export const fetchCoachLite = cache(async (idOrSlug: string): Promise<CoachLite | null> => {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base && process.env.NODE_ENV !== 'development') {
    // Surface a misconfigured deployment instead of silently 404ing every page.
    console.error('[fetchCoachLite] NEXT_PUBLIC_APP_URL is not set — falling back to localhost')
  }
  const baseUrl = base || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/coaches/${idOrSlug}`, { next: { revalidate: 30 } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch coach: ${res.status}`)
  const coach = (await res.json()) as CoachApiResponse
  return {
    id: coach.id,
    fullName: coach.full_name,
    dbsVerified: coach.dbs_status === 'verified',
    ratingAvg: coach.rating_avg,
    ratingCount: coach.rating_count,
  }
})

// ─── Programme detail ──────────────────────────────────────────────────────────

export const fetchProgrammeDetail = cache(
  async (idOrSlug: string, programmeId: string): Promise<ProgrammeDetailView | null> => {
    const coach = await fetchCoachLite(idOrSlug)
    if (!coach) return null

    const supabase = await createClient()

    const { data: programmeData, error: programmeError } = await supabase
      .from('group_programmes')
      .select(
        'id, coach_profile_id, sport_id, title, age_groups, schedule_type, day_of_week, days_of_week, start_time, duration_minutes, max_spots, current_spots, payment_type, price_per_session_pence, block_price_pence, block_session_count, starts_at, ends_at, camp_mode, currency, status',
      )
      .eq('id', programmeId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()

    if (programmeError || !programmeData) return null
    const programme = programmeData as ProgrammeRow

    // The programme must belong to the coach in the URL — guards against a
    // mismatched coach/programme pair resolving to a real page.
    if (programme.coach_profile_id !== coach.id) return null

    // Sport name — separate lookup (no FK join, same pattern as the coach route).
    const { data: sportData } = await supabase
      .from('sports')
      .select('name')
      .eq('id', programme.sport_id)
      .maybeSingle()
    const sportName = (sportData as { name: string } | null)?.name ?? 'Programme'

    // Sessions — the canonical schedule.
    const { data: sessionData } = await supabase
      .from('group_programme_sessions')
      .select('session_date, start_time, end_time, slots, status')
      .eq('group_programme_id', programme.id)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })
    const sessionRows = (sessionData ?? []) as SessionRow[]

    const today = todayISO()
    const pricePence = programme.price_per_session_pence

    // Flatten camp slots into individual session views (one per bookable block).
    const sessions: SessionView[] = []
    for (const row of sessionRows) {
      const blocks =
        programme.camp_mode && row.slots && row.slots.length > 0
          ? row.slots.map((s) => ({ start: normaliseTime(s.startTime), end: normaliseTime(s.endTime) }))
          : [{ start: row.start_time, end: row.end_time }]

      for (const block of blocks) {
        const past = row.session_date < today
        const cancelled = row.status === 'cancelled' || row.status === 'completed'
        const selectable = !past && !cancelled
        sessions.push({
          key: `${row.session_date}#${block.start}`,
          dateISO: row.session_date,
          dateLabel: fmtDateLabel(row.session_date),
          timeLabel: fmtRange(block.start, block.end),
          timeShort: fmtRangeShort(block.start, block.end),
          slotName: programme.camp_mode ? slotName(block.start) : null,
          pricePence: pricePence ?? 0,
          selectable,
          closedLabel: selectable ? null : 'Closed',
        })
      }
    }

    // Group by date for the camp picker.
    const campDays: CampDay[] = []
    if (programme.camp_mode) {
      const byDate = new Map<string, SessionView[]>()
      for (const s of sessions) {
        const list = byDate.get(s.dateISO) ?? []
        list.push(s)
        byDate.set(s.dateISO, list)
      }
      for (const [dateISO, slots] of byDate) {
        campDays.push({ dateISO, dateLabel: fmtDateLabel(dateISO), slots })
      }
    }

    // Numbered schedule for the block_upfront state.
    const schedule: ScheduleRow[] = sessions.map((s, i) => ({
      number: i + 1,
      dateLabel: s.dateLabel,
      timeShort: s.timeShort,
    }))

    // ── Derived display facts ──
    const dayNumbers =
      programme.days_of_week && programme.days_of_week.length > 0
        ? programme.days_of_week
        : programme.day_of_week !== null
          ? [programme.day_of_week]
          : [...new Set(sessionRows.map((r) => parseDate(r.session_date).getDay()))]

    let dayPart = ''
    if (dayNumbers.length === 1) dayPart = `Every ${DAY_LONG[dayNumbers[0]]}`
    else if (dayNumbers.length > 1) dayPart = dayNumbers.map((d) => DAY_SHORT[d]).join(', ')

    let timePart = ''
    if (!programme.camp_mode && programme.start_time) {
      const start = programme.start_time
      const { h, m } = parseTime(start)
      const endTotal = h * 60 + m + programme.duration_minutes
      const endStr = `${String(Math.floor((endTotal % 1440) / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}:00`
      timePart = fmtRange(start, endStr)
    }
    const scheduleLabel = [dayPart, timePart].filter(Boolean).join(' · ') || 'Schedule TBC'

    const startingLabel = programme.starts_at
      ? fmtStarting(programme.starts_at)
      : sessionRows.length > 0
        ? fmtStarting(sessionRows[0].session_date)
        : null

    const distinctDates = new Set(sessionRows.map((r) => r.session_date)).size
    let durationLabel: string | null = null
    if (programme.schedule_type === 'rolling') durationLabel = 'Ongoing'
    else if (programme.camp_mode) durationLabel = distinctDates > 0 ? `${distinctDates} day${distinctDates !== 1 ? 's' : ''}` : null
    else if (distinctDates > 0) durationLabel = `${distinctDates} week${distinctDates !== 1 ? 's' : ''}`

    const spanLabel =
      sessionRows.length > 1
        ? fmtSpan(sessionRows[0].session_date, sessionRows[sessionRows.length - 1].session_date)
        : null

    const spotsLeft = Math.max(0, programme.max_spots - programme.current_spots)
    const fillPct = programme.max_spots > 0 ? Math.min(100, Math.round((programme.current_spots / programme.max_spots) * 100)) : 0
    let scarcity: string | null = null
    if (spotsLeft > 0 && spotsLeft <= 2) scarcity = 'Almost full'
    else if (spotsLeft > 0 && spotsLeft <= Math.ceil(programme.max_spots / 2)) scarcity = 'Filling up'

    const sessionCount = programme.block_session_count ?? distinctDates
    const blockTotalPence =
      programme.block_price_pence ?? (pricePence !== null ? pricePence * sessionCount : null)

    const paymentType: 'per_session' | 'block_upfront' =
      programme.payment_type === 'block_upfront' ? 'block_upfront' : 'per_session'

    return {
      id: programme.id,
      coach,
      title: programme.title,
      sportName,
      ageGroups: programme.age_groups ?? [],
      scheduleType: programme.schedule_type,
      paymentType,
      campMode: programme.camp_mode,
      currency: programme.currency,
      scheduleLabel,
      startingLabel,
      durationLabel,
      spanLabel,
      maxSpots: programme.max_spots,
      currentSpots: programme.current_spots,
      spotsLeft,
      fillPct,
      scarcity,
      pricePerSessionPence: pricePence,
      blockTotalPence,
      sessionCount,
      sessions,
      campDays,
      schedule,
    }
  },
)
