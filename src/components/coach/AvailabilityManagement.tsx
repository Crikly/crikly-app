'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, ChevronLeft, ChevronRight, Plus, ChevronDown, AlertTriangle } from 'lucide-react'
import { VenueAutocomplete, type VenueSelection } from '@/components/coach/shared/LocationAutocomplete'
// AF-H-41: pull configured sports from cached helper so new coaches can pick a sport
import { fetchCoachSportsCached } from '@/lib/onboarding-cache'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAY_FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
// AF-M-Wave-1: REPEAT_OPTIONS array removed — only 'Weekly' is persisted by the API; the buttons are now rendered explicitly with the other cadences disabled

const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

// CD-04: API response types
interface AvailabilityBlock {
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
  coach_venue_id: string | null
  venue_name: string | null
  venue_address: string | null
  is_recurring: boolean
  specific_date: string | null
  created_at: string
}

// CD-04: UI display type (transformed from API)
interface ScheduleBlock {
  id: string
  day: string
  sport: string
  time: string
  location: string
  price: string
  is_recurring: boolean
  specific_date: string | null
  rawData: AvailabilityBlock
}

// CD-05: Blocked dates API response type
interface BlockedDateResponse {
  id: string
  blocked_date: string
  blocked_date_end: string | null
  label: string | null
  reason: string | null
  is_range: boolean
  days_blocked: number
  created_at: string
}

// CD-05: UI display type for blocked dates
interface BlockedRange { 
  id: string
  start: Date
  end: Date
  label: string
  rawData: BlockedDateResponse
}

interface CalDay { date: Date; type: 'prev' | 'current' | 'next' }

function dateOnly(d: Date): number { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function sameDay(a: Date, b: Date): boolean { return dateOnly(a) === dateOnly(b) }
function inRange(d: Date, start: Date, end: Date): boolean { const dn = dateOnly(d); return dn >= dateOnly(start) && dn <= dateOnly(end) }
function daysBetween(a: Date, b: Date): number { return Math.round((dateOnly(b) - dateOnly(a)) / 86_400_000) + 1 }
function fmt(d: Date): string { return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}` }

function buildCalendar(year: number, month: number): CalDay[] {
  const firstDow = new Date(year, month, 1).getDay()
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const prevM = month === 0 ? 11 : month - 1
  const prevY = month === 0 ? year - 1 : year
  const nextM = month === 11 ? 0 : month + 1
  const nextY = month === 11 ? year + 1 : year
  const days: CalDay[] = []
  for (let i = leadingBlanks - 1; i >= 0; i--) days.push({ date: new Date(prevY, prevM, daysInPrev - i), type: 'prev' })
  for (let i = 1; i <= daysInMonth; i++) days.push({ date: new Date(year, month, i), type: 'current' })
  const rem = 42 - days.length
  for (let i = 1; i <= rem; i++) days.push({ date: new Date(nextY, nextM, i), type: 'next' })
  return days
}

// CD-04: Day mapping helper
const DAY_MAP: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat'
}

function formatAdHocDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function AvailabilityManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'schedule' | 'blocked'>('schedule')
  const addFormRef = useRef<HTMLDivElement>(null)
  
  // CD-04: Real data state
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  // AF-H-41: configured-sports list, drives dropdown and provides sport_id for POST/PATCH
  const [allSports, setAllSports] = useState<{ sport_id: string; sport_name: string }[]>([])
  // Fix-69-2: inline confirmation + error for availability block delete
  const [deleteBlockConfirmId, setDeleteBlockConfirmId] = useState<string | null>(null)
  const [blockDeleteError, setBlockDeleteError] = useState<string | null>(null)
  const [addBlockError, setAddBlockError] = useState<string | null>(null)
  const [blockDatesError, setBlockDatesError] = useState<string | null>(null)

  // CD-05: Blocked dates real data state
  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([])
  const [blockedLoading, setBlockedLoading] = useState(false)
  const [blockedError, setBlockedError] = useState<string | null>(null)
  const [deletingBlocked, setDeletingBlocked] = useState<string | null>(null)
  // Fix-69-2: inline confirmation + error for blocked date remove
  const [removeBlockedConfirmId, setRemoveBlockedConfirmId] = useState<string | null>(null)
  const [blockedActionError, setBlockedActionError] = useState<string | null>(null)
  // AF-H-41: use coach's configured sports — was derived from existing scheduleBlocks
  // (empty for new coaches), preventing them adding their first block.
  const availableSports = useMemo(() => allSports.map(s => s.sport_name), [allSports])
  const [showAddForm, setShowAddForm] = useState(false)
  // CF-D06b FIX 1: Add preselectedDay state
  const [preselectedDay, setPreselectedDay] = useState<string | null>(null)
  const [formSport, setFormSport] = useState(availableSports[0] ?? '')
  const [formDays, setFormDays] = useState<string[]>([])
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('10:00')
  const [formRepeat, setFormRepeat] = useState('Weekly')
  // Fix-93: snapshot venue model (venue_name + venue_address text on the block)
  const [formVenueName, setFormVenueName] = useState<string>('')
  const [formVenueAddress, setFormVenueAddress] = useState<string>('')
  const [formPrice, setFormPrice] = useState('')
  // Fix-93: edit mode — when set, save uses PATCH against this block id; null = add mode
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  // Fix-93: in edit mode, day selection is single-pick (clicking a different day MOVES the block)
  const toggleDay = (day: string) => {
    if (editingBlockId) {
      setFormDays([day])
      return
    }
    setFormDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }
  
  // CD-04: Fetch availability data on mount
  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        setLoading(true)
        setError(null)

        const availRes = await fetch('/api/coaches/availability')

        if (!availRes.ok) throw new Error('Failed to fetch availability')

        const data = await availRes.json()

        // Transform API data to UI format — filter out ad hoc (is_recurring=false) slots
        const transformed: ScheduleBlock[] = (data.availability || [])
          .filter((block: AvailabilityBlock) => block.is_recurring !== false)
          .map((block: AvailabilityBlock) => {
          const priceDisplay = block.price_override_pence
            ? `£${(block.price_override_pence / 100).toFixed(0)}/${block.session_type_name || '60min'}`
            : 'Default price'

          return {
            id: block.id,
            day: DAY_MAP[block.day_of_week] || 'Mon',
            sport: block.sport_name || 'Sport',
            time: `${block.start_time.substring(0, 5)} – ${block.end_time.substring(0, 5)}`,
            location: block.venue_name ?? 'No venue set',
            price: priceDisplay,
            is_recurring: block.is_recurring,
            specific_date: block.specific_date ?? null,
            rawData: block
          }
        })

        setScheduleBlocks(transformed)
      } catch (err) {
        console.error('Error fetching availability:', err)
        setError('Failed to load availability. Please refresh the page.')
      } finally {
        setLoading(false)
      }
    }

    fetchAvailability()
  }, [])

  // AF-H-41: fetch coach's configured sports once on mount
  useEffect(() => {
    fetchCoachSportsCached()
      .then((data: { sports?: { sport_id: string; sport_name: string }[] }) => {
        setAllSports(data?.sports ?? [])
      })
      .catch(() => {
        // Non-critical — dropdown stays empty; coach sees the existing
        // "configure a sport in onboarding first" flow.
      })
  }, [])

  // AF-H-41: once sports load, sync formSport so POST sends a real sport_id
  // (useState only takes initial value on mount; without this, a stale empty
  // string defeats the lookup below).
  useEffect(() => {
    if (!formSport && availableSports.length > 0) setFormSport(availableSports[0])
  }, [availableSports, formSport])

  // CF-D06b FIX 2: Replace same-day check with time overlap validation
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  
  const conflict = useMemo(() => {
    for (const day of formDays) {
      // Fix-93: in edit mode, exclude the block being edited from conflict detection
      const existingBlocks = scheduleBlocks.filter(b => b.day === day && b.id !== editingBlockId)
      for (const existing of existingBlocks) {
        // Parse existing time range (format: "09:00 – 12:00")
        const [existStartStr, existEndStr] = existing.time.split(' – ')
        const existStart = timeToMinutes(existStartStr)
        const existEnd = timeToMinutes(existEndStr)
        const newStart = timeToMinutes(formStartTime)
        const newEnd = timeToMinutes(formEndTime)

        // Check for overlap: newStart < existEnd AND newEnd > existStart
        if (newStart < existEnd && newEnd > existStart) {
          return { day, block: existing, message: 'This slot overlaps with an existing block. Choose a different time.' }
        }
      }
    }
    return null
  }, [formSport, formDays, formStartTime, formEndTime, scheduleBlocks, editingBlockId])

  const resetForm = () => {
    setFormSport(availableSports[0] ?? '')
    setFormDays([])
    setFormStartTime('09:00')
    setFormEndTime('10:00')
    setFormRepeat('Weekly')
    setFormVenueName('')
    setFormVenueAddress('')
    setFormPrice('')
    setEditingBlockId(null)
    setShowAddForm(false)
    setPreselectedDay(null) // CF-D06b FIX 1: Reset preselected day
  }

  // Fix-93: shared transform + refresh helper used by both POST (add) and PATCH (edit)
  const refreshAvailability = async () => {
    const refreshResponse = await fetch('/api/coaches/availability')
    if (!refreshResponse.ok) return
    const data = await refreshResponse.json()
    const transformed: ScheduleBlock[] = (data.availability || [])
      .filter((block: AvailabilityBlock) => block.is_recurring !== false)
      .map((block: AvailabilityBlock) => {
        const priceDisplay = block.price_override_pence
          ? `£${(block.price_override_pence / 100).toFixed(0)}/${block.session_type_name || '60min'}`
          : 'Default price'
        return {
          id: block.id,
          day: DAY_MAP[block.day_of_week] || 'Mon',
          sport: block.sport_name || 'Sport',
          time: `${block.start_time.substring(0, 5)} – ${block.end_time.substring(0, 5)}`,
          location: block.venue_name ?? 'No venue set',
          price: priceDisplay,
          is_recurring: block.is_recurring,
          specific_date: block.specific_date ?? null,
          rawData: block,
        }
      })
    setScheduleBlocks(transformed)
  }

  // Fix-107: extracted save handler — shared by inline save button and sticky bar
  const handleSaveBlock = async () => {
    // AF-H-46/wave-5: clear any prior error before re-attempting
    setAddBlockError(null)
    if (conflict) return
    // AF-H-46: was a silent return — coach got no feedback when no days selected
    if (formDays.length === 0) {
      setAddBlockError('Please select at least one day before saving.')
      return
    }

    const dayMap: Record<string, number> = {
      'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6,
    }

    try {
      if (editingBlockId) {
        // Edit: PATCH the single block
        const response = await fetch(`/api/coaches/availability/${editingBlockId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // AF-H-41: send real sport_id (was omitted — only worked because server preserved existing on undefined)
            sport_id: allSports.find(s => s.sport_name === formSport)?.sport_id ?? null,
            day_of_week: dayMap[formDays[0]],
            start_time: formStartTime,
            end_time: formEndTime,
            price_override_pence: formPrice ? Math.round(parseFloat(formPrice) * 100) : null,
            venue_name: formVenueName.trim() || null,
            venue_address: formVenueAddress.trim() || null,
          }),
        })
        if (!response.ok) throw new Error('Failed to update availability block')
      } else {
        // AF-H-41 + AF-H-47: parallel POSTs with per-day result tracking.
        // Was: sequential await, throw on first failure → days 1..n already
        // inserted with no rollback and a generic error.
        const sportId = allSports.find(s => s.sport_name === formSport)?.sport_id ?? null
        const dayResults = await Promise.all(
          formDays.map(async (dayAbbr) => {
            try {
              const response = await fetch('/api/coaches/availability', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sport_id: sportId,
                  day_of_week: dayMap[dayAbbr],
                  start_time: formStartTime,
                  end_time: formEndTime,
                  price_override_pence: formPrice ? Math.round(parseFloat(formPrice) * 100) : null,
                  venue_name: formVenueName.trim() || null,
                  venue_address: formVenueAddress.trim() || null,
                }),
              })
              return { day: dayAbbr, ok: response.ok }
            } catch {
              return { day: dayAbbr, ok: false }
            }
          })
        )

        const failed = dayResults.filter(r => !r.ok)
        if (failed.length > 0) {
          const failedDays = failed.map(r => DAY_FULL[r.day] ?? r.day).join(', ')
          setAddBlockError(
            failed.length === formDays.length
              ? 'Failed to save availability. Please try again.'
              : `Saved some days but failed on: ${failedDays}. Please try again for those days.`
          )
          // Refresh anyway — successful days should appear immediately.
          await refreshAvailability()
          return
        }
      }

      await refreshAvailability()
      resetForm()
    } catch (err) {
      console.error('Error saving block:', err)
      setAddBlockError(
        editingBlockId
          ? 'Failed to save changes. Please try again.'
          : 'Failed to add availability block. Please try again.'
      )
    }
  }

  // Fix-93: enter edit mode — populate form fields from the existing block
  const openEditForm = (block: ScheduleBlock) => {
    setEditingBlockId(block.id)
    setFormSport(block.sport)
    setFormDays([DAY_MAP[block.rawData.day_of_week] || 'Mon'])
    setFormStartTime(block.rawData.start_time.substring(0, 5))
    setFormEndTime(block.rawData.end_time.substring(0, 5))
    setFormVenueName(block.rawData.venue_name ?? '')
    // venue_address isn't in the list-summary AvailabilityBlock interface; load from rawData if present
    setFormVenueAddress(block.rawData.venue_address ?? '')
    setFormPrice(
      block.rawData.price_override_pence != null
        ? (block.rawData.price_override_pence / 100).toFixed(2)
        : ''
    )
    setFormRepeat('Weekly') // existing form sends nothing for repeat anyway; pre-existing gap
    setShowAddForm(true)
    setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }
  
  // CF-D06b FIX 1: Effect to preselect day when form opens
  React.useEffect(() => {
    if (showAddForm && preselectedDay && !formDays.includes(preselectedDay)) {
      setFormDays([preselectedDay])
    }
  }, [showAddForm, preselectedDay])
  
  // CD-05: Fetch blocked dates when switching to blocked tab
  useEffect(() => {
    if (activeTab === 'blocked') {
      const fetchBlockedDates = async () => {
        try {
          setBlockedLoading(true)
          setBlockedError(null)
          
          const response = await fetch('/api/coaches/blocked-dates')
          if (!response.ok) {
            throw new Error('Failed to fetch blocked dates')
          }
          
          const data = await response.json()
          
          // Transform API data to UI format
          const transformed: BlockedRange[] = (data.blocked_dates || []).map((block: BlockedDateResponse) => ({
            id: block.id,
            start: new Date(block.blocked_date),
            end: new Date(block.blocked_date_end || block.blocked_date),
            label: block.label || '',
            rawData: block
          }))
          
          setBlockedRanges(transformed)
        } catch (err) {
          console.error('Error fetching blocked dates:', err)
          setBlockedError('Failed to load blocked dates. Please refresh the page.')
        } finally {
          setBlockedLoading(false)
        }
      }
      
      fetchBlockedDates()
    }
  }, [activeTab])
  
  // Blocked dates calendar state
  // Fix-115: dynamic dates — was hardcoded to April 2026
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear())
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [blockLabel, setBlockLabel] = useState('')
  const calendarDays = useMemo(() => buildCalendar(currentYear, currentMonth), [currentYear, currentMonth])
  const TODAY = useMemo(() => new Date(), [])
  const navigatePrev = () => { if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11) } else setCurrentMonth(m => m - 1) }
  const navigateNext = () => { if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0) } else setCurrentMonth(m => m + 1) }
  const handleDayClick = (day: CalDay) => {
    if (day.type !== 'current') return
    const clicked = day.date
    if (!rangeStart || rangeEnd) { setRangeStart(clicked); setRangeEnd(null) }
    else { if (sameDay(clicked, rangeStart)) { setRangeEnd(clicked) } else if (dateOnly(clicked) > dateOnly(rangeStart)) { setRangeEnd(clicked) } else { setRangeStart(clicked); setRangeEnd(null) } }
  }
  const handleBlockDates = async () => {
    // CD-05: Wire to POST /api/coaches/blocked-dates
    if (!rangeStart) return
    setBlockDatesError(null)
    try {
      const end = rangeEnd ?? rangeStart
      
      // AF-H-45: format as local YYYY-MM-DD — was toISOString() which UTC-shifts
      // BST evenings to the previous calendar day.
      // (AF-H-45b follow-up: read-back at lines parsing block.blocked_date with
      // new Date() has the inverse UTC-parse problem; deferred.)
      const formatDate = (d: Date) => {
        const yr = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        return `${yr}-${mo}-${dy}`
      }
      
      const response = await fetch('/api/coaches/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocked_date: formatDate(rangeStart),
          blocked_date_end: sameDay(rangeStart, end) ? null : formatDate(end),
          label: blockLabel.trim() || null,
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to block dates')
      }
      
      // Refresh the list
      const refreshResponse = await fetch('/api/coaches/blocked-dates')
      if (refreshResponse.ok) {
        const data = await refreshResponse.json()
        const transformed: BlockedRange[] = (data.blocked_dates || []).map((block: BlockedDateResponse) => ({
          id: block.id,
          start: new Date(block.blocked_date),
          end: new Date(block.blocked_date_end || block.blocked_date),
          label: block.label || '',
          rawData: block
        }))
        setBlockedRanges(transformed)
      }
      
      setRangeStart(null)
      setRangeEnd(null)
      setBlockLabel('')
      setHoverDate(null)
    } catch (err) {
      console.error('Error blocking dates:', err)
      setBlockDatesError('Failed to block dates. Please try again.')
    }
  }
  const clearSelection = () => { setRangeStart(null); setRangeEnd(null); setBlockLabel(''); setHoverDate(null) }
  const previewEnd = (rangeStart && !rangeEnd && hoverDate && dateOnly(hoverDate) > dateOnly(rangeStart)) ? hoverDate : null
  const isSingleDay = !!(rangeStart && rangeEnd && sameDay(rangeStart, rangeEnd))

  return (
    <div className="min-h-full text-gray-900 flex flex-col items-center pt-8 pb-32">
      <div className="w-full max-w-[640px] px-6">
        <div className="mb-8">
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900 mb-2">Availability</h1>
          {/* CD-04: Real data-driven subtitle */}
          <p className="text-[13px] text-gray-500 mt-1">
            {loading ? 'Loading...' : scheduleBlocks.length === 0 ? 'No availability blocks yet' : `${scheduleBlocks.length} recurring ${scheduleBlocks.length === 1 ? 'block' : 'blocks'}`}
          </p>
        </div>
        <div className="flex border-b border-gray-100 mb-8">
          {(['schedule', 'blocked'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 mr-8 font-bold text-[16px] transition-colors border-b-2 capitalize ${activeTab === tab ? 'border-brand-600 text-brand-600' : 'border-transparent text-[#94A3B8] hover:text-gray-600'}`}>
              {tab === 'blocked' ? 'Blocked dates' : 'Schedule'}
            </button>
          ))}
        </div>

        {activeTab === 'schedule' && (
          <div className="flex flex-col pb-20">
            {/* CD-04: Error state */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-[14px] font-medium text-red-700">{error}</p>
              </div>
            )}
            {/* Fix-69-2: inline block delete error */}
            {blockDeleteError && (
              <div className="mb-4 flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-[13px] font-medium text-red-700">{blockDeleteError}</p>
                <button onClick={() => setBlockDeleteError(null)} className="ml-3 text-red-400 hover:text-red-600 transition-colors"><X size={14} /></button>
              </div>
            )}
            
            {/* CD-04: Loading state */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin mb-4"></div>
                <p className="text-[14px] text-gray-500">Loading availability...</p>
              </div>
            ) : (
              <>
            {/* CF-D06 CHANGE 2: Mon-Sun day structure */}
            <div className="flex flex-col gap-6 mb-6">
              {DAY_ABBR.map((dayAbbr) => {
                const dayFull = DAY_FULL[dayAbbr]
                // CF-D06b FIX 2: Get ALL blocks for this day (not just first one)
                const blocksForDay = scheduleBlocks.filter(b => b.day === dayAbbr)
                
                return (
                  <div key={dayAbbr}>
                    {/* Day heading */}
                    <h3 className="text-[12px] text-gray-400 uppercase tracking-wider mb-1.5">{dayFull}</h3>
                    
                    {blocksForDay.length > 0 ? (
                      // CF-D06 CHANGE 3: Existing block card(s)
                      // CF-D06b FIX 2: Show all blocks for this day stacked
                      <div className="flex flex-col gap-2">
                        {blocksForDay.map((blockForDay) => (
                          <div 
                            key={blockForDay.id}
                            className="rounded-xl cursor-pointer overflow-hidden"
                            style={{ 
                              background: '#FFFFFF',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                              transition: 'all 150ms ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                              e.currentTarget.style.transform = 'scale(1.005)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
                              e.currentTarget.style.transform = 'scale(1)'
                            }}
                          >
                            <div className="px-4 py-3 flex items-center gap-3">
                              {/* Day pill */}
                              <div className="w-[42px] h-[42px] bg-brand-50 rounded-[10px] flex items-center justify-center shrink-0">
                                <span className="text-brand-800 text-[11px] font-medium">{dayAbbr}</span>
                              </div>
                              
                              {/* Block content */}
                              <div className="flex-1 flex flex-col">
                                <div className="text-[13px] font-medium text-gray-900 flex items-center flex-wrap gap-1">
                                  {blockForDay.sport} · {blockForDay.time}
                                  {blockForDay.is_recurring === false && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">Ad hoc</span>
                                  )}
                                </div>
                                {blockForDay.is_recurring === false ? (
                                  <div className="text-[11px] text-gray-500">
                                    {blockForDay.specific_date ? formatAdHocDate(blockForDay.specific_date) : ''}
                                    {blockForDay.rawData.venue_name ? ` · ${blockForDay.rawData.venue_name}` : ''}
                                    {blockForDay.rawData.price_override_pence ? ` · £${(blockForDay.rawData.price_override_pence / 100).toFixed(0)}` : ''}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-gray-500">
                                    {blockForDay.location} · {blockForDay.price}
                                  </div>
                                )}
                              </div>
                              
                              {/* Edit/delete icons — Fix-69-2: inline confirmation */}
                              <div className="flex items-center gap-1 shrink-0">
                                {deleteBlockConfirmId === blockForDay.id ? (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDeleteBlockConfirmId(null)
                                      }}
                                      className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-md hover:bg-neutral-50 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      disabled={deleting === blockForDay.id}
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        setBlockDeleteError(null)
                                        try {
                                          setDeleting(blockForDay.id)
                                          const response = await fetch(`/api/coaches/availability/${blockForDay.id}`, { method: 'DELETE' })
                                          if (!response.ok) throw new Error('Failed to delete block')
                                          setScheduleBlocks(prev => prev.filter(b => b.id !== blockForDay.id))
                                          setDeleteBlockConfirmId(null)
                                        } catch (err) {
                                          console.error('Error deleting block:', err)
                                          setBlockDeleteError('Failed to delete block. Please try again.')
                                          setDeleteBlockConfirmId(null)
                                        } finally {
                                          setDeleting(null)
                                        }
                                      }}
                                      className="px-2 py-1 text-[11px] text-white bg-red-600 border border-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                                    >
                                      {deleting === blockForDay.id ? '…' : 'Delete'}
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openEditForm(blockForDay)
                                      }}
                                      className="w-7 h-7 flex items-center justify-center border-[0.5px] border-gray-100 bg-white rounded-md hover:bg-neutral-50 transition-colors"
                                    >
                                      <Pencil size={12} className="text-gray-400" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDeleteBlockConfirmId(blockForDay.id)
                                      }}
                                      disabled={!!deleting}
                                      className="w-7 h-7 flex items-center justify-center border-[0.5px] border-gray-100 bg-white rounded-md hover:bg-neutral-50 transition-colors disabled:opacity-50"
                                    >
                                      <X size={12} className="text-gray-400" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // CF-D06 CHANGE 4: Empty day card
                      <div 
                        className="rounded-xl cursor-pointer"
                        style={{ 
                          background: '#FFFFFF',
                          border: '1.5px dashed #B5D4F4',
                          transition: 'background 150ms ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F0F7FF'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#FFFFFF'
                        }}
                        onClick={() => {
                          // CF-D06b FIX 1: Preselect the clicked day
                          setPreselectedDay(dayAbbr)
                          setShowAddForm(true)
                          // CF-D06c: Auto-scroll to form
                          setTimeout(() => {
                            addFormRef.current?.scrollIntoView({ 
                              behavior: 'smooth', 
                              block: 'start' 
                            })
                          }, 50)
                        }}
                      >
                        <div className="px-4 py-3 flex items-center gap-3">
                          {/* Empty day pill */}
                          <div className="w-[42px] h-[42px] bg-neutral-50 rounded-[10px] flex items-center justify-center shrink-0">
                            <span className="text-brand-100 text-[11px] font-medium">{dayAbbr}</span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 flex flex-col">
                            <div className="text-[12px] font-medium text-brand-600">
                              + Add availability
                            </div>
                            <div className="text-[11px] text-brand-100">
                              No slots on {dayFull} yet
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* CF-D06 CHANGE 5: Refined add button */}
            {showAddForm ? (
              <div ref={addFormRef} className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm">
                <h3 className="text-[16px] font-bold text-gray-900 mb-5">
                  {editingBlockId ? 'Edit availability block' : 'New availability block'}
                </h3>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sport</label>
                  <div className="relative">
                    <select value={formSport} onChange={e => { setFormSport(e.target.value); setFormDays([]) }} className="w-full appearance-none bg-neutral-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-900 focus:outline-none focus:border-brand-600 pr-10">
                      {availableSports.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-[12px] text-gray-400 font-medium mt-1.5">Only sports you've already configured are shown</p>
                  {/* AF-H-Wave-5 addition: honest empty-state when coach hasn't configured any sport yet */}
                  {allSports.length === 0 && !loading && (
                    <p className="text-[12px] text-amber-700 mt-1">
                      No sports configured yet. Complete your profile setup to add a sport first.
                    </p>
                  )}
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_ABBR.map(day => (
                      <button key={day} type="button" onClick={() => toggleDay(day)} className={`px-3.5 py-2 rounded-lg text-[13px] font-bold transition-colors border ${formDays.includes(day) ? 'bg-brand-600 text-white border-brand-600' : 'bg-neutral-50 text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-100'}`}>{day}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[{ label: 'Start time', val: formStartTime, set: setFormStartTime }, { label: 'End time', val: formEndTime, set: setFormEndTime }].map(({ label, val, set }) => (
                    <div key={label}>
                      <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">{label}</label>
                      <div className="relative">
                        <select value={val} onChange={e => set(e.target.value)} className="w-full appearance-none bg-neutral-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-900 focus:outline-none focus:border-brand-600 pr-10">
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Repeat</label>
                  <div className="flex flex-wrap gap-2">
                    {/* AF-M-Wave-1: only Weekly is persisted by the API; other cadences are coming soon */}
                    <button
                      type="button"
                      onClick={() => setFormRepeat('Weekly')}
                      className={`px-3.5 py-2 rounded-lg text-[13px] font-bold transition-colors border ${formRepeat === 'Weekly' ? 'bg-brand-600 text-white border-brand-600' : 'bg-neutral-50 text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-100'}`}
                    >Weekly</button>
                    {['Fortnightly', 'Monthly', 'One-off'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        disabled
                        title="Coming soon"
                        className="px-3.5 py-2 rounded-lg text-[13px] font-bold transition-colors border bg-neutral-50 text-gray-600 border-gray-200 opacity-50 cursor-not-allowed"
                      >{opt}</button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Venue <span className="normal-case font-medium text-gray-400">(optional)</span></label>
                  <VenueAutocomplete
                    value={formVenueName}
                    onChange={(v) => {
                      setFormVenueName(v)
                      // Free-text typing clears the address; user must pick from Places to repopulate
                      if (formVenueAddress) setFormVenueAddress('')
                    }}
                    onSelect={(venue: VenueSelection) => {
                      setFormVenueName(venue.name)
                      setFormVenueAddress(venue.address)
                    }}
                    placeholder="Search for a venue (or leave blank for no specific venue)"
                  />
                </div>
                <div className="mb-5">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Price override <span className="normal-case font-medium text-gray-400">(optional)</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-gray-400 pointer-events-none">£</span>
                    <input type="text" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="Leave blank to use default rate" className="w-full bg-neutral-50 border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-[15px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-600" />
                  </div>
                </div>
                {conflict && (
                  <div className="mb-4 flex items-start gap-2.5 bg-red-50 border border-red-200/70 rounded-xl px-4 py-3">
                    <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-[13px] font-medium text-red-700 leading-snug">{conflict.message}</p>
                  </div>
                )}
                {addBlockError && (
                  <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200/70 rounded-xl px-4 py-3">
                    <p className="text-[13px] font-medium text-red-700">{addBlockError}</p>
                    <button onClick={() => setAddBlockError(null)} className="ml-3 text-red-400 hover:text-red-600 transition-colors"><X size={14} /></button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <button onClick={resetForm} className="text-[14px] font-bold text-gray-400 hover:text-gray-700 transition-colors">Cancel</button>
                  <button
                    onClick={handleSaveBlock}
                    // AF-H-46: was also disabled on formDays.length === 0, which prevented the inline error from ever firing
                    disabled={!!conflict}
                    className={`px-6 py-3 rounded-xl text-[14px] font-bold transition-colors flex items-center gap-2 ${conflict ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                  >
                    {editingBlockId ? 'Save changes' : (<><Plus size={16} />Add this block</>)}
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setShowAddForm(true)
                  // CF-D06c: Auto-scroll to form
                  setTimeout(() => {
                    addFormRef.current?.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'start' 
                    })
                  }, 50)
                }} 
                className="w-full rounded-xl font-medium text-[13px] flex items-center justify-center gap-2 transition-colors"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px dashed #0077CC',
                  color: '#0077CC',
                  padding: '12px 16px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#E6F1FB'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#FFFFFF'
                }}
              >
                <Plus size={16} />Add another block
              </button>
            )}
            
            {/* Fix-107: Save changes sticky bar — only renders when the form is open; reuses handleSaveBlock */}
            {showAddForm && (
              <div
                className="sticky bottom-0 bg-white border-t-[0.5px] border-gray-100 px-6 py-3 flex justify-end"
                style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}
              >
                <button
                  onClick={handleSaveBlock}
                  // AF-H-46: was also disabled on formDays.length === 0; handler now surfaces the inline error instead
                  disabled={!!conflict}
                  className={`rounded-full px-7 py-2.5 text-[13px] font-medium transition-colors ${conflict ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
                >
                  Save changes
                </button>
              </div>
            )}
            </>
            )}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div className="flex flex-col">
            <h2 className="text-[18px] font-bold text-gray-900 mb-1">Blocked dates</h2>
            <p className="text-[14px] text-gray-500 font-medium mb-6 leading-relaxed">Block specific dates when you're not available — overrides your recurring schedule</p>
            
            {/* CD-05: Error state */}
            {blockedError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-[14px] font-medium text-red-700">{blockedError}</p>
              </div>
            )}
            
            {/* CD-05: Loading state */}
            {blockedLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-brand-600 rounded-full animate-spin mb-4"></div>
                <p className="text-[14px] text-gray-500">Loading blocked dates...</p>
              </div>
            ) : (
              <>
            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-6 mb-4">
              <div className="flex justify-between items-center mb-5 px-1">
                <span className="font-bold text-[16px] text-gray-900">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                <div className="flex gap-1">
                  <button onClick={navigatePrev} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={18} /></button>
                  <button onClick={navigateNext} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight size={18} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => <div key={d} className="text-center text-[12px] font-bold text-gray-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  const isCurrent = day.type === 'current'
                  const isStart = !!(rangeStart && sameDay(day.date, rangeStart))
                  const isEnd = !!(rangeEnd && sameDay(day.date, rangeEnd))
                  const isMid = !!(rangeStart && rangeEnd && !isStart && !isEnd && inRange(day.date, rangeStart, rangeEnd))
                  const isPreviewEnd = !!(previewEnd && sameDay(day.date, previewEnd))
                  const isPreviewMid = !!(rangeStart && previewEnd && !isStart && !isPreviewEnd && inRange(day.date, rangeStart, previewEnd))
                  const isBlocked = isCurrent && blockedRanges.some(r => inRange(day.date, r.start, r.end))
                  const hasRange = !!(rangeStart && rangeEnd && !isSingleDay)
                  const hasPreview = !!(rangeStart && !rangeEnd && previewEnd)
                  const showRightHalf = isStart && (hasRange || hasPreview)
                  const showLeftHalf = (isEnd && hasRange) || (isPreviewEnd && hasPreview)
                  let circle = 'relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium transition-colors select-none '
                  if (!isCurrent) circle += 'text-gray-300'
                  else if (isStart || isEnd) circle += 'bg-brand-600 text-white font-bold cursor-pointer'
                  else if (isPreviewEnd) circle += 'bg-brand-600/80 text-white font-bold cursor-pointer'
                  else if (isMid || isPreviewMid) circle += 'text-brand-600 cursor-pointer'
                  else if (isBlocked) circle += 'bg-red-50 text-red-500 border border-red-100/80 cursor-pointer'
                  else circle += 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                  return (
                    <div key={i} className="relative flex items-center justify-center py-[3px]" onClick={() => isCurrent && handleDayClick(day)} onMouseEnter={() => isCurrent && setHoverDate(day.date)} onMouseLeave={() => setHoverDate(null)}>
                      {(isMid || isPreviewMid) && <div className="absolute inset-y-0 inset-x-0 bg-brand-50" />}
                      {showRightHalf && <div className="absolute inset-y-0 left-1/2 right-0 bg-brand-50" />}
                      {showLeftHalf && <div className="absolute inset-y-0 left-0 right-1/2 bg-brand-50" />}
                      <div className={circle}>{day.date.getDate()}</div>
                      {sameDay(day.date, TODAY) && !isStart && !isEnd && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-brand-600 rounded-full z-20" />}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-5 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-brand-600" /><span className="text-[12px] text-gray-500 font-medium">Selected</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-brand-50 border border-brand-600/20" /><span className="text-[12px] text-gray-500 font-medium">In range</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-50 border border-red-200" /><span className="text-[12px] text-gray-500 font-medium">Already blocked</span></div>
              </div>
            </div>
            {rangeStart && (
              <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4 mb-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[15px] font-bold text-gray-900">{fmt(rangeStart)}</span>
                  {rangeEnd && !isSingleDay && <><span className="text-gray-400 text-[15px]">→</span><span className="text-[15px] font-bold text-gray-900">{fmt(rangeEnd)}</span><span className="text-[13px] text-gray-500 font-medium">({daysBetween(rangeStart, rangeEnd)} days)</span></>}
                  {rangeEnd && isSingleDay && <span className="text-[13px] text-gray-500 font-medium">(1 day)</span>}
                  {!rangeEnd && <span className="text-[13px] text-gray-400 font-normal">— tap a second date to set a range</span>}
                </div>
                <input type="text" value={blockLabel} onChange={e => setBlockLabel(e.target.value)} placeholder="Add a label — e.g. Easter, Half term  (optional)" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-600 mb-3" />
                <div className="flex gap-2">
                  <button onClick={handleBlockDates} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[14px] font-bold transition-colors">Block these dates</button>
                  <button onClick={clearSelection} className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-[14px] font-bold hover:bg-neutral-50 transition-colors">Clear</button>
                </div>
                {blockDatesError && (
                  <div className="mt-2 flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <p className="text-[12px] font-medium text-red-700">{blockDatesError}</p>
                    <button onClick={() => setBlockDatesError(null)} className="ml-3 text-red-400 hover:text-red-600 transition-colors"><X size={13} /></button>
                  </div>
                )}
              </div>
            )}
            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-6">
              <h3 className="text-[15px] font-bold text-gray-900 mb-1">Blocked periods</h3>
              <p className="text-[13px] text-gray-400 font-medium mb-4">Parents and players won't be able to book on these dates</p>
              {/* Fix-69-2: inline blocked action error */}
              {blockedActionError && (
                <div className="mb-4 flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <p className="text-[12px] font-medium text-red-700">{blockedActionError}</p>
                  <button onClick={() => setBlockedActionError(null)} className="ml-3 text-red-400 hover:text-red-600 transition-colors"><X size={13} /></button>
                </div>
              )}
              {blockedRanges.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><X size={18} className="text-gray-400" /></div>
                  <div className="text-[15px] font-bold text-gray-900 mb-1">No dates blocked</div>
                  <div className="text-[13px] text-gray-500 font-medium">Select dates on the calendar above to block them</div>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-gray-100">
                  {blockedRanges.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[14px] font-bold text-gray-900 shrink-0 tabular-nums">{fmt(item.start)}{!sameDay(item.start, item.end) && <> – {fmt(item.end)}</>}</span>
                        {item.label ? <span className="text-[14px] text-gray-500 font-medium truncate">{item.label}</span> : <span className="text-[13px] text-gray-300 font-medium italic">No label</span>}
                      </div>
                      {/* Fix-69-2: inline confirmation for blocked date remove */}
                      {removeBlockedConfirmId === item.id ? (
                        <div className="ml-3 shrink-0 flex items-center gap-1">
                          <button
                            onClick={() => setRemoveBlockedConfirmId(null)}
                            className="px-2 py-1 text-[11px] text-gray-500 border border-gray-200 rounded-md hover:bg-neutral-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={deletingBlocked === item.id}
                            onClick={async () => {
                              setBlockedActionError(null)
                              try {
                                setDeletingBlocked(item.id)
                                const response = await fetch(`/api/coaches/blocked-dates/${item.id}`, { method: 'DELETE' })
                                if (!response.ok) throw new Error('Failed to delete blocked date')
                                setBlockedRanges(prev => prev.filter(r => r.id !== item.id))
                                setRemoveBlockedConfirmId(null)
                              } catch (err) {
                                console.error('Error deleting blocked date:', err)
                                setBlockedActionError('Failed to remove blocked date. Please try again.')
                                setRemoveBlockedConfirmId(null)
                              } finally {
                                setDeletingBlocked(null)
                              }
                            }}
                            className="px-2 py-1 text-[11px] text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {deletingBlocked === item.id ? '…' : 'Remove'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setRemoveBlockedConfirmId(item.id)}
                          disabled={!!deletingBlocked}
                          className="ml-3 shrink-0 flex items-center gap-1 text-[13px] text-gray-400 hover:text-red-500 font-bold transition-colors disabled:opacity-50"
                        >
                          <X size={14} /> remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
