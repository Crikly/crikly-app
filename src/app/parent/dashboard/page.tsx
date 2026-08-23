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

// ── PROGRAMME-DASHBOARD-UPCOMING ─────────────────────────────────────────────
// Upcoming programme-enrolment sessions as UpcomingSessionCard rows — the
// dashboard box had the same gap /parent/bookings had: bookings only. Each
// upcoming session DATE the account is enrolled in becomes its own card
// (this box answers "what's coming up", unlike the bookings page's
// one-entry-per-enrolment ledger). Same query pattern and RLS surface as the
// bookings-page loader (migration 055 fixed _select_own); NOT shared code —
// that loader is private to its page and returns the bookings-page shape.
//
// Per-child scoping: card.childProfileId = enrolment.child_profile_id and the
// existing client filter does the rest. An enrolment with NO linked child
// (made before the child-picker existed, or a typed guest player) matches no
// activeChildId, so it appears under no child's box in parent mode — exactly
// how a null-child booking already behaves here; it stays fully visible on
// /parent/bookings. Approved decision (23 Aug).
//
// KNOWN LIMIT (same as the bookings page): the public RLS policies expose
// only status='active' programmes — enrolments on paused/completed
// programmes come back with a null join and are skipped with a loud log.

interface EnrolmentCardRow {
  id: string
  child_profile_id: string | null
  payment_model: string
  programme_id: string
  group_programmes:
    | {
        id: string
        title: string
        venue_name: string | null
        coach_profiles: { display_name: string | null } | { display_name: string | null }[] | null
        sports: { name: string } | { name: string }[] | null
      }
    | {
        id: string
        title: string
        venue_name: string | null
        coach_profiles: { display_name: string | null } | { display_name: string | null }[] | null
        sports: { name: string } | { name: string }[] | null
      }[]
    | null
}

interface EnrolmentSessionDateRow {
  id: string
  session_date: string
  start_time: string
  status: string
}

async function loadEnrolmentSessionCards(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userProfileId: string,
  todayDateStr: string,
  todayMidnight: Date,
): Promise<UpcomingSessionCard[]> {
  const { data: enrolRows, error } = await supabase
    .from('group_programme_enrolments')
    .select(
      `
      id,
      child_profile_id,
      payment_model,
      programme_id,
      group_programmes (
        id,
        title,
        venue_name,
        coach_profiles ( display_name ),
        sports ( name )
      )
    `,
    )
    .eq('booked_by_user_id', userProfileId)
    .eq('payment_status', 'succeeded')
    .eq('status', 'active')

  if (error) {
    console.error('[ParentDashboard] enrolments fetch failed:', error)
    return []
  }
  const enrolments = (enrolRows ?? []) as EnrolmentCardRow[]
  if (enrolments.length === 0) return []

  // Upcoming dates: per_session enrolments own explicit (session) links;
  // block enrolments cover every session of the programme.
  const perSessionIds = enrolments
    .filter((e) => e.payment_model === 'per_session')
    .map((e) => e.id)
  const blockProgrammeIds = [
    ...new Set(
      enrolments
        .filter((e) => e.payment_model === 'block')
        .map((e) => firstOf(e.group_programmes)?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const sessionsByEnrolment = new Map<string, EnrolmentSessionDateRow[]>()
  const sessionsByProgramme = new Map<string, EnrolmentSessionDateRow[]>()

  if (perSessionIds.length > 0) {
    const { data: linkRows, error: linkError } = await supabase
      .from('group_programme_enrolment_sessions')
      .select(
        'enrolment_id, group_programme_sessions ( id, session_date, start_time, status )',
      )
      .in('enrolment_id', perSessionIds)
    if (linkError) {
      console.error('[ParentDashboard] enrolment sessions fetch failed:', linkError)
    }
    for (const link of (linkRows ?? []) as {
      enrolment_id: string
      group_programme_sessions: EnrolmentSessionDateRow | EnrolmentSessionDateRow[] | null
    }[]) {
      const session = firstOf(link.group_programme_sessions)
      if (!session) continue
      const list = sessionsByEnrolment.get(link.enrolment_id) ?? []
      list.push(session)
      sessionsByEnrolment.set(link.enrolment_id, list)
    }
  }

  if (blockProgrammeIds.length > 0) {
    const { data: progSessions, error: progError } = await supabase
      .from('group_programme_sessions')
      .select('id, group_programme_id, session_date, start_time, status')
      .in('group_programme_id', blockProgrammeIds)
    if (progError) {
      console.error('[ParentDashboard] programme sessions fetch failed:', progError)
    }
    for (const session of (progSessions ?? []) as (EnrolmentSessionDateRow & {
      group_programme_id: string
    })[]) {
      const list = sessionsByProgramme.get(session.group_programme_id) ?? []
      list.push(session)
      sessionsByProgramme.set(session.group_programme_id, list)
    }
  }

  const cards: UpcomingSessionCard[] = []
  for (const enrolment of enrolments) {
    const programme = firstOf(enrolment.group_programmes)
    if (!programme) {
      console.error(
        '[ParentDashboard] enrolment skipped — programme not readable (inactive?):',
        enrolment.id,
      )
      continue
    }
    const coach = firstOf(programme.coach_profiles)
    const sport = firstOf(programme.sports)

    const dates =
      enrolment.payment_model === 'block'
        ? (sessionsByProgramme.get(programme.id) ?? [])
        : (sessionsByEnrolment.get(enrolment.id) ?? [])

    for (const session of dates) {
      if (session.status !== 'scheduled') continue
      if (session.session_date < todayDateStr) continue
      const sessionDate = new Date(`${session.session_date}T00:00:00`)
      const daysUntil = Math.max(
        0,
        Math.round(
          (sessionDate.getTime() - todayMidnight.getTime()) / 86_400_000,
        ),
      )
      cards.push({
        id: `${enrolment.id}:${session.id}`,
        childProfileId: enrolment.child_profile_id,
        coachName: coach?.display_name || 'Coach',
        sportName: sport?.name || 'Cricket',
        dateLabel: formatDayLabel(sessionDate),
        timeLabel: session.start_time.substring(0, 5),
        venueName: programme.venue_name,
        daysUntil,
      })
    }
  }
  return cards
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
    const todayMidnight = new Date(now)
    todayMidnight.setHours(0, 0, 0, 0)

    const [upcomingResult, lifetimeCountResult, programmesResult, enrolmentCards] =
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
        // PROGRAMME-DASHBOARD-UPCOMING: enrolment session cards, in the same
        // parallel batch so page latency doesn't stack.
        loadEnrolmentSessionCards(supabase, userProfile.id, todayDateStr, todayMidnight),
      ])

    dashboardData.lifetimeBookingsCount = lifetimeCountResult.count ?? 0

    const bookingCards = (upcomingResult.data ?? []).map(
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

    // PROGRAMME-DASHBOARD-UPCOMING: merge, re-sort (bookings arrive
    // date-ordered; enrolment cards are per-enrolment), keep the existing
    // 24-card cap. Bookings mapping above is untouched.
    dashboardData.sessions = [...bookingCards, ...enrolmentCards]
      .sort((a, b) =>
        a.daysUntil === b.daysUntil
          ? a.timeLabel.localeCompare(b.timeLabel)
          : a.daysUntil - b.daysUntil,
      )
      .slice(0, 24)

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
