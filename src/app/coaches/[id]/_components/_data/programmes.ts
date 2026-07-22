// P-00b: server-side fetch of a coach's bookable group programmes (Model A) for
// the public profile. Read directly via the RLS-respecting SSR client — NOT via
// the existing /api/coaches/[id] route (which must not be modified). The
// group_programmes_select_public RLS policy is USING (status = 'active'), so an
// anonymous visitor only ever receives active rows; a programme at capacity is
// still status='active' and is surfaced as "Full" (derived from current_spots).

import { createClient } from '@/lib/supabase/server'
import type { ProgrammeCardData } from '../ProgrammesCarousel'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function hhmm(t: string | null): string | null {
  if (!t) return null
  const parts = t.split(':')
  if (parts.length < 2) return null
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
}

// Display-only end-time for the schedule label. Sessions don't run past
// midnight in practice; the modulo keeps the label sane if one ever did.
function addMinutes(hhmmStr: string, mins: number): string {
  const [h, m] = hhmmStr.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor((total % 1440) / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

interface ProgrammeRow {
  id: string
  title: string
  sport_id: string
  age_groups: string[] | null
  schedule_type: string
  day_of_week: number | null
  days_of_week: number[] | null
  start_time: string | null
  duration_minutes: number
  max_spots: number
  current_spots: number
  price_per_session_pence: number
  payment_type: string
  venue_name: string | null
  starts_at: string | null
  status: string
  image_url: string | null
}

function buildSchedule(r: ProgrammeRow): string {
  const start = hhmm(r.start_time)
  const days =
    r.days_of_week && r.days_of_week.length > 0
      ? r.days_of_week
      : r.day_of_week !== null && r.day_of_week !== undefined
        ? [r.day_of_week]
        : []
  let dayPart = ''
  if (days.length === 1) dayPart = `Every ${DAY_ABBR[days[0]] ?? ''}`.trim()
  else if (days.length > 1) dayPart = days.map(d => DAY_ABBR[d] ?? '').filter(Boolean).join(', ')
  const timePart = start ? `${start} – ${addMinutes(start, r.duration_minutes)}` : ''
  return [dayPart, timePart].filter(Boolean).join(' · ') || 'Schedule TBC'
}

function buildStarting(startsAt: string | null): string | null {
  if (!startsAt) return null
  const d = new Date(startsAt)
  if (isNaN(d.getTime())) return null
  return `Starts ${DAY_ABBR[d.getDay()]} ${d.getDate()} ${MON_ABBR[d.getMonth()]}`
}

export async function fetchCoachProgrammes(coachProfileId: string): Promise<ProgrammeCardData[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_programmes')
    .select(
      'id, title, sport_id, age_groups, schedule_type, day_of_week, days_of_week, start_time, duration_minutes, max_spots, current_spots, price_per_session_pence, payment_type, venue_name, starts_at, status, image_url',
    )
    .eq('coach_profile_id', coachProfileId)
    .eq('model', 'programme')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('starts_at', { ascending: true })

  if (error || !data || data.length === 0) return []

  const rows = data as ProgrammeRow[]

  // Resolve sport names — group_programmes.sport_id has no FK to sports for a
  // nested join (same pattern as the coach API route), so look them up by id.
  const sportIds = [...new Set(rows.map(r => r.sport_id).filter(Boolean))]
  const sportNameById = new Map<string, string>()
  if (sportIds.length > 0) {
    const { data: sportsData } = await supabase.from('sports').select('id, name').in('id', sportIds)
    for (const s of (sportsData ?? []) as { id: string; name: string }[]) {
      sportNameById.set(s.id, s.name)
    }
  }

  return rows.map((r): ProgrammeCardData => ({
    id: r.id,
    title: r.title,
    sportName: sportNameById.get(r.sport_id) ?? 'Programme',
    ageGroups: r.age_groups ?? [],
    schedule: buildSchedule(r),
    starting: buildStarting(r.starts_at),
    venueName: r.venue_name,
    pricePence: r.price_per_session_pence,
    per: r.payment_type === 'block' ? 'total' : 'per session',
    filled: r.current_spots,
    total: r.max_spots,
    isFull: r.current_spots >= r.max_spots,
    imageUrl: r.image_url,
  }))
}
