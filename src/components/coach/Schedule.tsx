'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Check, User, RefreshCw, Users, Ban, X, Calendar, MapPin, PoundSterling, AlertCircle, Info } from 'lucide-react'
import { VenueAutocomplete, type VenueSelection } from '@/components/coach/shared/LocationAutocomplete'

// CD-12: API response types
interface AvailabilityResponse {
  id: string
  sport_id: string | null
  sport_name: string | null
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  price_override_pence: number | null
  session_type_id: string | null
  session_type_name: string | null
  venue_name: string | null
  venue_address: string | null
  is_recurring: boolean
  specific_date: string | null
  created_at: string
}

interface SportOption {
  sport_id: string
  sport_name: string
}

interface EventBlockProps {
  top: number
  height: number
  type: 'confirmed' | 'programme' | 'pending' | 'blocked' | 'available' | 'adhoc'
  title: string
  subtitle?: string
  sessionId?: string
  onCardClick?: (e: React.MouseEvent, sessionId: string, type: string) => void
}

function EventBlock({ top, height, type, title, subtitle, sessionId, onCardClick }: EventBlockProps) {
  let bgClass = ''
  let textClass = 'text-white'
  let borderClass = ''
  let leftBorderClass = ''
  let extraStyles: React.CSSProperties = {}

  // CHANGE 3: Left border accent by status
  switch (type) {
    case 'confirmed':
      bgClass = 'bg-blue-100'
      textClass = 'text-blue-900'
      leftBorderClass = 'border-l-[3px] border-l-blue-500'
      break
    case 'programme':
      bgClass = 'bg-purple-100'
      textClass = 'text-purple-900'
      leftBorderClass = 'border-l-[3px] border-l-purple-600'
      break
    case 'pending':
      bgClass = 'bg-amber-100'
      textClass = 'text-amber-900'
      leftBorderClass = 'border-l-[3px] border-l-amber-400'
      break
    case 'blocked':
      // CHANGE 5: Lighter blocked state
      bgClass = ''
      textClass = 'text-gray-400'
      extraStyles = { backgroundImage: 'repeating-linear-gradient(45deg, #F4F3F0, #F4F3F0 4px, #ECEAE6 4px, #ECEAE6 8px)' }
      break
    case 'available':
      // CHANGE 4: Opportunity treatment for available slots
      bgClass = 'bg-[#E8F5F0]'
      textClass = 'text-[#0F6E56]'
      borderClass = 'border border-dashed border-[#1D9E75] hover:border-solid hover:bg-[#F0FAF6] cursor-pointer'
      break
    case 'adhoc':
      bgClass = 'bg-teal-100'
      textClass = 'text-teal-900'
      leftBorderClass = 'border-l-[3px] border-l-teal-500'
      break
  }

  // CF-D02b CHANGE 1 & 2: Handle card click
  // CF-D02e BUG FIX 2: Stop propagation to prevent cell click
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (sessionId && onCardClick) {
      onCardClick(e, sessionId, type)
    }
  }

  return (
    <div
      className={`session-card absolute left-1 right-1 rounded-lg p-2 overflow-visible flex flex-col justify-start group ${bgClass} ${textClass} ${borderClass} ${leftBorderClass}`}
      style={{ top: `${top}px`, height: `${height}px`, ...extraStyles }}
      onClick={handleClick}
    >
      {/* CHANGE 3: Hover quick actions */}
      {type !== 'available' && type !== 'adhoc' && type !== 'blocked' && (
        <div className="quick-actions absolute top-1 right-1 flex gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
          <button onClick={() => {/* TODO CF-D02: wire View quick action */}} className="text-[8px] px-1 py-0.5 rounded-sm bg-white/75" style={{ color: 'inherit' }}>View</button>
          <button onClick={() => {/* TODO CF-D02: wire Message quick action */}} className="text-[8px] px-1 py-0.5 rounded-sm bg-white/75" style={{ color: 'inherit' }}>Msg</button>
        </div>
      )}
      {/* CHANGE 3: Typography refinement */}
      {type === 'blocked' ? (
        <div className="text-[9px] text-center mt-1" style={{ color: '#9CA3AF' }}>{title}</div>
      ) : (
        <>
          <div className="text-[10px] font-medium leading-tight truncate">{type === 'available' ? '+ Add session' : title}</div>
          {subtitle && type !== 'available' && <div className="text-[9px] leading-tight truncate mt-0.5" style={{ opacity: 0.75 }}>{subtitle}</div>}
        </>
      )}
    </div>
  )
}

// CD-12b: Booking block type
interface BookingBlock {
  id: string
  booking_reference: string
  session_date: string
  session_start_time: string
  session_end_time: string
  session_type: string
  status: string
  coach_price_pence: number
  child_name: string | null
  booked_by_name: string | null
}

// CF-D02c FIX 1: Single popover state
// CF-D02d BUG FIX 3: Add source field to distinguish slot vs button trigger
type ActivePopover =
  | { type: 'session'; sessionId: string; sessionType: string; x: number; y: number }
  | { type: 'creation'; source: 'slot' | 'button'; date: string; time: string; x: number; y: number }
  | null

export function Schedule() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [activePopover, setActivePopover] = useState<ActivePopover>(null)
  const [weekOffset, setWeekOffset] = useState(0) // CF-D02c FIX 3: Week navigation
  const gridRef = useRef<HTMLDivElement>(null)
  const scheduleContainerRef = useRef<HTMLDivElement>(null)
  
  // CF-D02i: Layout dimensions for popover positioning
  const SIDEBAR_WIDTH = 288 // w-72 from layout.tsx
  const RIGHT_PANEL_WIDTH = 384 // w-96 from CoachRightPanel.tsx
  
  // CD-12: State for availability data
  const [availability, setAvailability] = useState<AvailabilityResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // CD-12b: State for booking blocks
  const [bookings, setBookings] = useState<BookingBlock[]>([])
  // CI-01: Increment to force bookings re-fetch after approve/decline
  const [refreshKey, setRefreshKey] = useState(0)

  // CF-02a: Ad hoc modal state
  const [adHocStep, setAdHocStep] = useState<'menu' | 'form'>('menu')
  const [adHocDate, setAdHocDate] = useState('')
  const [adHocSportId, setAdHocSportId] = useState('')
  const [adHocStartTime, setAdHocStartTime] = useState('09:00')
  const [adHocEndTime, setAdHocEndTime] = useState('10:00')
  const [adHocNotes, setAdHocNotes] = useState('')
  const [adHocSubmitting, setAdHocSubmitting] = useState(false)
  const [adHocError, setAdHocError] = useState<string | null>(null)
  const [sports, setSports] = useState<SportOption[]>([])
  const [adHocVenueName, setAdHocVenueName] = useState('')
  const [adHocVenueAddress, setAdHocVenueAddress] = useState('')
  const [venueKey, setVenueKey] = useState(0)
  const [adHocPrice, setAdHocPrice] = useState('')

  // CD-12: Fetch availability data on mount and after ad hoc submit
  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/coaches/availability')
        if (!response.ok) {
          throw new Error('Failed to fetch availability')
        }

        const data = await response.json()
        setAvailability(data.availability || [])
      } catch (err) {
        console.error('Failed to fetch availability:', err)
        setError('Failed to load schedule. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchAvailability()
  }, [refreshKey])

  // CF-02a: Fetch coach sports when add modal opens
  useEffect(() => {
    if (!isAddModalOpen) return
    const fetchSports = async () => {
      try {
        const res = await fetch('/api/coaches/sports')
        if (!res.ok) return
        const data = await res.json() as { sports: SportOption[] }
        setSports(data.sports || [])
        if (data.sports?.length > 0) setAdHocSportId(data.sports[0].sport_id)
      } catch {
        // non-critical
      }
    }
    fetchSports()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen])
  
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = 128
    }
  }, [])

  // CD-12b / Fix-54: Fetch bookings for the visible week (today + upcoming + past + pending_approval)
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        setLoading(true)
        const [todayRes, upcomingRes, pastRes, pendingRes] = await Promise.all([
          fetch('/api/coaches/bookings?tab=today'),
          fetch('/api/coaches/bookings?tab=upcoming'),
          fetch('/api/coaches/bookings?tab=past'),
          fetch('/api/coaches/bookings?tab=pending_approval'),
        ])
        const [todayData, upcomingData, pastData, pendingData] = await Promise.all([
          todayRes.ok ? (todayRes.json() as Promise<{ bookings: BookingBlock[] }>) : Promise.resolve({ bookings: [] }),
          upcomingRes.ok ? (upcomingRes.json() as Promise<{ bookings: BookingBlock[] }>) : Promise.resolve({ bookings: [] }),
          pastRes.ok ? (pastRes.json() as Promise<{ bookings: BookingBlock[] }>) : Promise.resolve({ bookings: [] }),
          pendingRes.ok ? (pendingRes.json() as Promise<{ bookings: BookingBlock[] }>) : Promise.resolve({ bookings: [] }),
        ])

        const merged = [
          ...(todayData.bookings ?? []),
          ...(upcomingData.bookings ?? []),
          ...(pastData.bookings ?? []),
          ...(pendingData.bookings ?? []),
        ]
        const seen = new Set<string>()
        const deduped = merged.filter((b) => {
          if (seen.has(b.id)) return false
          seen.add(b.id)
          return true
        })

        const weekStart = days[0].fullDate.toISOString().slice(0, 10)
        const weekEnd = days[6].fullDate.toISOString().slice(0, 10)
        const visible = deduped.filter(
          (b) =>
            b.session_date >= weekStart &&
            b.session_date <= weekEnd &&
            b.status !== 'cancelled_parent' &&
            b.status !== 'cancelled_coach',
        )
        setBookings(visible)
      } catch {
        // non-critical — grid still shows availability
      } finally {
        setLoading(false)
      }
    }

    fetchBookings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, refreshKey])

  // Fix-20: Auto-open New Session popover when ?action=new-session
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'new-session' && !activePopover) {
      // Calculate center position for popover
      const centerX = window.innerWidth / 2 - 190 // 380px width / 2
      const centerY = 200
      
      // Get current time rounded to next 30min
      const now = new Date()
      const minutes = now.getMinutes()
      const roundedMinutes = minutes < 30 ? 30 : 0
      const roundedHours = minutes < 30 ? now.getHours() : now.getHours() + 1
      const time = `${roundedHours.toString().padStart(2, '0')}:${roundedMinutes.toString().padStart(2, '0')}`
      
      // Get today's date
      const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      
      setActivePopover({
        type: 'creation',
        source: 'button',
        date: today,
        time: time,
        x: centerX,
        y: centerY
      })
    }
  }, [searchParams, activePopover])

  // CF-D02c FIX 1: Close popover on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.session-popover') && !target.closest('.session-card')) {
        setActivePopover(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // CF-D02c FIX 1: Handle session card click (single popover)
  // CF-D02h FIX 1: Use fixed positioning with viewport coordinates
  // CF-D02i: Clamp to not overlap right panel
  // CF-D02j: Update clamping for 380px popover width
  const handleCardClick = (e: React.MouseEvent, sessionId: string, type: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    
    // Anchor to card but clamp to not overlap right panel
    const x = Math.min(rect.right + 8, window.innerWidth - RIGHT_PANEL_WIDTH - 388) // 388 = 380px width + 8px margin
    const y = Math.min(rect.top, window.innerHeight - 400)
    
    setActivePopover({
      type: 'session',
      sessionId,
      sessionType: type,
      x,
      y
    })
  }

  // CF-D02c FIX 1: Handle empty/available slot click (single popover)
  // CF-D02d BUG FIX 3: Add source field
  // CF-D02h FIX 1: Use fixed positioning with viewport coordinates
  // CF-D02i: Centre in main content area
  // CF-D02j: Update for 380px popover width
  const handleSlotClick = (e: React.MouseEvent, date: string, time: string) => {
    // Centre popover in main content area
    const mainWidth = window.innerWidth - SIDEBAR_WIDTH - RIGHT_PANEL_WIDTH
    const popoverX = SIDEBAR_WIDTH + (mainWidth / 2) - 190 // 190 = half of 380px popover width
    const popoverY = window.innerHeight * 0.25
    
    setActivePopover({
      type: 'creation',
      source: 'slot',
      date,
      time,
      x: popoverX,
      y: popoverY
    })
  }

  // CF-02a: Submit ad hoc slot
  const submitAdHoc = async () => {
    setAdHocError(null)
    if (!adHocDate) { setAdHocError('Please select a date.'); return }
    if (!adHocStartTime || !adHocEndTime) { setAdHocError('Please set start and end times.'); return }
    const [sh, sm] = adHocStartTime.split(':').map(Number)
    const [eh, em] = adHocEndTime.split(':').map(Number)
    if (eh * 60 + em <= sh * 60 + sm) { setAdHocError('End time must be after start time.'); return }

    const dateObj = new Date(`${adHocDate}T00:00:00`)
    const dayOfWeek = dateObj.getDay()

    setAdHocSubmitting(true)
    try {
      const res = await fetch('/api/coaches/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day_of_week: dayOfWeek,
          start_time: adHocStartTime,
          end_time: adHocEndTime,
          sport_id: adHocSportId || null,
          venue_name: adHocVenueName || null,
          venue_address: adHocVenueAddress || null,
          price_override_pence: adHocPrice ? Math.round(parseFloat(adHocPrice) * 100) : null,
          is_recurring: false,
          specific_date: adHocDate,
        }),
      })
      const data = await res.json() as { error?: string; message?: string }
      if (!res.ok) {
        setAdHocError(data.message ?? data.error ?? 'Failed to save slot.')
        return
      }
      setIsAddModalOpen(false)
      setAdHocStep('menu')
      setAdHocDate('')
      setAdHocNotes('')
      setAdHocVenueName('')
      setAdHocVenueAddress('')
      setVenueKey(k => k + 1)
      setAdHocPrice('')
      setAdHocError(null)
      setRefreshKey(k => k + 1)
    } catch {
      setAdHocError('Network error — please try again.')
    } finally {
      setAdHocSubmitting(false)
    }
  }

  const hours = Array.from({ length: 17 }, (_, i) => i + 6)

  // Fix-26: Dynamic week calculation based on weekOffset
  const getWeekDays = (offset: number) => {
    const now = new Date()
    const todayMidnight = new Date(
      now.getFullYear(), now.getMonth(), now.getDate()
    )
    const currentDayOfWeek = todayMidnight.getDay()
    const daysFromMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1
    const monday = new Date(todayMidnight)
    monday.setDate(todayMidnight.getDate() - daysFromMonday + offset * 7)

    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday)
      day.setDate(monday.getDate() + i)
      return {
        name: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],
        date: day.getDate().toString(),
        dayOfWeek: day.getDay(),
        isToday: day.getTime() === todayMidnight.getTime(),
        fullDate: day
      }
    })
  }

  const days = getWeekDays(weekOffset)
  
  // CD-12: Helper to convert time string to grid position
  const timeToPosition = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number)
    return (hours - 6) + (minutes / 60)
  }
  
  // CD-12: Helper to calculate block height in grid units
  const calculateDuration = (startTime: string, endTime: string): number => {
    const start = timeToPosition(startTime)
    const end = timeToPosition(endTime)
    return end - start
  }

  return (
    <div className="min-h-screen bg-white flex justify-center font-sans p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-7xl relative flex flex-col lg:flex-row gap-8" ref={scheduleContainerRef}>

        {/* LEFT COLUMN */}
        <div className="flex-1 lg:w-[65%] flex flex-col">
          {/* CHANGE 1: Unified header control row */}
          <div className="bg-white border-b border-gray-100 pb-3 mb-4">
            {/* ROW 1 */}
            <div className="flex items-start justify-between mb-2 px-5 pt-4">
              <div>
                <h1 className="text-[20px] font-medium text-gray-900">Schedule</h1>
                {/* Fix-26: Dynamic week range */}
                <p className="text-[14px] text-gray-500 mt-0.5">
                  {(() => {
                    const weekStart = days[0]
                    const weekEnd = days[6]
                    const weekStartDate = weekStart.fullDate
                    const weekEndDate = weekEnd.fullDate
                    const weekRangeLabel = weekStartDate.getMonth() === weekEndDate.getMonth()
                      ? `${weekStartDate.getDate()} – ${weekEndDate.getDate()} ${weekEndDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}` 
                      : `${weekStartDate.getDate()} ${weekStartDate.toLocaleDateString('en-GB', { month: 'short' })} – ${weekEndDate.getDate()} ${weekEndDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` 
                    return weekRangeLabel
                  })()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-white border border-gray-200 rounded-full p-1">
                  {/* CF-D02c FIX 3: Day and Month disabled */}
                  <button title="Coming soon" className="px-3 py-1 rounded-full text-[12px] font-medium text-gray-600 opacity-40 cursor-not-allowed">Day</button>
                  <button className="px-3 py-1 rounded-full text-[12px] font-medium bg-[#0077CC] text-white">Week</button>
                  <button title="Coming soon" className="px-3 py-1 rounded-full text-[12px] font-medium text-gray-600 opacity-40 cursor-not-allowed">Month</button>
                </div>
                {/* CF-D02c FIX 3: Today button resets to current week */}
                <button onClick={() => setWeekOffset(0)} className="px-3 py-1 border border-gray-200 rounded-md text-[12px] font-medium text-gray-700 hover:bg-gray-50 h-[30px]">Today</button>
                <div className="flex border border-gray-200 rounded-md">
                  {/* CF-D02c FIX 3: Prev/Next week navigation */}
                  <button onClick={() => setWeekOffset(prev => prev - 1)} className="w-7 h-7 flex items-center justify-center border-r border-gray-200 hover:bg-gray-50 text-gray-600"><ChevronLeft size={16} /></button>
                  <button onClick={() => setWeekOffset(prev => prev + 1)} className="w-7 h-7 flex items-center justify-center hover:bg-gray-50 text-gray-600"><ChevronRight size={16} /></button>
                </div>
              </div>
            </div>
            {/* ROW 2 */}
            <div className="flex items-center justify-between px-5 pt-2">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-medium hover:bg-blue-100 transition-colors">
                  🏏 Cricket <Check size={12} strokeWidth={3} />
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-[11px] font-medium hover:bg-green-100 transition-colors">
                  ⚽ Football <Check size={12} strokeWidth={3} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-blue-500" /><span className="text-[10px] text-gray-500">1-on-1</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-purple-600" /><span className="text-[10px] text-gray-500">Programme</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-amber-400" /><span className="text-[10px] text-gray-500">Pending</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-gray-300" /><span className="text-[10px] text-gray-500">Blocked</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-teal-500" /><span className="text-[10px] text-gray-500">Ad hoc</span></div>
              </div>
            </div>
          </div>

          {/* Week Grid */}
          <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-white shadow-sm relative h-[700px] shrink-0">
            {/* CD-12: Loading state */}
            {loading && (
              <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
                  <p className="text-[14px] text-gray-500">Loading schedule...</p>
                </div>
              </div>
            )}
            
            {/* CD-12: Error state */}
            {error && !loading && (
              <div className="absolute inset-0 bg-white z-50 flex items-center justify-center">
                <div className="flex flex-col items-center text-center px-4">
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">⚠</span>
                  </div>
                  <h3 className="text-[18px] font-bold text-gray-900 mb-2">Failed to load schedule</h3>
                  <p className="text-[14px] text-gray-500 mb-6">{error}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}
            {/* CHANGE 2: Today column treatment */}
            <div className="flex border-b border-gray-200 bg-gray-50/50 relative z-20">
              <div className="w-16 shrink-0 border-r border-gray-200" />
              {days.map((day, idx) => (
                <div key={idx} className={`flex-1 py-3 text-center border-r last:border-r-0 border-gray-200 ${day.isToday ? 'bg-[#EFF7FF]' : ''}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${day.isToday ? 'text-[#0077CC]' : 'text-gray-500'}`}>{day.name}</div>
                  {day.isToday ? (
                    <div className="flex justify-center mt-1">
                      <div className="w-7 h-7 rounded-full bg-[#0077CC] text-white flex items-center justify-center text-[14px] font-medium">{day.date}</div>
                    </div>
                  ) : (
                    <div className="text-[20px] font-light leading-tight mt-1 text-gray-900">{day.date}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto relative scroll-smooth" ref={gridRef}>
              <div className="relative w-full" style={{ height: `${hours.length * 64}px` }}>
                {/* CF-D02d BUG FIX 2: Make empty cells clickable */}
                <div className="absolute inset-0 flex flex-col pointer-events-auto z-0">
                  {hours.map((hour, hourIdx) => (
                    <div key={hour} className="h-[64px] border-b border-gray-100 flex w-full">
                      <div className="w-16 shrink-0 border-r border-gray-200 flex items-start justify-end pr-2 pt-1 relative pointer-events-none">
                        <span className="text-[12px] text-gray-400 font-medium bg-white">{hour.toString().padStart(2, '0')}:00</span>
                      </div>
                      {days.map((day, idx) => {
                        const timeStr = `${hour.toString().padStart(2, '0')}:00`
                        // Fix-26: Dynamic date string with month
                        const dateStr = `${day.name} ${day.date} ${day.fullDate.toLocaleDateString('en-GB', { month: 'short' })}`
                        return (
                          <div 
                            key={idx} 
                            className={`flex-1 border-r last:border-r-0 border-gray-100 cursor-pointer transition-colors hover:bg-[rgba(0,119,204,0.03)] ${day.isToday ? 'bg-[#EFF7FF]' : ''}`}
                            onClick={(e) => handleSlotClick(e, dateStr, timeStr)}
                          />
                        )
                      })}
                    </div>
                  ))}
                </div>

                {/* CD-12: Real availability blocks */}
                <div className="absolute inset-0 flex pointer-events-auto z-10">
                  <div className="w-16 shrink-0" />
                  {days.map((day, dayIdx) => {
                    // Filter availability for this day
                    const dayBlocks = availability.filter(block => 
                      block.is_active && block.day_of_week === day.dayOfWeek
                    )
                    
                    return (
                      <div key={dayIdx} className="flex-1 relative border-r border-transparent">
                        {dayBlocks.map((block) => {
                          const topPosition = timeToPosition(block.start_time) * 64
                          const duration = calculateDuration(block.start_time, block.end_time)
                          const heightPx = duration * 64
                          const timeStr = block.start_time.substring(0, 5)
                          // Fix-26: Dynamic date string with month
                          const dateStr = `${day.name} ${day.date} ${day.fullDate.toLocaleDateString('en-GB', { month: 'short' })}`
                          
                          const blockType = block.is_recurring === false ? 'adhoc' : 'available'
                          const blockTitle = block.is_recurring === false
                            ? (block.sport_name ? `Ad hoc · ${block.sport_name}` : 'Ad hoc slot')
                            : 'Available'
                          const blockSubtitle = block.is_recurring === false
                            ? (block.venue_name ?? undefined)
                            : undefined

                          return (
                            <EventBlock
                              key={block.id}
                              top={topPosition}
                              height={heightPx}
                              type={blockType}
                              title={blockTitle}
                              subtitle={blockSubtitle}
                              sessionId={`slot-${day.name.toLowerCase()}-${block.id}`}
                              onCardClick={(e) => handleSlotClick(e, dateStr, timeStr)}
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
                
                {/* CD-12b: Real booking blocks */}
                <div className="absolute inset-0 flex pointer-events-auto z-[15]">
                  <div className="w-16 shrink-0" />
                  {days.map((day, dayIdx) => {
                    const isoDate = day.fullDate.toISOString().slice(0, 10)
                    const dayBookings = bookings.filter((b) => b.session_date === isoDate)
                    return (
                      <div key={dayIdx} className="flex-1 relative border-r border-transparent">
                        {dayBookings.map((booking) => {
                          const topPosition = timeToPosition(booking.session_start_time) * 64
                          const heightPx = calculateDuration(booking.session_start_time, booking.session_end_time) * 64
                          const title = booking.child_name ?? booking.booked_by_name ?? booking.booking_reference
                          const subtitle = `${booking.session_start_time.slice(0, 5)} · ${booking.session_type === 'group' ? 'Group' : '1-on-1'}`
                          const blockType: EventBlockProps['type'] =
                            booking.status === 'pending_approval' ? 'pending' : 'confirmed'
                          return (
                            <EventBlock
                              key={booking.id}
                              top={topPosition}
                              height={heightPx}
                              type={blockType}
                              title={title}
                              subtitle={subtitle}
                              sessionId={booking.id}
                              onCardClick={handleCardClick}
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                {/* CD-12: Empty state */}
                {!loading && !error && availability.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center z-20">
                    <div className="text-center px-4">
                      <div className="w-16 h-16 bg-[#F0F7FF] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Calendar size={32} className="text-[#0077CC]" />
                      </div>
                      <h3 className="text-[18px] font-bold text-gray-900 mb-2">No availability set</h3>
                      <p className="text-[14px] text-gray-500 mb-6 max-w-sm">
                        Add your weekly availability to show when you're free for sessions.
                      </p>
                      <button 
                        onClick={() => router.push('/coach/availability')}
                        className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
                      >
                        Set Availability
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-20 rounded-b-xl" />
          </div>
          
          {/* CF-02a: FAB opens add modal */}
          <button
            onClick={() => { setAdHocStep('menu'); setAdHocError(null); setIsAddModalOpen(true) }}
            className="self-end mt-3 mb-2 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full px-[18px] py-2 flex items-center gap-2 transition-colors text-[13px] font-medium"
            style={{ boxShadow: '0 2px 8px rgba(0,119,204,0.20)' }}
          >
            <Plus size={14} />
            <span>Add to schedule</span>
          </button>
        </div>

        {/* CF-D02c FIX 1: Single popover rendering */}
        {activePopover?.type === 'session' && (
          <SessionPopover
            x={activePopover.x}
            y={activePopover.y}
            sessionId={activePopover.sessionId}
            type={activePopover.sessionType}
            booking={bookings.find((b) => b.id === activePopover.sessionId) ?? null}
            onClose={() => setActivePopover(null)}
            onRefresh={() => { setActivePopover(null); setRefreshKey((k) => k + 1) }}
          />
        )}
        {activePopover?.type === 'creation' && (
          <CreationPopover 
            x={activePopover.x} 
            y={activePopover.y} 
            source={activePopover.source}
            date={activePopover.date} 
            time={activePopover.time} 
            onClose={() => setActivePopover(null)} 
          />
        )}
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-end sm:items-center justify-center" onClick={() => { setIsAddModalOpen(false); setAdHocStep('menu'); setAdHocVenueName(''); setAdHocVenueAddress(''); setVenueKey(k => k + 1); setAdHocPrice(''); setAdHocError(null) }}>
          <div className="bg-white w-full max-w-[420px] rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">

              {adHocStep === 'menu' && (
                <>
                  <h3 className="text-[20px] font-bold text-gray-900 mb-6">What would you like to add?</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setAdHocStep('form')}
                      className="w-full flex items-center text-left p-4 rounded-xl border border-gray-100 hover:border-[#0077CC] hover:bg-[#EFF6FF] transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mr-4 shrink-0 text-gray-600 transition-colors group-hover:bg-white group-hover:text-[#0077CC]"><User size={20} /></div>
                      <div>
                        <div className="text-[15px] font-bold text-gray-900">Ad hoc slot</div>
                        <div className="text-[13px] text-gray-500 mt-0.5">One-off availability on a specific date</div>
                      </div>
                    </button>

                    <button disabled className="w-full flex items-center text-left p-4 rounded-xl border border-gray-100 opacity-50 cursor-not-allowed">
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mr-4 shrink-0 text-gray-600"><RefreshCw size={20} /></div>
                      <div>
                        <div className="text-[15px] font-bold text-gray-900">Recurring session <span className="text-[11px] font-normal text-gray-400 ml-1">Coming soon</span></div>
                        <div className="text-[13px] text-gray-500 mt-0.5">Repeats weekly or custom schedule</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setIsAddModalOpen(false); setAdHocStep('menu'); router.push('/coach/programmes/new') }}
                      className="w-full flex items-center text-left p-4 rounded-xl border border-gray-100 hover:border-[#0077CC] hover:bg-[#EFF6FF] transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mr-4 shrink-0 text-gray-600 transition-colors group-hover:bg-white group-hover:text-[#0077CC]"><Users size={20} /></div>
                      <div>
                        <div className="text-[15px] font-bold text-gray-900">New programme</div>
                        <div className="text-[13px] text-gray-500 mt-0.5">Group sessions with fixed spots</div>
                      </div>
                    </button>

                    <button
                      onClick={() => { setIsAddModalOpen(false); setAdHocStep('menu'); router.push('/coach/availability') }}
                      className="w-full flex items-center text-left p-4 rounded-xl border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mr-4 shrink-0 text-gray-600 group-hover:bg-white"><Ban size={20} /></div>
                      <div>
                        <div className="text-[15px] font-bold text-gray-900">Block time</div>
                        <div className="text-[13px] text-gray-500 mt-0.5">Mark time as unavailable</div>
                      </div>
                    </button>
                  </div>
                  <button onClick={() => setIsAddModalOpen(false)} className="w-full mt-6 py-2 text-center text-[15px] font-medium text-gray-500 hover:text-gray-900 transition-colors">
                    Cancel
                  </button>
                </>
              )}

              {adHocStep === 'form' && (
                <>
                  <div className="flex items-center gap-2 mb-5">
                    <button onClick={() => { setAdHocStep('menu'); setAdHocError(null) }} className="text-gray-400 hover:text-gray-700">
                      <ChevronLeft size={20} />
                    </button>
                    <h3 className="text-[20px] font-bold text-gray-900">Ad hoc slot</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-medium text-gray-700 mb-1">Date</label>
                      <input
                        type="date"
                        value={adHocDate}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={e => setAdHocDate(e.target.value)}
                        className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0077CC]"
                      />
                    </div>

                    {sports.length > 0 && (
                      <div>
                        <label className="block text-[12px] font-medium text-gray-700 mb-1">Sport</label>
                        <select
                          value={adHocSportId}
                          onChange={e => setAdHocSportId(e.target.value)}
                          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0077CC]"
                        >
                          {sports.map(s => (
                            <option key={s.sport_id} value={s.sport_id}>{s.sport_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-[12px] font-medium text-gray-700 mb-1">Venue <span className="text-gray-400 font-normal">(optional)</span></label>
                      <VenueAutocomplete
                        key={venueKey}
                        value={adHocVenueName}
                        placeholder="Search for a venue or sports centre"
                        onSelect={(v: VenueSelection) => {
                          setAdHocVenueName(v.name)
                          setAdHocVenueAddress(v.address)
                        }}
                        onChange={(val) => setAdHocVenueName(val)}
                      />
                      {adHocVenueName && (
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-[11px] text-gray-500 truncate">
                            {adHocVenueAddress || adHocVenueName}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setAdHocVenueName('')
                              setAdHocVenueAddress('')
                              setVenueKey(k => k + 1)
                            }}
                            className="ml-2 text-gray-400 hover:text-gray-600 text-[13px] shrink-0"
                          >×</button>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="block text-[12px] font-medium text-gray-700 mb-1">Start</label>
                        <input
                          type="time"
                          value={adHocStartTime}
                          onChange={e => setAdHocStartTime(e.target.value)}
                          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0077CC]"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[12px] font-medium text-gray-700 mb-1">End</label>
                        <input
                          type="time"
                          value={adHocEndTime}
                          onChange={e => setAdHocEndTime(e.target.value)}
                          className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0077CC]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input
                        type="text"
                        value={adHocNotes}
                        onChange={e => setAdHocNotes(e.target.value)}
                        placeholder="e.g. Available at Oval ground only"
                        className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#0077CC]"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-gray-700 mb-1">Price <span className="text-gray-400 font-normal">(optional)</span></label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[13px]">£</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="e.g. 35"
                          value={adHocPrice}
                          onChange={e => setAdHocPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                          className="w-full text-[13px] border border-gray-200 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:border-[#0077CC]"
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">Leave blank to use your default price for this sport</p>
                    </div>

                    {adHocError && (
                      <p className="text-[12px] text-red-600">{adHocError}</p>
                    )}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => { setAdHocStep('menu'); setAdHocError(null) }}
                      className="flex-1 py-2.5 border border-gray-200 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={submitAdHoc}
                      disabled={adHocSubmitting}
                      className="flex-1 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-xl text-[14px] font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {adHocSubmitting ? <RefreshCw size={14} className="animate-spin" /> : null}
                      Add slot
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// CF-D02b CHANGE 1: Session Popover Component (4 types)
function SessionPopover({
  x, y, sessionId, type, booking, onClose, onRefresh,
}: {
  x: number
  y: number
  sessionId: string
  type: string
  booking: BookingBlock | null
  onClose: () => void
  onRefresh: () => void
}) {
  const [actionLoading, setActionLoading] = useState<'approve' | 'decline' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleStatusAction = async (action: 'approve' | 'decline') => {
    setActionLoading(action)
    setActionError(null)
    try {
      const res = await fetch(`/api/coaches/bookings/${sessionId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setActionError(data.error ?? 'Something went wrong')
        return
      }
      onRefresh()
    } catch {
      setActionError('Network error — please try again')
    } finally {
      setActionLoading(null)
    }
  }

  const getPopoverContent = () => {
    switch (type) {
      case 'confirmed':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">James Okafor</h3>
              <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[11px] font-medium">Confirmed</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>Mon 7 Apr · 09:00 – 10:00</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <User size={14} />
                <span>Cricket · 1-on-1</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <MapPin size={14} />
                <span>Oval Cricket Ground</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-900 font-medium">
                <PoundSterling size={14} />
                <span>£45.00 (you receive)</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire View booking popover action */}} className="flex-1 bg-[#0077CC] text-white rounded-lg py-2 text-[13px] font-medium hover:bg-[#0066AA]">View booking →</button>
              <button onClick={() => {/* TODO CF-D02b: wire Message popover action */}} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg py-2 text-[13px] font-medium hover:bg-gray-50">Message</button>
            </div>
          </>
        )
      
      case 'programme':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">{sessionId === 'session-2' ? 'Junior Cricket Foundations' : 'Open Net Session'}</h3>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[11px] font-medium">Active</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>{sessionId === 'session-2' ? 'Mon 7 Apr · 14:00 – 15:30' : 'Sun 12 Apr · 10:00 – 11:30'}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <User size={14} />
                <span>Cricket · Group</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Users size={14} />
                <span>{sessionId === 'session-2' ? '4 / 6 spots filled' : '2 / 8 spots filled'}</span>
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: sessionId === 'session-2' ? '66.67%' : '25%' }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire View programme popover action */}} className="flex-1 bg-purple-600 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-purple-700">View prog. →</button>
              <button onClick={() => {/* TODO CF-D02b: wire Message popover action */}} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg py-2 text-[13px] font-medium hover:bg-gray-50">Message</button>
            </div>
          </>
        )
      
      case 'pending': {
        const clientName = booking?.child_name ?? booking?.booked_by_name ?? '—'
        const dateLabel = booking
          ? (() => {
              const d = new Date(booking.session_date + 'T00:00:00')
              const dayStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
              return `${dayStr} · ${booking.session_start_time.slice(0, 5)} – ${booking.session_end_time.slice(0, 5)}`
            })()
          : '—'
        const typeLabel = booking?.session_type === 'group' ? 'Group' : '1-on-1'
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">{clientName}</h3>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[11px] font-medium">Awaiting approval</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>{dateLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <User size={14} />
                <span>{typeLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-amber-700 font-medium">
                <AlertCircle size={14} className="text-amber-500" />
                <span>Respond within 24 hours</span>
              </div>
            </div>
            {actionError && (
              <p className="text-[12px] text-red-600 mb-2">{actionError}</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleStatusAction('approve')}
                disabled={actionLoading !== null}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-green-700 flex items-center justify-center gap-1 disabled:opacity-60"
              >
                {actionLoading === 'approve' ? <RefreshCw size={13} className="animate-spin" /> : <Check size={14} />}
                Approve
              </button>
              <button
                onClick={() => handleStatusAction('decline')}
                disabled={actionLoading !== null}
                className="flex-1 bg-white border border-red-200 text-red-600 rounded-lg py-2 text-[13px] font-medium hover:bg-red-50 flex items-center justify-center gap-1 disabled:opacity-60"
              >
                {actionLoading === 'decline' ? <RefreshCw size={13} className="animate-spin" /> : <X size={14} />}
                Decline
              </button>
            </div>
          </>
        )
      }
      
      case 'blocked':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">Blocked — Family Holiday</h3>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium">Blocked</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>Sat 11 Apr · 08:00 – 13:00</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-500">
                <Info size={14} />
                <span>You are unavailable during this time</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire Edit block action */}} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg py-2 text-[13px] font-medium hover:bg-gray-50">Edit block</button>
              <button onClick={() => {/* TODO CF-D02b: wire Remove block action */}} className="flex-1 bg-white border border-red-200 text-red-600 rounded-lg py-2 text-[13px] font-medium hover:bg-red-50">Remove</button>
            </div>
          </>
        )
      
      default:
        return null
    }
  }

  return (
    <div 
      className="session-popover bg-white rounded-xl border border-gray-100 p-4 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ 
        position: 'fixed',
        left: `${x}px`, 
        top: `${y}px`,
        zIndex: 9999,
        width: '300px',
        maxWidth: '300px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
      }}
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
        <X size={14} />
      </button>
      {getPopoverContent()}
    </div>
  )
}

// CF-D02b CHANGE 2: Creation Popover Component
// CF-D02d BUG FIX 3: Add source prop to make date editable when triggered from button
function CreationPopover({ x, y, source, date, time, onClose }: { x: number; y: number; source: 'slot' | 'button'; date: string; time: string; onClose: () => void }) {
  const [sessionType, setSessionType] = useState<'1-on-1' | 'Group'>('1-on-1')
  const [startTime, setStartTime] = useState(time)
  const [endTime, setEndTime] = useState(() => {
    const [hours, mins] = time.split(':').map(Number)
    const endHour = (hours + 1).toString().padStart(2, '0')
    return `${endHour}:${mins.toString().padStart(2, '0')}`
  })

  const timeOptions = Array.from({ length: 17 }, (_, i) => {
    const hour = (i + 6).toString().padStart(2, '0')
    return [`${hour}:00`, `${hour}:30`]
  }).flat()

  return (
    <div 
      className="session-popover bg-white rounded-xl border border-gray-100 p-4 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ 
        position: 'fixed',
        left: `${x}px`, 
        top: `${y}px`,
        zIndex: 9999,
        width: '380px',
        maxWidth: '380px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
      }}
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
        <X size={14} />
      </button>
      
      <h3 className="text-[14px] font-medium text-gray-900 mb-3">New session</h3>
      
      <div className="space-y-2.5">
        <input 
          type="text" 
          placeholder="Session title or player name"
          className="w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-brand-600"
        />
        
        <div className="flex gap-2">
          {/* CF-D02e BUG FIX 3: Native date input when triggered from button, read-only text when from slot */}
          {source === 'button' ? (
            <input
              type="date"
              defaultValue={new Date().toISOString().split('T')[0]}
              min={new Date().toISOString().split('T')[0]}
              className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-600"
            />
          ) : (
            <div className="text-[13px] text-gray-600 py-2">{date}</div>
          )}
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-600">
            {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-600">
            {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        
        <select className="w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-brand-600">
          <option>Cricket</option>
          <option>Football</option>
          <option>Tennis</option>
          <option>Swimming</option>
          <option>Basketball</option>
          <option>Other</option>
        </select>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setSessionType('1-on-1')}
            className={`flex-1 py-1.5 px-3 rounded-md text-[12px] font-medium transition-colors ${
              sessionType === '1-on-1' 
                ? 'bg-[#0077CC] text-white' 
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            1-on-1
          </button>
          <button 
            onClick={() => setSessionType('Group')}
            className={`flex-1 py-1.5 px-3 rounded-md text-[12px] font-medium transition-colors ${
              sessionType === 'Group' 
                ? 'bg-[#0077CC] text-white' 
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Group
          </button>
        </div>
        
        <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <PoundSterling size={12} />
          <span>45.00 (you receive)</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => {/* TODO CF-D02b: wire Cancel to dismiss popover */onClose()}} className="text-[12px] text-gray-500 hover:text-gray-900">
          Cancel
        </button>
        <button onClick={() => {/* TODO CF-D02b: wire Create session to booking/session creation API */}} className="bg-[#0077CC] text-white rounded-lg px-4 py-1.5 text-[13px] font-medium hover:bg-[#0066AA]">
          Create →
        </button>
      </div>
    </div>
  )
}
