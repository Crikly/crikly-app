import { createClient } from '@/lib/supabase/server'
import { ParentDashboardClient } from '@/components/parent/dashboard/ParentDashboardClient'
import { childIdentityColour, firstNameOf } from '@/constants/childIdentity'
import type {
  ChildSummary,
  ParentDashboardData,
  ProgrammeCardData,
  UpcomingSessionCard,
} from '@/components/parent/dashboard/types'

// P-04-A (Screen 06): parent dashboard data assembly. Same shape as
// coach/dashboard/page.tsx — one server component fetches everything
// (child data must never be fetched client-side — COPPA rule), then hands
// a single typed prop to the client orchestrator. Failures degrade to
// empty defaults with a server-side error log.

// Supabase nested joins may come back as object or array depending on the
// relationship's inferred cardinality (same normalisation as
// coach/dashboard/page.tsx).
function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** Display-only pence → pounds label. Never store the result back. */
function poundsLabel(pence: number): string {
  const pounds = pence / 100
  return Number.isInteger(pounds)
    ? `£${pounds}`
    : `£${pounds.toFixed(2)}`
}

interface ProgrammeRow {
  id: string
  title: string
  venue_name: string | null
  starts_at: string | null
  start_time: string | null
  days_of_week: number[] | null
  max_spots: number
  current_spots: number
  payment_type: string
  price_per_session_pence: number | null
  block_price_pence: number | null
  coach_profiles: { display_name: string | null } | { display_name: string | null }[] | null
}

// Next occurrence for a rolling/recurring programme — simplified from
// coach/dashboard/page.tsx nextProgrammeOccurrence (14-day forward scan).
function nextProgrammeDate(programme: ProgrammeRow, now: Date): Date | null {
  if (programme.starts_at) {
    const startsAt = new Date(programme.starts_at)
    if (startsAt.getTime() > now.getTime()) return startsAt
  }
  if (!programme.days_of_week?.length || !programme.start_time) return null
  const [h = 0, m = 0] = programme.start_time.split(':').map(Number)
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + dayOffset)
    candidate.setHours(h, m, 0, 0)
    if (!programme.days_of_week.includes(candidate.getDay())) continue
    if (candidate.getTime() <= now.getTime()) continue
    return candidate
  }
  return null
}

// Data assembly is a plain async function (no JSX) so the try/catch only
// guards data fetching — rendering errors stay with React error
// boundaries (react-hooks/error-boundaries).
async function loadDashboardData(): Promise<ParentDashboardData> {
  const supabase = await createClient()

  const dashboardData: ParentDashboardData = {
    firstName: '',
    playerMode: false,
    locationCity: null,
    children: [],
    sessions: [],
    programmes: [],
    lifetimeBookingsCount: 0,
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return dashboardData

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id, full_name, active_role, location_city')
      .eq('auth_user_id', user.id)
      .single()
    if (!userProfile) return dashboardData

    dashboardData.firstName = firstNameOf(userProfile.full_name ?? '')
    dashboardData.locationCity = userProfile.location_city ?? null

    // Children hang off parent_profiles, not user_profiles (join path:
    // user_profiles.id → parent_profiles.user_profile_id →
    // child_profiles.parent_profile_id). A player-only account has no
    // parent_profiles row — children stay [].
    const { data: parentProfile } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .is('deleted_at', null)
      .maybeSingle()

    let childRows: Array<{ id: string; full_name: string }> = []
    if (parentProfile) {
      const { data } = await supabase
        .from('child_profiles')
        .select('id, full_name')
        .eq('parent_profile_id', parentProfile.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      childRows = data ?? []
    }

    dashboardData.children = childRows.map(
      (child, index): ChildSummary => ({
        id: child.id,
        fullName: child.full_name,
        firstName: firstNameOf(child.full_name),
        colour: childIdentityColour(index),
      }),
    )

    // Approved clarification (P-04-A step 0, point 5): player active_role
    // with zero children books for themselves — skip bubbles + subline.
    dashboardData.playerMode =
      userProfile.active_role === 'player' &&
      dashboardData.children.length === 0

    const now = new Date()
    const todayDateStr = now.toISOString().split('T')[0] ?? ''

    const [upcomingResult, lifetimeCountResult, programmesResult] =
      await Promise.all([
        // Upcoming confirmed sessions across all this account's bookings —
        // grouped per child client-side so switching the active child is
        // pure local state (no follow-up fetches).
        supabase
          .from('bookings')
          .select(
            `
            id,
            child_profile_id,
            session_date,
            session_start_time,
            venue_name,
            coach_profiles ( display_name ),
            sports ( name )
          `,
          )
          .eq('booked_by_user_id', userProfile.id)
          .eq('status', 'confirmed')
          .gte('session_date', todayDateStr)
          .is('deleted_at', null)
          .order('session_date', { ascending: true })
          .order('session_start_time', { ascending: true })
          .limit(24),
        // Lifetime bookings (any status) — "How booking works" hides
        // permanently once this is > 0.
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('booked_by_user_id', userProfile.id)
          .is('deleted_at', null),
        // Active programmes. "Near" is the parent's city label only for
        // now — P-08 adds real geo-distance filtering.
        supabase
          .from('group_programmes')
          .select(
            `
            id,
            title,
            venue_name,
            starts_at,
            start_time,
            days_of_week,
            max_spots,
            current_spots,
            payment_type,
            price_per_session_pence,
            block_price_pence,
            coach_profiles ( display_name )
          `,
          )
          .eq('status', 'active')
          .is('deleted_at', null)
          .or(`ends_at.gte.${now.toISOString()},ends_at.is.null`)
          .order('starts_at', { ascending: true })
          .limit(10),
      ])

    dashboardData.lifetimeBookingsCount = lifetimeCountResult.count ?? 0

    const todayMidnight = new Date(now)
    todayMidnight.setHours(0, 0, 0, 0)

    dashboardData.sessions = (upcomingResult.data ?? []).map(
      (booking): UpcomingSessionCard => {
        const coach = firstOf(booking.coach_profiles)
        const sport = firstOf(booking.sports)
        const sessionDate = new Date(`${booking.session_date}T00:00:00`)
        const daysUntil = Math.max(
          0,
          Math.round(
            (sessionDate.getTime() - todayMidnight.getTime()) / 86_400_000,
          ),
        )
        return {
          id: booking.id,
          childProfileId: booking.child_profile_id,
          coachName: coach?.display_name || 'Coach',
          sportName: sport?.name || 'Cricket',
          dateLabel: formatDayLabel(sessionDate),
          timeLabel: booking.session_start_time.substring(0, 5),
          venueName: booking.venue_name,
          daysUntil,
        }
      },
    )

    dashboardData.programmes = (programmesResult.data ?? [])
      .filter((programme) => programme.max_spots - programme.current_spots > 0)
      .map((programme): ProgrammeCardData => {
        const coach = firstOf(programme.coach_profiles)
        const nextDate = nextProgrammeDate(programme, now)
        const priceLabel =
          programme.payment_type === 'block_upfront' &&
          programme.block_price_pence !== null
            ? `${poundsLabel(programme.block_price_pence)} block`
            : programme.price_per_session_pence !== null
              ? `${poundsLabel(programme.price_per_session_pence)} / session`
              : ''
        return {
          id: programme.id,
          title: programme.title,
          coachName: coach?.display_name || 'Coach',
          venueName: programme.venue_name,
          nextDateLabel: nextDate ? formatDayLabel(nextDate) : null,
          spotsRemaining: programme.max_spots - programme.current_spots,
          priceLabel,
        }
      })
  } catch (error) {
    // Same degrade-to-defaults convention as coach/dashboard/page.tsx —
    // log so the failure surfaces in Vercel logs instead of a silently
    // empty dashboard.
    console.error('[ParentDashboard] data fetch failed:', error)
  }

  return dashboardData
}

export default async function ParentDashboardPage() {
  const data = await loadDashboardData()
  return <ParentDashboardClient data={data} />
}
