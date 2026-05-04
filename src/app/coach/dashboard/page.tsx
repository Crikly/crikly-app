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
      completedSteps: [false, false, false, false, false, false, false]
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

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) return <CoachHomeClient data={dashboardData} />

    // 1. Coach name + avatar - set immediately after userProfile fetch
    dashboardData.coachName = userProfile.full_name || ''
    dashboardData.coachAvatarUrl = userProfile.avatar_url ?? null

    // Get coach profile
    const { data: coachProfile } = await supabase
      .from('coach_profiles')
      .select('id, bio, cancellation_window_hours, stripe_account_id, rating_avg, rating_count, dbs_status')
      .eq('user_profile_id', userProfile.id)
      .single()

    if (!coachProfile) return <CoachHomeClient data={dashboardData} />

    // 2. Profile completion calculation
    // Fix-14B: Match Profile Hub logic (6 checks, not 7)
    // Get location_city for personal info check
    const { data: userProfileData } = await supabase
      .from('user_profiles')
      .select('location_city, full_name')
      .eq('id', userProfile.id)
      .single()
    
    const completionChecks = await Promise.all([
      // Personal Info (full_name, bio, location_city)
      Promise.resolve(!!(userProfileData?.full_name && coachProfile.bio && userProfileData?.location_city)),
      
      // Sports & Pricing (has at least one sport configured)
      supabase
        .from('coach_sports')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .then(({ count }) => (count ?? 0) > 0),
      
      // Qualifications (has at least one qualification)
      supabase
        .from('coach_qualifications')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .then(({ count }) => (count ?? 0) > 0),
      
      // Availability (has at least one availability template)
      supabase
        .from('availability_templates')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)
        .then(({ count }) => (count ?? 0) > 0),
      
      // Booking Policy (cancellation_window_hours > 0)
      Promise.resolve(coachProfile.cancellation_window_hours > 0),
      
      // Payment Setup (Stripe connected)
      Promise.resolve(!!coachProfile.stripe_account_id)
    ])

    const filledCount = completionChecks.filter(Boolean).length
    dashboardData.profileCompletion = {
      percentage: Math.round((filledCount / 6) * 100),
      completedSteps: completionChecks
    }


    // 4. Up next session
    // STUB: bookings table doesn't have 'title' or 'venue_name' columns yet
    // Using session_date and session_start_time/end_time instead
    const today = new Date()
    const todayDateStr = today.toISOString().split('T')[0]
    
    const { data: upNextBooking } = await supabase
      .from('bookings')
      .select('session_date, session_start_time, session_end_time, session_type')
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'confirmed')
      .gte('session_date', todayDateStr)
      .order('session_date', { ascending: true })
      .order('session_start_time', { ascending: true })
      .limit(1)
      .single()

    if (upNextBooking) {
      // Combine date and time to create full datetime
      const startDateTime = new Date(`${upNextBooking.session_date}T${upNextBooking.session_start_time}`)
      const endDateTime = new Date(`${upNextBooking.session_date}T${upNextBooking.session_end_time}`)
      const startsInMs = startDateTime.getTime() - Date.now()
      const startsInMinutes = Math.floor(startsInMs / (1000 * 60))

      dashboardData.upNextSession = {
        title: `${upNextBooking.session_type === 'individual' ? '1-on-1' : 'Group'} Session`,
        startTime: upNextBooking.session_start_time.substring(0, 5),
        endTime: upNextBooking.session_end_time.substring(0, 5),
        venue: 'Venue TBC',
        startsInMinutes
      }
    }

    // 5. Weekly stats
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)
    
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    const weekStart = monday.toISOString()
    const weekEnd = sunday.toISOString()

    // Sessions this week (confirmed bookings)
    const mondayDateStr = monday.toISOString().split('T')[0]
    const sundayDateStr = sunday.toISOString().split('T')[0]
    
    const { count: sessionsCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'confirmed')
      .gte('session_date', mondayDateStr)
      .lte('session_date', sundayDateStr)

    dashboardData.weeklyStats.sessionsThisWeek = sessionsCount || 0

    // Bookings pending (all pending, not just this week)
    const { count: pendingBookingsCount } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'pending_approval')

    dashboardData.pendingApprovalsCount = pendingBookingsCount || 0
    dashboardData.weeklyStats.bookingsPending = pendingBookingsCount || 0

    // Revenue this week (completed bookings)
    const { data: completedBookings } = await supabase
      .from('bookings')
      .select('coach_price_pence')
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'completed')
      .gte('session_date', mondayDateStr)
      .lte('session_date', sundayDateStr)

    const revenue = completedBookings?.reduce((sum, b) => sum + (b.coach_price_pence || 0), 0) || 0
    dashboardData.weeklyStats.revenueThisWeek = revenue / 100

    // Completion rate (all time, not just this week)
    const { count: totalConfirmed } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)
      .in('status', ['confirmed', 'completed'])

    const { count: totalCompleted } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'completed')

    if (totalConfirmed && totalConfirmed > 0) {
      dashboardData.weeklyStats.completionRate = Math.round(((totalCompleted || 0) / totalConfirmed) * 100)
    }

    // 7. Today's sessions
    const { data: todayBookings } = await supabase
      .from('bookings')
      .select('session_date, session_start_time, session_end_time, session_type')
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'confirmed')
      .eq('session_date', todayDateStr)
      .order('session_start_time', { ascending: true })

    if (todayBookings) {
      const currentTime = new Date()
      const currentTimeStr = currentTime.toTimeString().substring(0, 8)
      
      dashboardData.todaySessions = todayBookings.map(booking => {
        const startDateTime = new Date(`${booking.session_date}T${booking.session_start_time}`)
        const endDateTime = new Date(`${booking.session_date}T${booking.session_end_time}`)
        const durationMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60))
        const isActive = currentTimeStr >= booking.session_start_time && currentTimeStr <= booking.session_end_time

        return {
          time: booking.session_start_time.substring(0, 5),
          duration: `${durationMinutes}m`,
          title: `${booking.session_type === 'individual' ? '1-on-1' : 'Group'} Session`,
          location: 'Venue TBC',
          isActive,
          type: booking.session_type === 'individual' ? 'Private' : undefined
        }
      })
    }

    // 8. Rating
    dashboardData.rating = {
      average: coachProfile.rating_avg || 0,
      count: coachProfile.rating_count || 0
    }

    // 9. Group programmes
    const { data: programmesData } = await supabase
      .from('group_programmes')
      .select('id, title, current_spots, max_spots, status')
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'active')
      .gte('ends_at', new Date().toISOString())
      .is('deleted_at', null)
      .order('starts_at', { ascending: true })

    dashboardData.programmes = (programmesData || []).map(p => ({
      id: p.id,
      title: p.title,
      current_spots: p.current_spots,
      max_spots: p.max_spots,
      status: p.status,
    }))

  } catch (error) {
    // Return with empty defaults on error
  }

  return <CoachHomeClient data={dashboardData} />
}
