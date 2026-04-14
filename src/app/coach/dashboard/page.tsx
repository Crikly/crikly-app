import { createClient } from '@/lib/supabase/server'
import { CoachHomeClient } from '@/components/coach/CoachHomeClient'

interface DashboardData {
  coachName: string
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
}

export default async function CoachDashboardPage() {
  const supabase = await createClient()
  
  // Initialize with empty defaults
  const dashboardData: DashboardData = {
    coachName: '',
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
    }
  }

  try {
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return <CoachHomeClient data={dashboardData} />

    // Get user profile
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) return <CoachHomeClient data={dashboardData} />

    // Get coach profile
    const { data: coachProfile } = await supabase
      .from('coach_profiles')
      .select('id, bio, cancellation_window_hours, stripe_account_id, rating_avg, rating_count')
      .eq('user_profile_id', userProfile.id)
      .single()

    if (!coachProfile) return <CoachHomeClient data={dashboardData} />

    // 1. Coach name
    dashboardData.coachName = userProfile.full_name

    // 2. Profile completion calculation
    const completionChecks = await Promise.all([
      // Profile photo
      supabase
        .from('coach_photos')
        .select('id')
        .eq('coach_profile_id', coachProfile.id)
        .limit(1)
        .then(({ data }) => !!(data && data.length > 0)),
      
      // Bio
      Promise.resolve(!!coachProfile.bio && coachProfile.bio.trim().length > 0),
      
      // Base location - check user_profiles for location_city
      supabase
        .from('user_profiles')
        .select('location_city')
        .eq('id', userProfile.id)
        .single()
        .then(({ data }) => !!data?.location_city),
      
      // Sport configured
      supabase
        .from('coach_sports')
        .select('id')
        .eq('coach_profile_id', coachProfile.id)
        .eq('is_active', true)
        .limit(1)
        .then(({ data }) => !!(data && data.length > 0)),
      
      // Availability set
      supabase
        .from('availability_templates')
        .select('id')
        .eq('coach_profile_id', coachProfile.id)
        .limit(1)
        .then(({ data }) => !!(data && data.length > 0)),
      
      // Booking policy
      Promise.resolve(coachProfile.cancellation_window_hours !== null),
      
      // Stripe connected
      Promise.resolve(!!coachProfile.stripe_account_id)
    ])

    const filledCount = completionChecks.filter(Boolean).length
    dashboardData.profileCompletion = {
      percentage: Math.round((filledCount / 7) * 100),
      completedSteps: completionChecks
    }

    // 3. Pending approvals count
    // STUB: bookings table doesn't have 'pending' status or 'approval_type' column yet
    // For now, show 0 pending approvals
    dashboardData.pendingApprovalsCount = 0

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
      .eq('status', 'pending')

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

  } catch (error) {
    console.error('Error fetching dashboard data:', error)
    // Return with empty defaults
  }

  return <CoachHomeClient data={dashboardData} />
}
