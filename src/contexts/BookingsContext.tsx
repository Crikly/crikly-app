// PERF-02-BOOKINGS-CACHE: shared bookings context for coach routes.
//
// History:
//   - Originally gated to /coach/bookings so BookingsManagement +
//     CoachRightPanel's sub-components could share one fetch lifecycle.
//   - DS-RIGHT-PANEL-01 (May 2026) ungated this provider so the universal
//     right-panel command-centre can read sessions on every coach route.
//     Added a 4th fetch for ?tab=week (Mon-Sun) to power the week strip.
//
// Provider strategy:
//   - Mounted at CoachLayoutClient level — wraps every coach route.
//   - Single useEffect fires Promise.all of 3 endpoints on mount.
//   - Exposes upcoming / pendingApproval / thisWeek + refresh().
//
// Cost: 3 parallel fetches per coach page load (~200ms wall-clock).
// On /coach/dashboard this duplicates some server-rendered data — see
// PERF-RIGHT-PANEL-DASHBOARD-DEDUPE follow-up.

'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

// Union of fields needed across consumers. venue_name added in
// DS-RIGHT-PANEL-01 for the session-detail popup's location row.
export interface BookingListItem {
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
  created_at: string
  venue_name: string | null
}

interface BookingsContextValue {
  upcoming: BookingListItem[]
  pendingApproval: BookingListItem[]
  /** Mon-Sun of the current week (server-local time), all statuses except
   *  cancelled. Powers the right-panel week strip + daily lineup. Capped
   *  at API PAGE_SIZE (10) per query — see PERF-RIGHT-PANEL-WEEK-CAP. */
  thisWeek: BookingListItem[]
  loading: boolean
  error: string | null
  /** Re-fires all 3 fetches in parallel. Call after status mutations
   *  (approve / decline / cancel) so cached lists reflect current state. */
  refresh: () => Promise<void>
}

const BookingsContext = createContext<BookingsContextValue | null>(null)

interface BookingsApiResponse {
  bookings?: BookingListItem[]
}

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [upcoming, setUpcoming] = useState<BookingListItem[]>([])
  const [pendingApproval, setPendingApproval] = useState<BookingListItem[]>([])
  const [thisWeek, setThisWeek] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PERF-02b: in-flight guard prevents React strict-mode double-invoke
  // (and back-to-back refresh() calls during fast user actions) from
  // firing two parallel Promise.all batches.
  const fetchingRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const [upRes, pendingRes, weekRes] = await Promise.all([
        fetch('/api/coaches/bookings?tab=upcoming&page=1'),
        fetch('/api/coaches/bookings?tab=pending_approval'),
        fetch('/api/coaches/bookings?tab=week'),
      ])

      // Each tab's response is independent — a partial failure leaves the
      // other tabs populated rather than wiping all four.
      if (upRes.ok) {
        const data = await upRes.json() as BookingsApiResponse
        setUpcoming(data.bookings ?? [])
      } else {
        setUpcoming([])
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json() as BookingsApiResponse
        setPendingApproval(data.bookings ?? [])
      } else {
        setPendingApproval([])
      }

      if (weekRes.ok) {
        const data = await weekRes.json() as BookingsApiResponse
        setThisWeek(data.bookings ?? [])
      } else {
        setThisWeek([])
      }
    } catch (err) {
      console.error('[BookingsContext] fetchAll error:', err)
      setError('Failed to load bookings. Please try again.')
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <BookingsContext.Provider
      value={{
        upcoming,
        pendingApproval,
        thisWeek,
        loading,
        error,
        refresh: fetchAll,
      }}
    >
      {children}
    </BookingsContext.Provider>
  )
}

export function useBookings(): BookingsContextValue {
  const ctx = useContext(BookingsContext)
  if (!ctx) {
    throw new Error('useBookings must be used inside <BookingsProvider>')
  }
  return ctx
}
