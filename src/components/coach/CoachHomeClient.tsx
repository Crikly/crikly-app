'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Clock, MapPin, AlertTriangle,
  ChevronRight, PoundSterling, Check, Calendar, Plus,
  Search, Banknote, Copy, Share, ArrowRight
} from 'lucide-react'
// DS-RIGHT-PANEL-01: CoachRightPanel is now mounted by CoachLayoutClient
// on every coach route (was rendered here with dashboardData prop).
// C-Settings-01-UI: pause banner reads is_paused from cached profile fetch
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'
// CF-PROGRAMMES-IMAGE-PICKER: shared default placeholder for programmes
// without an image_url (existing programmes pre-dating the picker).
import { DEFAULT_PROGRAMME_IMAGE } from '@/lib/programme-images'

const upNextUrl = "https://images.unsplash.com/photo-1771909713672-4e351f1f8b62?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcmlja2V0JTIwdHJhaW5pbmclMjBzcG9ydHN8ZW58MXx8fHwxNzc1NDg3OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080"
// CF-PROGRAMMES-IMAGE-PICKER: group1Url + group2Url removed — GroupCard now
// uses each programme's real image_url with DEFAULT_PROGRAMME_IMAGE fallback.
const fallbackAvatarUrl = "https://images.unsplash.com/photo-1609422644211-a85c36ee36a7?w=100&q=80"

// BUG-UPNEXT-TIME-FORMAT: smart "starts in" labels — minutes for the first
// hour, then h+m up to a day, then days for sessions that are 24h+ out
// (group programme sessions can be days away when the dashboard renders).
function formatStartsIn(minutes: number): string {
  if (minutes <= 0) return 'Starting now'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`
}

interface Programme {
  id: string
  title: string
  current_spots: number
  max_spots: number
  status: string
  /** CF-PROGRAMMES-IMAGE-PICKER: nullable cover photo URL. */
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
    /** BUG-UPNEXT-IMAGE: group sessions carry their programme's cover photo. */
    image_url?: string | null
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

interface CoachHomeClientProps {
  data: DashboardData
}

export function CoachHomeClient({ data }: CoachHomeClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [profileExpanded, setProfileExpanded] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [profileUrl, setProfileUrl] = useState('crikly.app/coach')
  const [copied, setCopied] = useState(false)
  // C-Settings-01-UI: pause banner state (cached fetch — no extra round-trip if already warm)
  const [isPaused, setIsPaused] = useState(false)
  // UI-CARD-FIX: track programmes-row scroll position to show left-edge fade after scroll
  const programmesScrollRef = useRef<HTMLDivElement>(null)
  const [programmesScrolled, setProgrammesScrolled] = useState(false)

  useEffect(() => {
    const el = programmesScrollRef.current
    if (!el) return
    const handler = () => setProgrammesScrolled(el.scrollLeft > 10)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [data.programmes.length])

  // Fix-36: Detect celebration query param and show modal
  useEffect(() => {
    if (searchParams.get('celebrated') === 'true') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCelebration(true)
      // Clean URL without reload
      window.history.replaceState({}, '', '/coach/dashboard')
    }
  }, [searchParams])

  // Fix-36b: Derive profile URL from coach name
  useEffect(() => {
    const slug = data.coachName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProfileUrl(`crikly.app/${slug}`)
  }, [data.coachName])

  // C-Settings-01-UI: read is_paused from cached profile fetch (DashboardData doesn't include it)
  useEffect(() => {
    fetchCoachProfileCached()
      .then((p: { is_paused?: boolean } | null) => {
        if (p?.is_paused) setIsPaused(true)
      })
      .catch(() => {/* non-critical — banner just won't show */})
  }, [])
  
  // Time-based greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' :
                   hour < 18 ? 'Good afternoon' : 'Good evening'
  
  // CF-D11a: Profile completion tracking - now from real data
  const profileSteps = [
    { title: 'Basic profile', completed: data.profileCompletion.completedSteps[0] || false, guidance: '' },
    { title: 'Sport', completed: data.profileCompletion.completedSteps[1] || false, guidance: '' },
    { title: 'Qualifications', completed: data.profileCompletion.completedSteps[2] || false, guidance: 'Add your coaching badge to boost trust' },
    { title: 'Availability', completed: data.profileCompletion.completedSteps[3] || false, guidance: 'Set when you coach so parents can book you' },
    { title: 'Booking policy', completed: data.profileCompletion.completedSteps[4] || false, guidance: 'Tell parents how you handle cancellations' },
    { title: 'Get paid (optional)', completed: data.profileCompletion.completedSteps[5] || false, guidance: 'Connect Stripe to receive payouts' },
  ]
  const completedCount = profileSteps.filter(s => s.completed).length
  const totalCount = profileSteps.length
  const completionPercentage = data.profileCompletion.percentage
  const firstIncompleteIndex = profileSteps.findIndex(s => !s.completed)
  
  // Today's sessions from real data
  const todaySessions = data.todaySessions
  const sessionCount = todaySessions.length
  const getSessionSubtitle = () => {
    if (sessionCount === 0) return "No sessions today. A good day to plan ahead."
    if (sessionCount === 1) return "You have 1 session today. Let's get ready."
    return `You have ${sessionCount} sessions today. Let's get ready.`
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-screen">
      {/* Main content — left/center */}
      <div className="flex-1 min-w-0 flex justify-center">
        <div className="w-full flex flex-col gap-6 md:gap-8 p-5 md:p-10 pb-28 md:pb-10 bg-white">

        {/* C-Settings-01-UI: amber pause banner — visible on both mobile + desktop */}
        {isPaused && (
          <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-[10px] p-3 flex gap-2.5 items-start">
            <AlertTriangle size={18} strokeWidth={1.8} className="text-warning shrink-0 mt-0.5" />
            <div className="text-[13px] text-[#854D0E] leading-[1.5]">
              <strong className="text-[#713F12] font-semibold">Your profile is paused.</strong>{' '}
              Parents cannot find you in search results.{' '}
              <Link href="/coach/settings" className="text-brand-600 font-medium ml-1 inline-flex items-center gap-1 hover:underline">
                Go to settings →
              </Link>
            </div>
          </div>
        )}

        {/* Mobile Top Bar */}
        <div className="flex justify-between items-center md:hidden mb-2">
          <Link href="/coach/dashboard">
            <img
              src="/logo.png"
              alt="Crikly"
              className="h-7 w-auto object-contain"
            />
          </Link>
          <Link href="/coach/dashboard" className="relative">
            {data.coachAvatarUrl && data.coachAvatarUrl.trim() !== '' ? (
              <img src={data.coachAvatarUrl} alt={data.coachName || 'Coach'} className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-100" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center text-[14px] font-bold shadow-sm border border-gray-100">
                {(data.coachName || 'C').charAt(0).toUpperCase()}
              </div>
            )}
            {data.pendingApprovalsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                {data.pendingApprovalsCount > 9 ? '9+' : data.pendingApprovalsCount}
              </span>
            )}
          </Link>
        </div>

        {/* Desktop Greeting - CHANGE 1: emoji + subtitle */}
        <div className="hidden md:flex justify-between items-end">
          <div>
            <p className="text-gray-500 text-sm mb-1.5 font-medium">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long', day: 'numeric', month: 'long'
              })}
            </p>
            <h1 className="text-[28px] font-bold tracking-tight text-gray-900">{greeting}, {data.coachName.split(' ')[0] || 'Coach'} 👋</h1>
            <p className="text-sm text-gray-500 mt-1">{getSessionSubtitle()}</p>
          </div>
        </div>

        {/* Mobile Greeting - CHANGE 1: emoji + subtitle */}
        <div className="md:hidden">
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900 leading-tight">{greeting}, {data.coachName.split(' ')[0] || 'Coach'} 👋</h1>
          <p className="text-sm text-gray-500 mt-1">{getSessionSubtitle()}</p>
        </div>

        {/* CF-D11a: Onboarding completion banner — hidden at 100% (Fix-44) */}
        {completionPercentage < 100 && (
        <div className="flex flex-col gap-3">
          <div className="bg-neutral-50 border-l-4 border-brand-600 rounded-r-lg overflow-hidden transition-all duration-300">
            {/* CF-D11a CHANGE 1: Banner header with completion % inline */}
            <div
              onClick={() => setProfileExpanded(!profileExpanded)}
              className="p-3.5 flex items-center justify-between gap-2 text-blue-800 cursor-pointer hover:bg-blue-100/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                <span className="text-[13px] font-bold text-brand-600 shrink-0">{completionPercentage}% complete</span>
                <span className="text-[14px] md:text-[15px] font-medium truncate">Complete your profile to appear in search</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-brand-600 text-sm font-bold cursor-pointer hover:underline hidden md:inline">Finish setup</span>
                <ChevronRight size={18} className={`text-brand-600/60 transition-transform duration-300 shrink-0 ${profileExpanded ? 'rotate-90' : ''}`} />
              </div>
            </div>
            {profileExpanded && (
              <div className="px-4 pb-4 pt-3 border-t border-gray-200/40 bg-neutral-50">
                {/* CF-D11a CHANGE 4: Progress bar */}
                <div className="mb-4">
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-600 rounded-full transition-all duration-500" style={{ width: `${completionPercentage}%` }}></div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">{completedCount} of {totalCount} steps complete</p>
                </div>
                <ul className="flex flex-col gap-2">
                  {profileSteps.map((step, index) => (
                    <ProfileChecklistItem 
                      key={index}
                      title={step.title} 
                      completed={step.completed}
                      guidance={step.guidance}
                      isFirstIncomplete={index === firstIncompleteIndex}
                      onNavigate={() => {
                        const routes = [
                          '/coach/onboarding/profile',
                          '/coach/onboarding/sport',
                          '/coach/onboarding/qualifications',
                          '/coach/onboarding/availability',
                          '/coach/onboarding/policy',
                          '/coach/onboarding/get-paid'
                        ]
                        router.push(routes[index])
                      }} 
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          {data.pendingApprovalsCount > 0 && (
            <div
              onClick={() => router.push('/coach/bookings')}
              className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-3.5 flex items-center justify-between gap-2 text-amber-900 cursor-pointer hover:bg-amber-100/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 shrink-0">{data.pendingApprovalsCount}</div>
                <span className="text-[14px] md:text-[15px] font-medium truncate">Bookings need approval</span>
              </div>
              <span className="text-amber-700 text-sm font-bold cursor-pointer hover:underline">Review →</span>
            </div>
          )}
        </div>
        )}

        {/* CHANGE 3: CTA button row */}
        <div className="flex flex-col md:flex-row gap-3">
          <button
            onClick={() => router.push('/coach/schedule?action=new-session')}
            className="flex-1 h-10 bg-brand-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-brand-700 transition-colors"
          >
            <Plus size={16} />
            Create Session
          </button>
          <button
            onClick={() => router.push('/coach/availability')}
            className="flex-1 h-10 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors"
          >
            <Plus size={16} />
            Add Availability
          </button>
          <button
            onClick={() => router.push('/coach/programmes')}
            className="flex-1 h-10 bg-white text-gray-700 border border-gray-200 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors"
          >
            <Plus size={16} />
            Create Programme
          </button>
        </div>

        {/* Up Next Hero Card */}
        <section className="flex flex-col gap-3.5 max-w-full">
          <div className="flex justify-between items-end">
            <h2 className="text-[19px] font-bold text-gray-900">Up next</h2>
            <span onClick={() => router.push('/coach/schedule')} className="text-brand-600 text-sm font-bold cursor-pointer md:hidden hover:underline">View schedule</span>
          </div>
          {data.upNextSession ? (
            <div className="relative h-64 md:h-[340px] w-full rounded-2xl md:rounded-[24px] overflow-hidden shadow-sm group cursor-pointer isolate">
              <img src={data.upNextSession.image_url ?? upNextUrl} alt="Cricket Training" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 -z-10" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 55%)' }}></div>
              <div className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2">
                <div className="bg-white/20 backdrop-blur-md border border-white/20 text-white text-[13px] font-bold px-3.5 py-1.5 rounded-full shadow-sm">
                  {data.upNextSession.startsInMinutes <= 0
                    ? formatStartsIn(data.upNextSession.startsInMinutes)
                    : `Starts in ${formatStartsIn(data.upNextSession.startsInMinutes)}`}
                </div>
                {/* BUG-UPNEXT-PROGRAMME-SESSIONS: session-type badge */}
                <div className="bg-white/20 backdrop-blur-md border border-white/20 text-white text-[13px] font-bold px-3.5 py-1.5 rounded-full shadow-sm">
                  {data.upNextSession.sessionType === 'group' ? 'Group' : '1-to-1'}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 w-full p-5 md:p-8 flex flex-col gap-2.5 z-10">
                <h3 className="text-white text-[26px] md:text-3xl font-bold leading-tight drop-shadow-sm">{data.upNextSession.title}</h3>
                <div className="flex flex-wrap items-center gap-4 text-gray-100 text-[15px] font-medium mt-1">
                  <div className="flex items-center gap-1.5"><Clock size={16} className="text-gray-300" /><span>{data.upNextSession.startTime} - {data.upNextSession.endTime}</span></div>
                  <div className="flex items-center gap-1.5"><MapPin size={16} className="text-gray-300" /><span>{data.upNextSession.venue}</span></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative h-64 md:h-[340px] w-full rounded-2xl md:rounded-[24px] overflow-hidden shadow-sm border-2 border-dashed border-gray-200 bg-neutral-50 flex flex-col items-center justify-center p-8 text-center">
              <Calendar size={48} className="text-gray-300 mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">No upcoming sessions</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-md">Add your availability to start getting bookings.</p>
              <button
                onClick={() => router.push('/coach/availability')}
                className="bg-brand-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-brand-700 transition-colors"
              >
                <Plus size={16} />
                Add Availability
              </button>
            </div>
          )}
        </section>

        {/* DS-RIGHT-PANEL-01: removed mobile-only ThisWeekStrip + TodayLineup —
            redundant with Up Next + Weekly Overview on mobile, and the
            universal right panel covers the desktop case. */}

        {/* Weekly Overview 4-stat row */}
        <section className="flex flex-col gap-3 mt-2 md:mt-0">
          <h2 className="text-base font-semibold text-gray-900">Weekly Overview</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/coach/schedule" className="bg-white border border-gray-100 rounded-[10px] p-4 flex flex-col gap-1 cursor-pointer hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
              <Calendar size={16} className="text-brand-600 mb-1" />
              <p className="text-xs text-gray-500">Sessions this week</p>
              <p className="text-2xl font-medium text-gray-900">{data.weeklyStats.sessionsThisWeek}</p>
            </Link>
            <Link href="/coach/bookings?tab=pending_approval" className="bg-white border border-gray-100 rounded-[10px] p-4 flex flex-col gap-1 cursor-pointer hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
              <Clock size={16} className="text-amber-600 mb-1" />
              <p className="text-xs text-gray-500">Bookings pending</p>
              <p className="text-2xl font-medium text-gray-900">{data.weeklyStats.bookingsPending}</p>
            </Link>
            <Link href="/coach/earnings" className="bg-white border border-gray-100 rounded-[10px] p-4 flex flex-col gap-1 cursor-pointer hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
              <PoundSterling size={16} className="text-green-600 mb-1" />
              <p className="text-xs text-gray-500">Revenue this week</p>
              <p className="text-2xl font-medium text-gray-900">£{data.weeklyStats.revenueThisWeek.toFixed(0)}</p>
            </Link>
            <Link href="/coach/bookings?tab=past" className="bg-white border border-gray-100 rounded-[10px] p-4 flex flex-col gap-1 cursor-pointer hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
              <Check size={16} className="text-brand-600 mb-1" />
              <p className="text-xs text-gray-500">Completion rate</p>
              <p className="text-2xl font-medium text-gray-900">{data.weeklyStats.completionRate}%</p>
            </Link>
          </div>
        </section>

        {/* Group Programmes */}
        <section className="flex flex-col gap-3.5">
          <div className="flex justify-between items-end">
            <h2 className="text-[19px] font-bold text-gray-900">Your programmes</h2>
            <Link href="/coach/programmes" className="text-brand-600 text-sm font-bold hover:underline">View all</Link>
          </div>
          {data.programmes.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-neutral-50 p-10 text-center">
              <Calendar size={40} className="text-gray-300 mb-4" />
              <h3 className="text-base font-bold text-gray-900 mb-1">No programmes yet</h3>
              <p className="text-sm text-gray-500 mb-5">Create a group programme to coach multiple players at once.</p>
              <button
                data-testid="create-programme-button"
                onClick={() => router.push('/coach/programmes')}
                className="bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-brand-700 transition-colors"
              >
                <Plus size={16} />
                Create programme
              </button>
            </div>
          ) : (
            <div className="relative">
              <div ref={programmesScrollRef} className="flex flex-row items-stretch gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide w-full">
                {data.programmes.map((prog) => (
                  <div key={prog.id} className="flex-shrink-0 w-[280px] snap-start">
                    <GroupCard
                      title={prog.title}
                      spots={`${prog.current_spots} of ${prog.max_spots} spots taken`}
                      image={prog.image_url ?? DEFAULT_PROGRAMME_IMAGE}
                      active={prog.status === 'active'}
                      isDraft={prog.status === 'draft'}
                    />
                  </div>
                ))}
              </div>
              {programmesScrolled && (
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white/80 to-transparent pointer-events-none z-10" />
              )}
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 to-transparent pointer-events-none z-10" />
            </div>
          )}
        </section>
        </div>
      </div>

      {/* DS-RIGHT-PANEL-01: CoachRightPanel is mounted by CoachLayoutClient now.
          The dashboardData prop was the only reason the dashboard route was
          previously excluded from the layout-level panel mount. */}

      {/* Fix-36: Celebration modal */}
      {showCelebration && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={() => setShowCelebration(false)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-[500px] p-8 shadow-xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              {/* Logo */}
              <img
                src="/logo.png"
                alt="Crikly"
                className="w-24 h-auto object-contain mb-8"
              />

              {/* Green tick */}
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <Check size={40} className="text-white" strokeWidth={3} />
              </div>

              <h1 className="text-[28px] font-bold text-gray-900 leading-tight mb-2">You&apos;re live!</h1>
              <p className="text-[15px] text-gray-500 font-medium mb-8">
                Parents and players can now find and book you on Crikly
              </p>

              {/* What happens next */}
              <div className="w-full text-left mb-6">
                <h2 className="text-[14px] font-bold text-gray-900 mb-4">
                  What happens next?
                </h2>
                <div className="flex flex-col gap-3">
                  {[
                    { icon: <Search size={18} className="text-brand-600" />, label: 'You appear in search results immediately' },
                    { icon: <Calendar size={18} className="text-brand-600" />, label: 'Bookings will show up on your dashboard' },
                    { icon: <Banknote size={18} className="text-brand-600" />, label: 'Get paid 48 hours after each session' },
                  ].map(({ icon, label }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        {icon}
                      </div>
                      <span className="text-[14px] text-gray-700 font-medium">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Share profile */}
              <div className="w-full border-t border-gray-100 pt-6 mb-6">
                <h2 className="text-[14px] font-bold text-gray-900 mb-1 text-left">Share your profile</h2>
                <p className="text-[13px] text-gray-500 mb-3 text-left">
                  Let people know you&apos;re on Crikly
                </p>
                <div className="p-3 bg-neutral-50 rounded-xl border border-gray-100 text-[13px] text-gray-700 font-mono truncate mb-3">
                  {profileUrl}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`https://${profileUrl}`)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="flex-1 py-2 bg-white border border-gray-200 hover:bg-neutral-50 text-gray-700 rounded-xl font-medium text-[13px] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Copy size={14} />
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCelebration(false)
                      window.dispatchEvent(new CustomEvent('crikly:open-share-modal'))
                    }}
                    className="flex-1 py-2 bg-white border border-gray-200 hover:bg-neutral-50 text-gray-700 rounded-xl font-medium text-[13px] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Share size={14} />Share
                  </button>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => setShowCelebration(false)}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-[15px] transition-colors flex items-center justify-center gap-2"
              >
                Go to my dashboard <ArrowRight size={16} />
              </button>

              {/* Premium upsell */}
              <p className="text-[12px] text-gray-400 mt-4">
                Want more bookings?{' '}
                <button className="text-brand-600 font-medium hover:underline">
                  See Premium →
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// DS-RIGHT-PANEL-01: deleted local ThisWeekStrip + TodayLineup function
// declarations — they duplicated the CoachRightPanel versions and only
// rendered in the mobile-only md:hidden block (now also removed).

function ProfileChecklistItem({ title, completed, guidance, isFirstIncomplete, onNavigate }: {
  title: string; 
  completed: boolean; 
  guidance?: string;
  isFirstIncomplete?: boolean;
  onNavigate?: () => void 
}) {
  return (
    <li 
      onClick={onNavigate} 
      className={`flex items-start justify-between group cursor-pointer hover:opacity-80 transition-all px-3 py-2.5 rounded-lg ${
        isFirstIncomplete ? 'bg-[#FFFBEB]' : ''
      }`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* CF-D11a CHANGE 2: Hierarchy between complete/incomplete */}
        {completed ? (
          <div className="w-2 h-2 rounded-full bg-[#22C55E] shrink-0 mt-1.5"></div>
        ) : (
          <div className="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0 mt-1.5"></div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`transition-colors ${
              completed 
                ? 'text-[12px] text-gray-400 font-normal' 
                : 'text-[13px] text-gray-900 font-medium'
            }`}>{title}</span>
            {/* CF-D11a CHANGE 2: "Do next" badge for first incomplete */}
            {isFirstIncomplete && (
              <span className="bg-[#FEF3C7] text-[#92400E] text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0">
                Do next →
              </span>
            )}
          </div>
          {/* CF-D11a CHANGE 3: Guidance copy for incomplete items */}
          {!completed && guidance && (
            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{guidance}</p>
          )}
        </div>
      </div>
      {!completed && <ChevronRight size={14} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />}
    </li>
  )
}

function GroupCard({ title, spots, image, active, isDraft }: { title: string; spots: string; image: string; active?: boolean; isDraft?: boolean }) {
  return (
    <div className={`flex flex-col h-full bg-white border border-gray-100 rounded-[20px] overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.03)] cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all group ${isDraft ? 'opacity-60' : ''}`}>
      <div className="h-[140px] w-full bg-gray-100 relative overflow-hidden flex-none">
        <img src={image} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        {isDraft ? (
          <div className="absolute top-3 left-3 bg-gray-700/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">Draft</div>
        ) : active && (
          <div className="absolute top-3 left-3 bg-green-500/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">Active</div>
        )}
      </div>
      <div className="p-4 md:p-5 flex flex-col gap-1.5 flex-1">
        <h4 className="font-bold text-[17px] text-gray-900 leading-tight group-hover:text-brand-600 transition-colors line-clamp-2 flex-none">{title}</h4>
        <div className="flex-1" aria-hidden="true" />
        <div className="flex items-center justify-between mt-2">
          <p className="text-[13px] font-medium text-gray-500">{isDraft ? 'Not published yet' : spots}</p>
          <div className="flex -space-x-2">
            {[1,2,3].map(i => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 shadow-sm overflow-hidden">
                <img src={fallbackAvatarUrl} alt="avatar" className="w-full h-full object-cover opacity-80" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
