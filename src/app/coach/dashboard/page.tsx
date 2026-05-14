import { createClient } from '@/lib/supabase/server'
import { CoachHomeClient } from '@/components/coach/CoachHomeClient'

interface Programme {
  id: string
  title: string
  current_spots: number
  max_spots: number
  status: string
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
    const nowIso = new Date().toISOString()

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
      // Active group programmes
      supabase
        .from('group_programmes')
        .select('id, title, current_spots, max_spots, status')
        .eq('coach_profile_id', coachProfile.id)
        .eq('status', 'active')
        .gte('ends_at', nowIso)
        .is('deleted_at', null)
        .order('starts_at', { ascending: true }),
    ])

    // Profile completion — reconstruct array (order matters for completedSteps).
    // Fix-14B: Match Profile Hub logic (6 checks, not 7).
    const completionChecks: boolean[] = [
      !!(userProfile.full_name && coachProfile.bio && userProfile.location_city),
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

    // Up next session — destructured from upNextResult
    const upNextBooking = upNextResult.data
    if (upNextBooking) {
      const startDateTime = new Date(`${upNextBooking.session_date}T${upNextBooking.session_start_time}`)
      const startsInMs = startDateTime.getTime() - Date.now()
      const startsInMinutes = Math.floor(startsInMs / (1000 * 60))

      // booker is a left join — Supabase returns object or array depending on relationship type
      const bookerData = Array.isArray(upNextBooking.booker)
        ? upNextBooking.booker[0]
        : upNextBooking.booker
      const bookerName = bookerData?.full_name ?? null

      const title = upNextBooking.session_type === 'individual'
        ? (bookerName ? `Session with ${bookerName}` : '1-on-1 Session')
        : 'Group Session' // programme-name lookup deferred (would require chained join)

      dashboardData.upNextSession = {
        title,
        startTime: upNextBooking.session_start_time.substring(0, 5),
        endTime: upNextBooking.session_end_time.substring(0, 5),
        venue: upNextBooking.venue_name ?? 'Venue TBC',
        startsInMinutes,
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
