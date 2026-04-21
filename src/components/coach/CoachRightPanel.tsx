'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft, MapPin, Star, PoundSterling, Calendar, Loader2 } from 'lucide-react'

// Fix-14C: API response type
interface CoachProfileResponse {
  id: string
  user_profile_id: string
  full_name: string
  avatar_url: string | null
  location_city: string | null
  location_postcode: string | null
  bio: string | null
  years_experience: number | null
  dbs_status: 'none' | 'pending' | 'verified' | 'expired'
  is_profile_live: boolean
  stripe_onboarding_complete: boolean
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  gender: string | null
  created_at: string
  updated_at: string
}

interface DashboardData {
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
  weeklyStats: {
    revenueThisWeek: number
  }
}

// Fix-55: Booking list item from /api/coaches/bookings
interface BookingListItem {
  id: string
  booking_reference: string
  session_date: string
  session_start_time: string
  session_end_time: string
  session_type: string
  status: string
  sport_id: string
  coach_price_pence: number
  child_name: string | null
  booked_by_name: string | null
  created_at: string
}

interface Sport { id: string; name: string }

// Fix-55: Helpers
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatSessionDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function statusDotColor(status: string): string {
  switch (status) {
    case 'confirmed': return '#0077CC'
    case 'completed': return '#15803D'
    case 'pending_approval': return '#F59E0B'
    default: return '#9CA3AF'
  }
}

interface CoachRightPanelProps {
  dashboardData?: DashboardData
}

export function CoachRightPanel({ dashboardData }: CoachRightPanelProps = {}) {
  const pathname = usePathname()
  const router = useRouter()
  // CF-D02d BUG FIX 1: Route detection confirmed working
  const isScheduleRoute = pathname === '/coach/schedule' || pathname.includes('/schedule')
  // CF-D03 CHANGE 7: Detect bookings route
  const isBookingsRoute = pathname === '/coach/bookings' || pathname.includes('/bookings')
  // CF-D07 CHANGE 4: Detect profile route
  const isProfileRoute = pathname === '/coach/profile' || pathname.includes('/profile')
  // CF-D08 CHANGE 5: Detect earnings route
  const isEarningsRoute = pathname === '/coach/earnings' || pathname.includes('/earnings')
  // CF-D09 CHANGE 6: Detect get-paid route
  const isGetPaidRoute = pathname.includes('/get-paid')
  // Fix-25: Dynamic today date
  const [selectedDate, setSelectedDate] = useState<number | null>(new Date().getDate())

  // Fix-55: Fetch sports once when on bookings route — passed to child components
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!isBookingsRoute) return
    fetch('/api/sports')
      .then((r) => r.json())
      .then((data: { sports?: Sport[] }) => {
        const map: Record<string, string> = {}
        data.sports?.forEach((s) => { map[s.id] = s.name })
        setSportsMap(map)
      })
      .catch(() => {})
  }, [isBookingsRoute])

  return (
    <aside className="hidden xl:flex w-96 shrink-0 flex-col gap-6 bg-white p-8 sticky top-0 h-screen overflow-y-auto border-l border-gray-100">
      {isScheduleRoute ? (
        <>
          <MiniCalendar selectedDate={selectedDate} onDateSelect={setSelectedDate} />
          <DaySessionList selectedDate={selectedDate} onBackToWeek={() => setSelectedDate(new Date().getDate())} />
          <FreeSlotsThisWeek />
          <SmartInsightCard />
          <PendingApprovalCard />
        </>
      ) : isBookingsRoute ? (
        <>
          <BookingsPendingApprovals sportsMap={sportsMap} />
          <BookingsTodaySessions sportsMap={sportsMap} />
        </>
      ) : isProfileRoute ? (
        // CF-D07 CHANGE 4: Profile-specific right panel
        // Fix-14C: Pass real profile data
        <>
          <ProfilePublicPreviewWrapper />
        </>
      ) : isEarningsRoute ? (
        // CF-D08 CHANGE 5: Earnings-specific right panel
        <>
          <EarningsNextPayout router={router} />
          <EarningsPeriodSummary />
        </>
      ) : isGetPaidRoute ? (
        // CF-D09 CHANGE 6: Get Paid-specific right panel
        <>
          <GetPaidNextPayout router={router} />
          <GetPaidReassurance />
          <GetPaidHistoryLink router={router} />
        </>
      ) : (
        <>
          <ThisWeekStrip isDesktop />
          <TodayLineup isDesktop sessions={dashboardData?.todaySessions || []} />
          <YourRatingCard rating={dashboardData?.rating} />
          <TotalEarningsCard revenueThisWeek={dashboardData?.weeklyStats?.revenueThisWeek} />
        </>
      )}
    </aside>
  )
}

// CF-D09 CHANGE 6: Get Paid next payout card
function GetPaidNextPayout({ router }: { router: any }) {
  return (
    <div className="bg-[#E6F1FB] rounded-xl p-3.5">
      <div className="text-[9px] font-medium text-[#0C447C] uppercase tracking-wider mb-1.5">NEXT PAYOUT</div>
      <div className="text-[26px] font-medium text-[#0077CC] mb-1">£90.00</div>
      <div className="text-[10px] text-[#378ADD] mb-2.5">Releases 10 Apr · in 2 days</div>
      
      {/* Processing info box */}
      <div className="bg-white rounded-lg px-2.5 py-2 flex items-center gap-2 mb-2.5">
        <span className="text-[15px] font-medium text-[#0077CC]">48h</span>
        <span className="text-[10px] text-gray-400">standard processing delay</span>
      </div>
      
      {/* View earnings link */}
      <button 
        onClick={() => {
          // TODO CF-D09: wire to earnings
          router.push('/coach/earnings')
        }}
        className="w-full text-center text-[11px] font-medium text-[#0077CC] hover:text-[#0066AA] transition-colors"
      >
        View earnings →
      </button>
    </div>
  )
}

// CF-D09 CHANGE 6: Get Paid reassurance message
function GetPaidReassurance() {
  return (
    <div className="bg-[#F0FDF4] rounded-[10px] p-3">
      <div className="flex items-start gap-2 mb-1">
        <div className="text-[#16A34A] text-[16px] shrink-0">✓</div>
        <div className="text-[12px] font-medium text-[#166534]">Everything looks good</div>
      </div>
      <p className="text-[11px] text-[#166534] leading-relaxed">
        Your Stripe account is connected and payouts are on schedule.
      </p>
    </div>
  )
}

// CF-D09 CHANGE 6: Get Paid history link
function GetPaidHistoryLink({ router }: { router: any }) {
  return (
    <button 
      onClick={() => {
        // TODO CF-D09: wire to payout history
        router.push('/coach/earnings')
      }}
      className="w-full text-center text-[12px] font-medium text-[#0077CC] hover:text-[#0066AA] transition-colors"
    >
      View full payout history →
    </button>
  )
}

// CF-D08 CHANGE 5: Earnings next payout card
function EarningsNextPayout({ router }: { router: any }) {
  return (
    <div className="bg-[#E6F1FB] rounded-xl p-3.5">
      <div className="text-[9px] font-medium text-[#0C447C] uppercase tracking-wider mb-1.5">NEXT PAYOUT</div>
      <div className="text-[26px] font-medium text-[#0077CC] mb-1">£90.00</div>
      <div className="text-[10px] text-[#378ADD] mb-2.5">Releases 10 Apr · in 2 days</div>
      
      {/* Processing info box */}
      <div className="bg-white rounded-lg px-2.5 py-2 flex items-center gap-2 mb-2.5">
        <span className="text-[15px] font-medium text-[#0077CC]">48h</span>
        <span className="text-[10px] text-gray-400">standard processing delay</span>
      </div>
      
      {/* Go to Get Paid button */}
      <button 
        onClick={() => {
          // TODO CF-D08: wire to Get Paid route
          router.push('/coach/get-paid')
        }}
        className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full py-2 text-[11px] font-medium transition-colors"
      >
        Go to Get Paid →
      </button>
    </div>
  )
}

// CF-D08 CHANGE 5: Earnings period summary
function EarningsPeriodSummary() {
  const rows = [
    { label: 'Total earned', value: '£1,240', color: 'text-[#166534]' },
    { label: 'vs last month', value: '+12%', color: 'text-[#166534]' },
    { label: 'Sessions', value: '18', color: 'text-gray-900' },
    { label: 'Upcoming this week', value: '£320', color: 'text-gray-900' }
  ]
  
  return (
    <div className="bg-[#F8F9FA] rounded-[10px] p-3">
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">{row.label}</span>
            <span className={`text-[11px] font-medium ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Fix-14C: Wrapper component that fetches and passes profile data
function ProfilePublicPreviewWrapper() {
  const [profile, setProfile] = useState<CoachProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/coaches/profile')
        if (!response.ok) throw new Error('Failed to fetch profile')
        const data: CoachProfileResponse = await response.json()
        setProfile(data)
      } catch (err) {
        console.error('Failed to fetch profile:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])
  
  if (loading || !profile) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-12 h-12 bg-gray-200 rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-24" />
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <>
      <ProfilePublicPreview profile={profile} />
      <ProfileCompletenessNotice profile={profile} />
    </>
  )
}

// CF-D07 CHANGE 4: Profile public preview component
// CF-D07b POLISH 4: More polished and realistic preview card
// Fix-14C: Now accepts real profile data
function ProfilePublicPreview({ profile }: { profile: CoachProfileResponse }) {
  // Fix-14C: Get initials from real name
  const getInitials = (name: string): string => {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }
  
  return (
    <div>
      <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-2">WHAT PARENTS SEE</div>
      
      {/* CF-D07b POLISH 4: White bg, shadow, no border */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        {/* Avatar */}
        <div className="flex items-start gap-3 mb-3">
          {/* Fix-14C: Real avatar or initials */}
          {profile.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt={profile.full_name} 
              className="w-12 h-12 rounded-full object-cover shrink-0" 
              style={{ boxShadow: '0 0 0 2px #E6F1FB' }}
            />
          ) : (
            <div className="w-12 h-12 bg-[#E6F1FB] rounded-full flex items-center justify-center text-[14px] font-medium text-[#0C447C] shrink-0" style={{ boxShadow: '0 0 0 2px #E6F1FB' }}>
              {getInitials(profile.full_name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            {/* Fix-14C: Real coach name */}
            <h3 className="text-[15px] font-medium text-gray-900 truncate">{profile.full_name}</h3>
            {/* Fix-14C: Real experience */}
            <p className="text-[12px] text-gray-400 mt-0.5">
              {profile.years_experience ? `${profile.years_experience} years experience` : 'Coach'}
            </p>
          </div>
        </div>
        
        {/* Fix-14C: Real rating data */}
        {profile.rating_avg !== null && profile.rating_count > 0 && (
          <div className="flex items-center gap-1 mb-2">
            {[1,2,3,4,5].map(i => (
              <Star key={i} size={11} className={i <= Math.round(profile.rating_avg!) ? "text-amber-500 fill-amber-500" : "text-gray-300"} />
            ))}
            <span className="text-[13px] font-medium text-gray-900 ml-0.5">{profile.rating_avg.toFixed(1)}</span>
            <span className="text-[11px] text-gray-400">· {profile.rating_count} {profile.rating_count === 1 ? 'review' : 'reviews'}</span>
          </div>
        )}
        
        {/* Meta rows */}
        <div className="space-y-1.5 mb-2">
          {/* Fix-14C: Real location */}
          {profile.location_city && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <MapPin size={12} className="shrink-0" />
              <span>{profile.location_city}</span>
            </div>
          )}
          {/* TODO: Get real availability days from API */}
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <Calendar size={12} className="shrink-0" />
            <span>See availability</span>
          </div>
        </div>
        
        {/* Fix-14C: Price placeholder - would need coach_sports data */}
        <p className="text-[16px] font-medium text-gray-900 mb-2">View pricing</p>
        
        {/* Fix-14C: Real DBS status */}
        {profile.dbs_status === 'verified' && (
          <div className="inline-block px-2 py-0.5 bg-[#E0F6F8] text-[#006677] text-[10px] font-medium rounded-full mb-2.5">
            ✓ DBS checked
          </div>
        )}
        
        {/* CF-D07b POLISH 4: Book button with pill shape (radius-999px), padding 10px */}
        <button 
          onClick={() => {
            // TODO CF-D07: stub
          }}
          className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full py-2.5 text-[12px] font-medium transition-colors"
        >
          Book a session
        </button>
      </div>
    </div>
  )
}

// CF-D07 CHANGE 4: Profile completeness notice
// Fix-14C: Now calculates real completion percentage
function ProfileCompletenessNotice({ profile }: { profile: CoachProfileResponse }) {
  // Fix-14C: Calculate real completion percentage (matches Profile Hub logic)
  const calculateCompleteness = (): number => {
    let completed = 0
    const total = 6
    
    if (profile.full_name && profile.bio && profile.location_city) completed++
    if (profile.years_experience !== null) completed++
    if (profile.dbs_status === 'verified') completed++
    completed++ // Availability (assumed complete)
    if (profile.cancellation_window_hours > 0) completed++
    if (profile.stripe_onboarding_complete) completed++
    
    return Math.round((completed / total) * 100)
  }
  
  const completeness = calculateCompleteness()
  const isComplete = completeness === 100
  
  if (isComplete) {
    return (
      <div className="bg-[#F0FDF4] rounded-lg p-3 border-l-[3px] border-[#16A34A]">
        <h4 className="text-[11px] font-medium text-[#166534] mb-1">Profile complete</h4>
        <p className="text-[10px] text-[#166534] leading-relaxed">
          Your profile is live and visible to parents
        </p>
      </div>
    )
  }
  
  return (
    <div className="bg-[#FFFBEB] rounded-lg p-3 border-l-[3px] border-[#F59E0B]">
      <h4 className="text-[11px] font-medium text-[#78350F] mb-1">{completeness}% complete</h4>
      <p className="text-[10px] text-[#92400E] leading-relaxed">
        {profile.dbs_status !== 'verified' 
          ? 'Add qualifications to unlock full search visibility'
          : !profile.stripe_onboarding_complete
          ? 'Connect Stripe to start accepting bookings'
          : 'Complete your profile to go live'}
      </p>
    </div>
  )
}

function ThisWeekStrip({ isDesktop }: { isDesktop?: boolean }) {
  const [weekOffset, setWeekOffset] = useState(0)

  const getWeekDates = (offset: number) => {
    const now = new Date()
    const todayMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
    const currentDayOfWeek = todayMidnight.getDay()
    const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1
    const monday = new Date(todayMidnight)
    monday.setDate(todayMidnight.getDate() - daysFromMonday + offset * 7)

    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday)
      day.setDate(monday.getDate() + i)
      weekDays.push({
        label: ['M','T','W','T','F','S','S'][i],
        date: day.getDate(),
        isToday: day.getTime() === todayMidnight.getTime(),
        hasSession: false
      })
    }

    const thursday = new Date(monday)
    thursday.setDate(monday.getDate() + 3)
    const monthName = thursday.toLocaleDateString('en-GB', { month: 'long' })

    return { weekDays, monthName }
  }

  const { weekDays, monthName } = getWeekDates(weekOffset)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className={`${isDesktop ? 'text-[22px]' : 'text-[19px]'} font-bold text-gray-900`}>
          This week
        </h3>
        <div className="flex items-center gap-1 text-sm font-bold text-gray-500">
          {weekOffset > 0 && (
            <button
              onClick={() => setWeekOffset(weekOffset - 1)}
              className="hover:text-gray-900 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="cursor-pointer hover:text-gray-900 transition-colors">
            {monthName}
          </span>
          <button
            onClick={() => setWeekOffset(weekOffset + 1)}
            className="hover:text-gray-900 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="flex justify-between items-center bg-gray-50 rounded-[20px] p-2.5 border border-gray-100/80 shadow-sm">
        {weekDays.map((day, i) => (
          <div key={i} className="flex flex-col items-center gap-2 cursor-pointer group">
            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
              {day.label}
            </span>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold transition-all ${day.isToday ? 'bg-[#0077CC] text-white shadow-md' : 'text-gray-700 group-hover:bg-gray-200'}`}>
              {day.date}
            </div>
            <div className="h-1.5 flex justify-center w-full">
              {day.hasSession && (
                <div className={`w-1.5 h-1.5 rounded-full ${day.isToday ? 'bg-[#0077CC]' : 'bg-gray-300'}`} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TodayLineup({ isDesktop, sessions }: { isDesktop?: boolean; sessions: Array<{time: string; duration: string; title: string; location: string; isActive: boolean; type?: string}> }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h3 className={`${isDesktop ? 'text-[22px]' : 'text-[19px]'} font-bold text-gray-900`}>Today's lineup</h3>
        {isDesktop && <span className="text-[#0077CC] text-sm font-bold cursor-pointer hover:underline">View all</span>}
      </div>
      {sessions.length === 0 ? (
        <p className="text-gray-400 text-sm">No sessions today</p>
      ) : (
        <div className="flex flex-col relative">
          <div className="absolute left-[60px] top-4 bottom-8 w-[1.5px] bg-gray-100 -translate-x-1/2"></div>
          {sessions.map((session, i) => (
            <div key={i} className="flex gap-6 mb-7 relative group cursor-pointer">
              <div className="flex flex-col items-center pt-3.5 z-10 w-12 shrink-0">
                <span className={`text-[15px] font-bold ${session.isActive ? 'text-[#0077CC]' : 'text-gray-600'}`}>{session.time}</span>
                <span className="text-[11px] text-gray-400 font-bold mt-1 uppercase tracking-wider">{session.duration}</span>
              </div>
              <div className={`absolute left-[60px] top-[26px] w-3.5 h-3.5 rounded-full border-[3px] bg-white z-20 transition-all -translate-x-1/2 -translate-y-1/2 ${session.isActive ? 'border-[#0077CC] shadow-[0_0_0_4px_rgba(0,119,204,0.1)] scale-110' : 'border-gray-300 group-hover:border-gray-400'}`}></div>
              <div className={`flex-1 p-4 md:p-5 rounded-[20px] border transition-all ${session.isActive ? 'bg-[#0077CC]/[0.03] border-[#0077CC]/20 shadow-sm' : 'bg-white border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:border-gray-200 hover:shadow-md'}`}>
                <div className="flex justify-between items-start mb-2">
                  <h4 className={`font-bold text-[16px] md:text-[17px] ${session.isActive ? 'text-[#0077CC]' : 'text-gray-900'} leading-tight pr-2`}>{session.title}</h4>
                  {session.type === 'Private' && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full shrink-0 border border-purple-100/50">1:1</span>}
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-[13px] font-medium">
                  <MapPin size={14} className={session.isActive ? 'text-[#0077CC]/70' : ''} />
                  <span className="truncate">{session.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function YourRatingCard({ rating }: { rating?: { average: number; count: number } }) {
  const hasReviews = rating && rating.count > 0
  
  return (
    <Link href="/coach/profile#reviews" className="bg-gray-50 rounded-[10px] p-[14px] flex flex-col gap-3 cursor-pointer hover:border hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
      <div className="flex items-center gap-2">
        <Star size={16} className="text-amber-400" fill="currentColor" />
        <span className="text-sm font-semibold text-gray-900">Your Rating</span>
      </div>
      {hasReviews ? (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-[28px] font-bold text-gray-900">{rating.average.toFixed(1)}</p>
            <p className="text-[13px] text-gray-500">Based on {rating.count} {rating.count === 1 ? 'review' : 'reviews'}</p>
          </div>
          <div className="flex gap-1">
            {[1,2,3,4,5].map(i => (
              <Star key={i} size={14} className={i <= Math.round(rating.average) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[16px] font-medium text-gray-500">No reviews yet</p>
          <p className="text-[13px] text-gray-400">Complete sessions to get your first review</p>
        </div>
      )}
    </Link>
  )
}

function TotalEarningsCard({ revenueThisWeek }: { revenueThisWeek?: number }) {
  // STUB: Only showing revenue this week from props, no comparison data available
  const revenue = revenueThisWeek ?? 0
  
  return (
    <Link href="/coach/earnings" className="bg-gray-50 rounded-[10px] p-[14px] flex flex-col gap-3 cursor-pointer hover:border hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
      <div className="flex items-center gap-2">
        <PoundSterling size={16} className="text-[#0077CC]" />
        <span className="text-sm font-semibold text-gray-900">Revenue This Week</span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[28px] font-bold text-gray-900">£{revenue.toFixed(0)}</p>
        <p className="text-[13px] text-gray-400">From completed sessions</p>
      </div>
    </Link>
  )
}

// CHANGE 6: Schedule-specific right panel components

// CF-D02c FIX 2: Enhanced mini calendar with dots and click functionality
function MiniCalendar({ selectedDate, onDateSelect }: { selectedDate: number | null; onDateSelect: (date: number) => void }) {
  // Fix-25: Dynamic date detection
  const now = new Date()
  const todayDate = now.getDate()
  const todayMonth = now.getMonth()
  const todayYear = now.getFullYear()
  const currentMonthName = now.toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric'
  })

  // Stub session data mapped to dates
  const sessionsByDate: Record<number, Array<'confirmed' | 'programme' | 'pending' | 'blocked'>> = {
    6: ['confirmed', 'programme'], // Mon
    7: [], // Tue (available slot, no sessions)
    8: ['confirmed', 'pending'], // Wed (today)
    9: ['programme'], // Thu
    10: [], // Fri (available slot)
    11: ['blocked'], // Sat
    12: ['programme'], // Sun
  }

  // CF-D02c FIX 2: Improved dot rendering with consistent container
  const getDots = (date: number) => {
    const sessions = sessionsByDate[date] || []
    
    const dotColors: Record<string, string> = {
      confirmed: '#3B82F6',
      programme: '#7C3AED',
      pending: '#F59E0B',
      blocked: '#D1D5DB',
    }
    
    // Always render container for consistent height
    if (sessions.length === 0) {
      return <div className="flex gap-0.5 justify-center items-center h-[6px] mt-[1px]"></div>
    }
    
    const displaySessions = sessions.slice(0, 3)
    // If more than 3 sessions, make 3rd dot grey
    const dots = displaySessions.map((type, i) => {
      const color = (sessions.length > 3 && i === 2) ? '#D1D5DB' : dotColors[type]
      return <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
    })
    
    return <div className="flex gap-0.5 justify-center items-center h-[6px] mt-[1px]">{dots}</div>
  }

  // Fix-25: Dynamic month grid helpers
  const getDaysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate()

  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1 // Convert to Mon=0
  }

  const daysInMonth = getDaysInMonth(todayYear, todayMonth)
  const firstDay = getFirstDayOfMonth(todayYear, todayMonth)
  const prevMonthDays = getDaysInMonth(todayYear, todayMonth - 1)

  // CF-D02c FIX 2: Improved date rendering with proper selection state
  const renderDate = (date: number, isCurrentMonth: boolean, isPreviouslyToday: boolean) => {
    // Fix-25: Dynamic today detection
    const isToday = date === todayDate && isCurrentMonth
    const isSelected = selectedDate === date && !isToday
    
    return (
      <div 
        key={date} 
        onClick={() => isCurrentMonth && onDateSelect(date)}
        className={`py-1 flex flex-col items-center ${
          isCurrentMonth ? 'cursor-pointer' : 'cursor-default'
        } min-h-[38px] ${
          !isCurrentMonth ? 'text-gray-300' :
          isToday ? 'text-white font-bold' :
          isSelected ? 'text-[#0077CC] font-medium' :
          'text-gray-700'
        }`}
      >
        {isToday ? (
          <span className="w-6 h-6 bg-[#0077CC] text-white rounded-full flex items-center justify-center text-[13px]">{date}</span>
        ) : isSelected ? (
          <span className="w-6 h-6 bg-blue-100 text-[#0077CC] rounded-full flex items-center justify-center text-[13px]">{date}</span>
        ) : (
          <span className="text-[13px]">{date}</span>
        )}
        {/* CF-D02c FIX 2: Always render dot container for consistent spacing */}
        {getDots(date)}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-[16px] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-gray-900">{currentMonthName}</h3>
        <div className="flex gap-1">
          <button className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50"><ChevronLeft size={16} /></button>
          <button className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center text-[12px] font-medium mb-2">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d} className="text-gray-400">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center relative z-0">
        <div className="absolute left-0 right-0 top-[28px] h-[28px] bg-[#EFF6FF] rounded-md -z-10" />
        {/* Fix-25: Dynamic month grid */}
        {/* Previous month trailing days */}
        {Array.from({ length: firstDay }, (_, i) =>
          renderDate(prevMonthDays - firstDay + i + 1, false, false)
        )}
        {/* Current month days */}
        {Array.from({ length: daysInMonth }, (_, i) =>
          renderDate(i + 1, true, false)
        )}
        {/* Next month leading days (fill to complete 6 rows = 42 cells) */}
        {Array.from({ length: 42 - firstDay - daysInMonth }, (_, i) =>
          renderDate(i + 1, false, false)
        )}
      </div>
    </div>
  )
}

function FreeSlotsThisWeek() {
  const router = useRouter()
  const freeSlots = [
    { day: 'Tue', time: '09:00–12:00' },
    { day: 'Fri', time: '14:00–17:00' },
  ]
  
  return (
    <div>
      <h3 className="text-[12px] font-medium text-gray-900 mb-1.5">Free slots this week</h3>
      <div className="space-y-1">
        {freeSlots.map((slot, i) => (
          <div key={i} className="bg-gray-50 border border-gray-100 rounded-md px-2 py-1.5 flex items-center justify-between">
            <div className="text-[11px]">
              <span className="font-medium text-gray-900">{slot.day}</span>
              <span className="text-gray-500 ml-1">· {slot.time}</span>
            </div>
            <Link 
              href="/coach/availability" 
              className="text-[10px] font-medium text-[#0077CC] hover:underline"
            >
              Fill →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

// CF-D02c FIX 2: Day session list with proper default state
function DaySessionList({ selectedDate, onBackToWeek }: { selectedDate: number | null; onBackToWeek: () => void }) {
  // Fix-25: Dynamic today detection
  const now = new Date()
  const todayDate = now.getDate()
  const isToday = selectedDate === todayDate

  // Fix-25: Dynamic day name generator
  const getDayName = (date: number): string => {
    const d = new Date(now.getFullYear(), now.getMonth(), date)
    return d.toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'short'
    })
  }

  const todayLabel = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short'
  })

  // TODO CF-D02b: derive day sessions from real schedule/booking data
  const allSessions = [
    { date: 6, day: 'Mon', name: 'James Okafor', time: '09:00', sport: 'Cricket', status: 'confirmed', color: '#3B82F6' },
    { date: 6, day: 'Mon', name: 'Junior Cricket', time: '14:00', sport: 'Cricket', status: 'programme', color: '#7C3AED' },
    { date: 8, day: 'Wed', name: 'Marcus Trent', time: '10:00', sport: 'Football', status: 'confirmed', color: '#3B82F6' },
    { date: 8, day: 'Wed', name: 'David Chen', time: '13:00', sport: 'Cricket', status: 'pending', color: '#F59E0B' },
    { date: 9, day: 'Thu', name: 'Advanced Batting', time: '09:00', sport: 'Cricket', status: 'programme', color: '#7C3AED' },
    { date: 12, day: 'Sun', name: 'Open Net Session', time: '10:00', sport: 'Football', status: 'programme', color: '#7C3AED' },
  ]

  const daySessions = allSessions.filter(s => s.date === selectedDate)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12px] font-medium text-gray-900">
          {/* Fix-25: Dynamic today label */}
          {isToday ? `Today, ${now.getDate()} ${now.toLocaleDateString('en-GB', { month: 'short' })}` : selectedDate ? getDayName(selectedDate) : todayLabel}
        </h3>
        {/* CF-D02c FIX 2: Only show back link when viewing non-today date */}
        {!isToday && selectedDate !== null && selectedDate !== todayDate && (
          <button onClick={onBackToWeek} className="text-[11px] text-[#0077CC] font-medium hover:underline">
            ← This week
          </button>
        )}
      </div>
      
      {daySessions.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {daySessions.map((session, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <div className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: session.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-medium text-gray-700">{session.time}</span>
                  <span className="text-[11px] text-gray-900">{session.name}</span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">{session.sport} · {session.status.charAt(0).toUpperCase() + session.status.slice(1)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 italic py-2">No sessions on this day</p>
      )}
    </div>
  )
}

function SmartInsightCard() {
  // TODO CF-D02b: derive insight from real earnings/availability data
  return (
    <div className="bg-[#E8F5F0] border-l-[3px] border-l-[#1D9E75] rounded-lg px-3 py-2.5">
      <div className="text-[9px] text-[#0F6E56] uppercase tracking-wider font-medium mb-1">Insight</div>
      <p className="text-[11px] text-[#085041] font-medium leading-relaxed">
        Saturdays earn 30% more on average — consider opening a slot
      </p>
    </div>
  )
}

function PendingApprovalCard() {
  const router = useRouter()
  
  return (
    <div className="bg-[#FFFBEB] border-l-[3px] border-l-amber-400 rounded-lg px-3 py-2.5">
      <div className="text-[9px] text-amber-900 uppercase tracking-wider font-medium mb-1">Needs approval</div>
      <p className="text-[11px] text-amber-900 font-medium mb-1.5">1 booking needs your approval</p>
      <button 
        onClick={() => router.push('/coach/bookings?tab=pending')}
        className="text-[11px] text-[#0077CC] font-medium hover:underline"
      >
        Review now →
      </button>
    </div>
  )
}

// CF-D03 CHANGE 7 / Fix-55: Bookings-specific right panel components
function BookingsPendingApprovals({ sportsMap }: { sportsMap: Record<string, string> }) {
  const [bookings, setBookings] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchPending = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/coaches/bookings?tab=pending_approval')
      if (!res.ok) { setBookings([]); return }
      const data = await res.json() as { bookings: BookingListItem[] }
      setBookings(data.bookings ?? [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPending() }, [fetchPending])

  const handleAction = async (id: string, action: 'approve' | 'decline') => {
    setActionLoadingId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/coaches/bookings/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setActionError(data.error ?? 'Something went wrong')
        return
      }
      await fetchPending()
    } catch {
      setActionError('Network error — please try again')
    } finally {
      setActionLoadingId(null)
    }
  }

  return (
    <div>
      <h3 className="text-[13px] font-medium text-gray-900 mb-2">Pending approvals</h3>
      {loading ? (
        <p className="text-[11px] text-gray-400">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="text-[11px] text-gray-400">No pending approvals</p>
      ) : (
        <div className="space-y-2">
          {bookings.map((booking) => {
            const clientName = booking.child_name ?? booking.booked_by_name ?? '—'
            const sportName = sportsMap[booking.sport_id] ?? ''
            const typeLabel = booking.session_type === 'group' ? 'Group' : '1-on-1'
            const dateLabel = formatSessionDateShort(booking.session_date)
            const timeLabel = booking.session_start_time.slice(0, 5)
            const isActing = actionLoadingId === booking.id
            return (
              <div key={booking.id} className="bg-[#FFFBEB] border-[0.5px] border-gray-100 rounded-[10px] p-3">
                <p className="text-[12px] font-medium text-gray-900 mb-1">{clientName}</p>
                <p className="text-[10px] text-gray-500 mb-1">
                  {[sportName, typeLabel, `${dateLabel} ${timeLabel}`].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[10px] text-[#92400E] mb-2">Requested {formatRelativeTime(booking.created_at)}</p>
                {actionError && actionLoadingId === null && (
                  <p className="text-[10px] text-red-600 mb-1.5">{actionError}</p>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleAction(booking.id, 'approve')}
                    disabled={actionLoadingId !== null}
                    className="flex-1 bg-[#0077CC] text-white text-[11px] font-medium rounded-md py-1.5 text-center hover:bg-[#0066AA] transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                  >
                    {isActing && actionLoadingId === booking.id ? <Loader2 size={11} className="animate-spin" /> : '✓'} Approve
                  </button>
                  <button
                    onClick={() => handleAction(booking.id, 'decline')}
                    disabled={actionLoadingId !== null}
                    className="flex-1 bg-white border border-[#F09595] text-red-700 text-[11px] font-medium rounded-md py-1.5 text-center hover:bg-red-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                  >
                    {isActing && actionLoadingId === booking.id ? <Loader2 size={11} className="animate-spin" /> : '✗'} Decline
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BookingsTodaySessions({ sportsMap }: { sportsMap: Record<string, string> }) {
  const [sessions, setSessions] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchToday = async () => {
      try {
        const res = await fetch('/api/coaches/bookings?tab=today')
        if (!res.ok) { setSessions([]); return }
        const data = await res.json() as { bookings: BookingListItem[] }
        setSessions(data.bookings ?? [])
      } catch {
        setSessions([])
      } finally {
        setLoading(false)
      }
    }
    fetchToday()
  }, [])

  return (
    <div className="border-t-[0.5px] border-gray-100 pt-3.5">
      <h3 className="text-[12px] text-gray-400 mb-2">Today's sessions</h3>
      {loading ? (
        <p className="text-[11px] text-gray-400">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-[11px] text-gray-400">No sessions today</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session, idx) => {
            const clientName = session.child_name ?? session.booked_by_name ?? session.booking_reference
            const sportName = sportsMap[session.sport_id] ?? ''
            const statusLabel = session.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            return (
              <div key={session.id}>
                <div className="flex items-start gap-2">
                  <div
                    className="w-[7px] h-[7px] rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: statusDotColor(session.status) }}
                  />
                  <div className="flex-1">
                    <p className="text-[11px] font-medium text-gray-900">
                      {session.session_start_time.slice(0, 5)} · {clientName}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {[sportName, statusLabel].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {idx < sessions.length - 1 && (
                  <div className="border-t-[0.5px] border-gray-100 mt-3" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

