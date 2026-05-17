import { createClient } from '@/lib/supabase/server'
import { CoachHomeClient } from '@/components/coach/CoachHomeClient'

interface Programme {
  id: string
  title: string
  current_spots: number
  max_spots: number
  status: string
  /** CF-PROGRAMMES-IMAGE-PICKER */
  image_url: string | null
}

interface DashboardData {
  coachName: string
  coachAvatarUrl: string | null
  profileCompletion: {
    percentage: number
    completedSteps: boolean[]
  }
  pendingApprovalsCount: number
  upNextSession: {
    title: string
    startTime: string
    endTime: string
    venue: string
    startsInMinutes: number
    sessionType: '1-to-1' | 'group'
    groupProgrammeId?: string
  } | null
  weeklyStats: {
    sessionsThisWeek: number
    bookingsPending: number
    /** Display value in major currency units (£), derived from sum(coach_price_pence) / 100. Display-only — never store back. */
    revenueThisWeek: number
    completionRate: number
  }
  todaySessions: Array<{
    time: string
    duration: string
    title: string
    location: string
    isActive: boolean
    type?: string
  }>
  rating: {
    average: number
    count: number
  }
  programmes: Programme[]
}

// BUG-UPNEXT-PROGRAMME-SESSIONS: helper to compute the next occurrence of a
// group programme. Programmes recur on days_of_week at start_time — there
// are no rows in the bookings table for them. We project forward up to 14
// days from `now` and return the first slot that:
//   - falls on one of the programme's days_of_week
//   - is strictly in the future (not the time-of-day already passed today)
//   - is before ends_at (if set; null means rolling/open-ended)
// Returns null if no valid occurrence in the window or if the programme
// has incomplete schedule data.
interface ProgrammeScheduleRow {
  id: string
  title: string
  days_of_week: number[] | null
  start_time: string | null
  duration_minutes: number
  ends_at: string | null
  venue_name: string | null
  status: string
}

interface ProgrammeOccurrence {
  datetime: Date
  durationMinutes: number
  title: string
  venueName: string | null
  programmeId: string
}

function nextProgrammeOccurrence(
  programme: ProgrammeScheduleRow,
  now: Date,
): ProgrammeOccurrence | null {
  const { days_of_week, start_time, duration_minutes, ends_at, title, venue_name, id } = programme
  if (!days_of_week || days_of_week.length === 0 || !start_time) return null

  const [h, m] = start_time.split(':').map(Number) // HH:MM[:SS] — seconds ignored
  const endsAtMs = ends_at ? new Date(ends_at).getTime() : null

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + dayOffset)
    candidate.setHours(h, m, 0, 0)

    if (!days_of_week.includes(candidate.getDay())) continue
    if (candidate.getTime() <= now.getTime()) continue
    if (endsAtMs !== null && candidate.getTime() > endsAtMs) continue

    return {
      datetime: candidate,
      durationMinutes: duration_minutes,
      title,
      venueName: venue_name,
      programmeId: id,
    }
  }
  return null
}

export default async function CoachDashboardPage() {
  const supabase = await createClient()
  
  // Initialize with empty defaults
  const dashboardData: DashboardData = {
    coachName: '',
    coachAvatarUrl: null,
    profileCompletion: {
      percentage: 0,
      // PERF-02 / Fix-14B: 6 elements (personal, sports, qualifications,
      // availability, policy, payment) — must match the completionChecks
      // array length below. Was a stale 7-element default that produced
      // a different array length on the error path vs the success path.
      completedSteps: [false, false, false, false, false, false]
    },
    pendingApprovalsCount: 0,
    upNextSession: null,
    weeklyStats: {
      sessionsThisWeek: 0,
      bookingsPending: 0,
      revenueThisWeek: 0,
      completionRate: 0
    },
    todaySessions: [],
    rating: {
      average: 0,
      count: 0
    },
    programmes: []
  }

  try {
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return <CoachHomeClient data={dashboardData} />

    // PERF-DASHBOARD-CLEANUP: merged user_profiles + coach_profiles into
    // one round-trip via PostgREST nested !inner JOIN. Was two sequential
    // round-trips because the FK chains forward; the JOIN folds them into
    // one network hop. Same pattern as profile/route.ts GET at L120-129.
    // Also drops `dbs_status` from the coach_profiles select — was loaded
    // but never read on this page (PERF-DASHBOARD-UNUSED-FIELDS).
    const { data: joined } = await supabase
      .from('user_profiles')
      .select(`
        id,
        full_name,
        avatar_url,
        location_city,
        coach_profiles!inner (
          id,
          bio,
          cancellation_window_hours,
          stripe_account_id,
          rating_avg,
          rating_count
        )
      `)
      .eq('auth_user_id', user.id)
      .single()

    if (!joined) return <CoachHomeClient data={dashboardData} />

    // Supabase nested join may return the joined row as object or array
    // depending on the relationship's inferred cardinality. Normalise here
    // (same pattern as profile/route.ts L127-129).
    const coachData = Array.isArray(joined.coach_profiles)
      ? joined.coach_profiles[0]
      : joined.coach_profiles

    if (!coachData) return <CoachHomeClient data={dashboardData} />

    // Aliases preserve every downstream reference (coachProfile.X,
    // userProfile.X) unchanged — no refactor needed at the 12+ call sites
    // below the auth chain.
    const userProfile = joined
    const coachProfile = coachData

    // Coach name + avatar — set immediately after userProfile fetch
    dashboardData.coachName = userProfile.full_name || ''
    dashboardData.coachAvatarUrl = userProfile.avatar_url ?? null

    // PERF-02: date math hoisted ahead of the Promise.all so all 11
    // dashboard queries can fire in parallel. Previously inlined between
    // sequential awaits.
    const today = new Date()
    const todayDateStr = today.toISOString().split('T')[0]
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    const mondayDateStr = monday.toISOString().split('T')[0]
    const sundayDateStr = sunday.toISOString().split('T')[0]
    const now = new Date()
    const nowIso = now.toISOString()

    // PERF-02: all 11 dashboard queries run concurrently — no
    // interdependencies after coachProfile.id is known. Previously 8
    // sequential awaits + a separate Promise.all of 3 completion-check
    // queries. Round-trips: 11 → 1 wall-clock (max of the parallel set).
    // Predicted ~500–1500ms saved on data wait alone.
    const [
      sportsCountResult,
      qualsCountResult,
      availCountResult,
      upNextResult,
      sessionsCountResult,
      pendingCountResult,
      revenueResult,
      totalConfirmedResult,
      totalCompletedResult,
      todayBookingsResult,
      programmesResult,
    ] = await Promise.all([
      supabase
        .from('coach_sports')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id),
      supabase
        .from('coach_qualifications')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id),
      supabase
        .from('availability_templates')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id),
      // Up next session — Fix-119 + Fix-118 (AF-H-04/05): include venue_name + booker join for real titles
      supabase
        .from('bookings')
        .select(`
          session_date,
          session_start_time,
          session_end_time,
          session_type,
          venue_name,
          booker:user_profiles!bookings_booked_by_user_id_fkey(full_name)
        `)
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'confirmed')
        .gte('session_date', todayDateStr)
        .order('session_date', { ascending: true })
        .order('session_start_time', { ascending: true })
        .limit(1)
        .single(),
      // Sessions this week (confirmed bookings)
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'confirmed')
        .gte('session_date', mondayDateStr)
        .lte('session_date', sundayDateStr),
      // Bookings pending (all pending, not just this week)
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'pending_approval'),
      // Revenue this week (completed bookings)
      supabase
        .from('bookings')
        .select('coach_price_pence')
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'completed')
        .gte('session_date', mondayDateStr)
        .lte('session_date', sundayDateStr),
      // Completion rate denominator — all-time confirmed + completed
      // (total sessions attempted, used as divisor below)
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .in('status', ['confirmed', 'completed']),
      // Completion rate numerator — all-time completed only
      // (sessions actually delivered, used as dividend below)
      supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'completed'),
      // Today's sessions — Fix-119 + Fix-118 (AF-H-04/05): include venue + booker name
      supabase
        .from('bookings')
        .select(`
          session_date,
          session_start_time,
          session_end_time,
          session_type,
          venue_name,
          booker:user_profiles!bookings_booked_by_user_id_fkey(full_name)
        `)
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'confirmed')
        .eq('session_date', todayDateStr)
        .order('session_start_time', { ascending: true }),
      // BUG-DASHBOARD-PROGRAMMES-NOT-SHOWING: show drafts alongside active
      // programmes (rendered with muted styling + "Draft" badge in
      // CoachHomeClient's GroupCard). Also handles rolling programmes that
      // have no end date — `.or('ends_at.gte.<now>,ends_at.is.null')` keeps
      // both fixed-end (still upcoming) and rolling (open-ended) programmes.
      //
      // BUG-UPNEXT-PROGRAMME-SESSIONS: also selects days_of_week, start_time,
      // duration_minutes, ends_at, venue_name so the Up Next computation below
      // can derive the next programme session occurrence (group sessions live
      // on group_programmes schedule, not on bookings).
      supabase
        .from('group_programmes')
        .select('id, title, current_spots, max_spots, status, days_of_week, start_time, duration_minutes, ends_at, venue_name, image_url')
        .eq('coach_profile_id', coachProfile.id)
        .in('status', ['active', 'draft'])
        .or(`ends_at.gte.${nowIso},ends_at.is.null`)
        .is('deleted_at', null)
        .order('starts_at', { ascending: true }),
    ])

    // Profile completion — reconstruct array (order matters for completedSteps).
    // Fix-14B: Match Profile Hub logic (6 checks, not 7).
    // BUG-COMPLETION-BASIC-PROFILE: avatar_url added to align with PRD REQ-C-028
    // which requires a profile photo for parents to trust a coach. Gender is
    // NOT a completion gate (PRD doesn't require it).
    // BUG-COMPLETION-STRIPE: still using `!!stripe_account_id` here rather than
    // `chargesEnabled && payoutsEnabled` because the dashboard is a server
    // component — checking real Stripe status would require either an 800ms
    // Stripe API call per page load or properly wiring `stripe_onboarding_complete`
    // from the Stripe webhook (BUG-STRIPE-ONBOARDING-COMPLETE-WIRING). Until
    // that follow-up lands, this check stays loose and may over-report Stripe
    // completion vs ProfileEdit + the right panel.
    const completionChecks: boolean[] = [
      !!(userProfile.full_name && coachProfile.bio && userProfile.location_city && userProfile.avatar_url),
      (sportsCountResult.count ?? 0) > 0,
      (qualsCountResult.count ?? 0) > 0,
      (availCountResult.count ?? 0) > 0,
      coachProfile.cancellation_window_hours > 0,
      !!coachProfile.stripe_account_id,
    ]
    const filledCount = completionChecks.filter(Boolean).length
    dashboardData.profileCompletion = {
      percentage: Math.round((filledCount / 6) * 100),
      completedSteps: completionChecks,
    }

    // BUG-UPNEXT-PROGRAMME-SESSIONS: compute the soonest upcoming session
    // across BOTH 1-to-1 bookings AND active group programmes. Programme
    // sessions are derived from days_of_week + start_time (no row exists in
    // bookings for them), so the helper above projects forward to find the
    // next occurrence. Tie-break: equal datetime favours the booking
    // (booking has a real person attached; programme is generic).
    const upNextBooking = upNextResult.data
    const bookingDateTime = upNextBooking
      ? new Date(`${upNextBooking.session_date}T${upNextBooking.session_start_time}`)
      : null

    const programmesForUpNext = programmesResult.data ?? []
    const earliestProgramme = programmesForUpNext
      .filter((p) => p.status === 'active')
      .map((p) => nextProgrammeOccurrence(p as ProgrammeScheduleRow, now))
      .filter((s): s is ProgrammeOccurrence => s !== null)
      .sort((a, b) => a.datetime.getTime() - b.datetime.getTime())[0]
      ?? null

    // Decide which is soonest.
    type ChosenSession =
      | { kind: 'booking'; datetime: Date }
      | { kind: 'programme'; datetime: Date; occurrence: ProgrammeOccurrence }
      | null
    let chosen: ChosenSession = null
    if (bookingDateTime && earliestProgramme) {
      chosen = bookingDateTime.getTime() <= earliestProgramme.datetime.getTime()
        ? { kind: 'booking', datetime: bookingDateTime }
        : { kind: 'programme', datetime: earliestProgramme.datetime, occurrence: earliestProgramme }
    } else if (bookingDateTime) {
      chosen = { kind: 'booking', datetime: bookingDateTime }
    } else if (earliestProgramme) {
      chosen = { kind: 'programme', datetime: earliestProgramme.datetime, occurrence: earliestProgramme }
    }

    if (chosen?.kind === 'booking' && upNextBooking) {
      const startsInMinutes = Math.floor((chosen.datetime.getTime() - Date.now()) / (1000 * 60))

      // booker is a left join — Supabase returns object or array depending on relationship type
      const bookerData = Array.isArray(upNextBooking.booker)
        ? upNextBooking.booker[0]
        : upNextBooking.booker
      const bookerName = bookerData?.full_name ?? null

      const title = upNextBooking.session_type === 'individual'
        ? (bookerName ? `Session with ${bookerName}` : '1-on-1 Session')
        : 'Group Session'

      dashboardData.upNextSession = {
        title,
        startTime: upNextBooking.session_start_time.substring(0, 5),
        endTime: upNextBooking.session_end_time.substring(0, 5),
        venue: upNextBooking.venue_name ?? 'Venue TBC',
        startsInMinutes,
        sessionType: upNextBooking.session_type === 'individual' ? '1-to-1' : 'group',
      }
    } else if (chosen?.kind === 'programme') {
      const occ = chosen.occurrence
      const startsInMinutes = Math.floor((occ.datetime.getTime() - Date.now()) / (1000 * 60))
      const startHours = String(occ.datetime.getHours()).padStart(2, '0')
      const startMins = String(occ.datetime.getMinutes()).padStart(2, '0')
      const endDateTime = new Date(occ.datetime.getTime() + occ.durationMinutes * 60 * 1000)
      const endHours = String(endDateTime.getHours()).padStart(2, '0')
      const endMins = String(endDateTime.getMinutes()).padStart(2, '0')

      dashboardData.upNextSession = {
        title: occ.title,
        startTime: `${startHours}:${startMins}`,
        endTime: `${endHours}:${endMins}`,
        venue: occ.venueName ?? 'Venue TBC',
        startsInMinutes,
        sessionType: 'group',
        groupProgrammeId: occ.programmeId,
      }
    }

    // Weekly stats — destructured from parallel results
    dashboardData.weeklyStats.sessionsThisWeek = sessionsCountResult.count || 0
    dashboardData.pendingApprovalsCount = pendingCountResult.count || 0
    dashboardData.weeklyStats.bookingsPending = pendingCountResult.count || 0

    const revenue = revenueResult.data?.reduce((sum, b) => sum + (b.coach_price_pence || 0), 0) || 0
    dashboardData.weeklyStats.revenueThisWeek = revenue / 100

    if (totalConfirmedResult.count && totalConfirmedResult.count > 0) {
      dashboardData.weeklyStats.completionRate = Math.round(((totalCompletedResult.count || 0) / totalConfirmedResult.count) * 100)
    }

    // Today's sessions — same processing logic as before
    const todayBookings = todayBookingsResult.data
    if (todayBookings) {
      const currentTime = new Date()
      const currentTimeStr = currentTime.toTimeString().substring(0, 8)

      dashboardData.todaySessions = todayBookings.map(booking => {
        const startDateTime = new Date(`${booking.session_date}T${booking.session_start_time}`)
        const endDateTime = new Date(`${booking.session_date}T${booking.session_end_time}`)
        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60))
        const isActive = currentTimeStr >= booking.session_start_time && currentTimeStr <= booking.session_end_time

        const bookerData = Array.isArray(booking.booker)
          ? booking.booker[0]
          : booking.booker
        const bookerName = bookerData?.full_name ?? null

        const title = booking.session_type === 'individual'
          ? (bookerName ? `Session with ${bookerName}` : '1-on-1 Session')
          : 'Group Session'

        return {
          time: booking.session_start_time.substring(0, 5),
          duration: `${durationMinutes}m`,
          title,
          location: booking.venue_name ?? 'Venue TBC',
          isActive,
          type: booking.session_type === 'individual' ? 'Private' : undefined,
        }
      })
    }

    // Rating
    dashboardData.rating = {
      average: coachProfile.rating_avg || 0,
      count: coachProfile.rating_count || 0,
    }

    // Group programmes
    const programmesData = programmesResult.data
    dashboardData.programmes = (programmesData || []).map(p => ({
      id: p.id,
      title: p.title,
      current_spots: p.current_spots,
      max_spots: p.max_spots,
      status: p.status,
      image_url: p.image_url ?? null,
    }))

  } catch (error) {
    // PERF-02: with the post-coach-profile queries now in Promise.all,
    // a single query failure rejects the whole batch and we degrade to
    // empty defaults. Log so the failure surfaces in Vercel logs rather
    // than silently displaying an empty dashboard.
    console.error('[CoachDashboard] data fetch failed:', error)
  }

  return <CoachHomeClient data={dashboardData} />
}
