// PERF-02-BOOKINGS-CACHE: shared bookings context for coach routes.
//
// History:
//   - Originally gated to /coach/bookings so BookingsManagement +
//     CoachRightPanel's sub-components could share one fetch lifecycle.
//   - DS-RIGHT-PANEL-01 (May 2026) ungated this provider so the universal
//     right-panel command-centre can read sessions on every coach route.
//     Added a 4th fetch for ?tab=week (Mon-Sun) to power the week strip.
//   - Fix-BOOKINGS-TODAY-DEAD dropped the unused ?tab=today fetch (4 → 3).
//   - Fix-BOOKINGS-ALL-ENDPOINT collapsed the remaining 3 fetches into a
//     single /api/coaches/bookings/all request (3 → 1; one connection).
//
// Provider strategy:
//   - Mounted at CoachLayoutClient level — wraps every coach route.
//   - Single useEffect fetches /api/coaches/bookings/all on mount; that
//     endpoint partitions upcoming / pendingApproval / thisWeek server-side.
//   - Exposes upcoming / pendingApproval / thisWeek + refresh().
//
// Cost: 1 fetch per coach page load (Fix-BOOKINGS-ALL-ENDPOINT — was 3 parallel
// fetches, each a separate server connection). On /coach/dashboard this still
// duplicates some server-rendered data — see PERF-RIGHT-PANEL-DASHBOARD-DEDUPE.

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

interface BookingsAllResponse {
  upcoming?: BookingListItem[]
  pendingApproval?: BookingListItem[]
  thisWeek?: BookingListItem[]
}

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [upcoming, setUpcoming] = useState<BookingListItem[]>([])
  const [pendingApproval, setPendingApproval] = useState<BookingListItem[]>([])
  const [thisWeek, setThisWeek] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PERF-02b: in-flight guard prevents React strict-mode double-invoke
  // (and back-to-back refresh() calls during fast user actions) from
  // firing two parallel fetches.
  const fetchingRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    setError(null)
    try {
      // Fix-BOOKINGS-ALL-ENDPOINT: one request → one server connection. The
      // /all endpoint partitions the three buckets server-side and resolves
      // names once. All-or-nothing: a 500 empties all three + sets error.
      const res = await fetch('/api/coaches/bookings/all')
      if (res.ok) {
        const data = await res.json() as BookingsAllResponse
        setUpcoming(data.upcoming ?? [])
        setPendingApproval(data.pendingApproval ?? [])
        setThisWeek(data.thisWeek ?? [])
      } else {
        setUpcoming([])
        setPendingApproval([])
        setThisWeek([])
        setError('Failed to load bookings. Please try again.')
      }
    } catch (err) {
      console.error('[BookingsContext] fetchAll error:', err)
      // Consistent with the non-OK branch (all-or-nothing): clear all three
      // so a failed load never leaves stale cards beside the error banner.
      setUpcoming([])
      setPendingApproval([])
      setThisWeek([])
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
