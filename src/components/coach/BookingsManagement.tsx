'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2 } from 'lucide-react'

type Tab = 'Upcoming' | 'Pending approval' | 'Past'

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
  booked_by_name: string | null
  child_name: string | null
  messaging_unlocked: boolean
}

interface Sport {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function formatSessionDate(dateStr: string): string {
  const todayIso = new Date().toISOString().slice(0, 10)
  if (dateStr === todayIso) return 'Today'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

function isStartingSoon(dateStr: string, startTime: string): boolean {
  const todayIso = new Date().toISOString().slice(0, 10)
  if (dateStr !== todayIso) return false
  const now = new Date()
  const [h, m] = startTime.split(':').map(Number)
  const sessionMs = new Date().setHours(h, m, 0, 0)
  const diffMs = sessionMs - now.getTime()
  return diffMs >= 0 && diffMs <= 3 * 60 * 60 * 1000
}

function statusBadge(status: string, dateStr: string, startTime: string): { bg: string; text: string; label: string } {
  if (status === 'confirmed' && isStartingSoon(dateStr, startTime)) {
    return { bg: '#FEF3C7', text: '#B45309', label: 'Starting soon' }
  }
  switch (status) {
    case 'pending_approval': return { bg: '#FEF3C7', text: '#B45309', label: 'Pending approval' }
    case 'confirmed':   return { bg: '#E0F6F8', text: '#0099AA', label: 'Confirmed' }
    case 'completed':   return { bg: '#DCFCE7', text: '#15803D', label: 'Completed' }
    case 'no_show':     return { bg: '#FEE2E2', text: '#B91C1C', label: 'No show' }
    case 'cancelled_parent':
    case 'cancelled_coach': return { bg: '#FEE2E2', text: '#B91C1C', label: 'Cancelled' }
    default:            return { bg: '#F3F4F6', text: '#6B7280', label: status }
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BookingCardSkeleton() {
  return (
    <div className="rounded-xl bg-white animate-pulse overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div className="p-3 space-y-2">
        <div className="flex justify-between items-center">
          <div className="h-4 w-28 bg-gray-200 rounded" />
          <div className="h-5 w-16 bg-gray-200 rounded-full" />
        </div>
        <div className="h-3 w-40 bg-gray-200 rounded" />
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <div className="h-4 w-12 bg-gray-200 rounded" />
          <div className="h-4 w-4 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingsManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Upcoming')
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<BookingListItem[]>([])
  const [upcomingCount, setUpcomingCount] = useState(0)
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({})
  const [pastPage, setPastPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Fetch sports once on mount
  useEffect(() => {
    fetch('/api/sports')
      .then((r) => r.json())
      .then((data: { sports?: Sport[] }) => {
        const map: Record<string, string> = {}
        data.sports?.forEach((s) => { map[s.id] = s.name })
        setSportsMap(map)
      })
      .catch(() => {/* non-critical — sport names fall back to empty */})
  }, [])

  const PAGE_SIZE = 20

  const fetchBookings = useCallback(async (tab: Tab) => {
    setLoading(true)
    setPastPage(1)
    setHasMore(false)

    let apiTab: string
    if (tab === 'Upcoming') apiTab = 'upcoming'
    else if (tab === 'Past') apiTab = 'past'
    else apiTab = 'pending_approval'

    try {
      const res = await fetch(`/api/coaches/bookings?tab=${apiTab}&page=1`)
      if (!res.ok) { setBookings([]); return }
      const data = await res.json() as { bookings: BookingListItem[] }
      const rows = data.bookings ?? []
      setBookings(rows)
      if (tab === 'Upcoming') setUpcomingCount(rows.length)
      if (tab === 'Past') setHasMore(rows.length === PAGE_SIZE)
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    const nextPage = pastPage + 1
    try {
      const res = await fetch(`/api/coaches/bookings?tab=past&page=${nextPage}`)
      if (!res.ok) return
      const data = await res.json() as { bookings: BookingListItem[] }
      const rows = data.bookings ?? []
      setBookings((prev) => [...prev, ...rows])
      setPastPage(nextPage)
      setHasMore(rows.length === PAGE_SIZE)
    } catch { /* silent — existing list stays intact */ } finally {
      setLoadingMore(false)
    }
  }, [pastPage])

  useEffect(() => {
    fetchBookings(activeTab)
  }, [activeTab, fetchBookings])

  const pendingCount: number = 0 // BR-06: auto-confirmed

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col">
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-[13px] text-gray-500 mt-1 mb-4">
            {upcomingCount} upcoming{pendingCount > 0 ? ` · ${pendingCount} need action` : ''}
          </p>

          <div className="flex items-center gap-6 border-b-[1.5px] border-gray-100">
            {(['Upcoming', 'Pending approval', 'Past'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-[15px] transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab
                    ? 'text-[#0077CC] font-medium'
                    : 'text-gray-500 font-normal hover:text-gray-700'
                }`}
              >
                {tab}
                {tab === 'Pending approval' && pendingCount > 0 && (
                  <span className="w-[18px] h-[18px] rounded-full bg-[#E24B4A] text-white text-[9px] font-medium flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0077CC]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 px-5 py-5 pb-12">
          {activeTab === 'Upcoming' && pendingCount > 0 && (
            <div className="mb-5 p-3 bg-[#FFFBEB] border-l-4 border-l-[#F59E0B] rounded-r-[10px] flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="w-[18px] h-[18px] rounded-full bg-[#F59E0B] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-[11px] font-bold">!</span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#78350F]">{pendingCount} booking{pendingCount > 1 ? 's' : ''} need{pendingCount === 1 ? 's' : ''} your approval</p>
                  <p className="text-[11px] text-[#92400E] mt-0.5">Respond now — parents are waiting to confirm</p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('Pending approval')}
                className="text-[12px] font-medium text-[#0077CC] hover:underline whitespace-nowrap"
              >
                Review now →
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {loading ? (
              <>
                <BookingCardSkeleton />
                <BookingCardSkeleton />
                <BookingCardSkeleton />
              </>
            ) : bookings.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[15px] text-gray-500 font-medium">No {activeTab.toLowerCase()} bookings</p>
              </div>
            ) : (
              bookings.map((booking) => {
                const badge = statusBadge(booking.status, booking.session_date, booking.session_start_time)
                const isSoon = badge.label === 'Starting soon'
                const isGroup = booking.session_type === 'group'
                const clientName = booking.child_name ?? booking.booked_by_name ?? '—'
                const sportName = sportsMap[booking.sport_id] ?? ''
                const sessionTypeLabel = isGroup ? 'Group session' : '1-on-1'

                return (
                  <div
                    key={booking.id}
                    data-testid="booking-card"
                    className={`relative rounded-xl cursor-pointer overflow-hidden group ${
                      activeTab === 'Past' ? 'opacity-80' : ''
                    }`}
                    style={{
                      background: isSoon ? '#FFFDF5' : '#FFFFFF',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                      e.currentTarget.style.transform = 'scale(1.005)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
                      e.currentTarget.style.transform = 'scale(1)'
                    }}
                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.998)' }}
                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.005)' }}
                  >
                    <div className="p-3" onClick={() => router.push(`/coach/bookings/${booking.id}`)}>
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="text-[15px] font-bold text-gray-900">
                          {formatSessionDate(booking.session_date)}{' '}
                          <span className="text-gray-500 font-medium ml-1.5">{formatTime(booking.session_start_time)}</span>
                        </div>
                        <div
                          className="px-2.5 py-1 rounded-full text-[12px] font-bold flex items-center gap-1.5"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {isSoon && (
                            <span className="w-[6px] h-[6px] rounded-full bg-[#F59E0B] pulse-dot" />
                          )}
                          {badge.label}
                        </div>
                      </div>

                      <div className="text-[13px] text-gray-500 mb-1">
                        {[sportName, sessionTypeLabel].filter(Boolean).join(' · ')}
                      </div>

                      <div className="text-[13px] font-medium text-gray-900 mb-2">
                        {clientName}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t-[0.5px] border-gray-100">
                        <span className="text-[16px] font-bold text-gray-900">{formatPence(booking.coach_price_pence)}</span>
                        <ChevronRight size={20} className="text-gray-400" />
                      </div>
                    </div>

                    {activeTab === 'Upcoming' && (
                      <div className="border-t-[0.5px] border-gray-100 px-4 py-1.5 flex gap-2 bg-white">
                        {isSoon ? (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation() /* TODO: wire Message action in Step 5 */ }}
                              className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                            >
                              Message
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation() /* TODO: wire Mark complete action in Step 5 */ }}
                              className="flex-1 bg-[#0077CC] text-white font-medium rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                            >
                              Mark complete →
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation() /* TODO: wire Message action in Step 5 */ }}
                              className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                            >
                              {isGroup ? 'Message group' : 'Message'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/coach/bookings/${booking.id}`) }}
                              className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                            >
                              View details
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {activeTab === 'Past' && hasMore && !loading && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-xl border border-gray-200 py-3 text-[14px] font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loadingMore ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Load more past bookings'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .pulse-dot {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
