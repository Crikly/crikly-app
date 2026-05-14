// PERF-02-BOOKINGS-CACHE: shared bookings context for /coach/bookings.
//
// Background: BookingsManagement (left main panel) and CoachRightPanel's
// BookingsPendingApprovals + BookingsTodaySessions (right panel) each fired
// their own /api/coaches/bookings fetch on mount — 3 simultaneous API calls
// with 3 separate auth chains (~150ms × 3 of auth overhead). They are also
// React-tree siblings (both descend from CoachLayoutClient), so a context
// provider at that layout level is the only spot that can be seen by all
// three consumers.
//
// Provider strategy:
//   - Mount only on /coach/bookings (route-gated in CoachLayoutClient).
//   - Single useEffect fires Promise.all of the 3 endpoints on mount.
//   - Exposes upcoming / today / pendingApproval lists + a refresh()
//     callback for status-mutation flows (approve / decline).
//
// Out of scope:
//   - Past + Cancelled tabs in BookingsManagement keep their own fetch
//     (lazy-loaded with pagination, not worth lifting).
//   - sportsMap state in each consumer (separate concern).

'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

// Union of the two pre-existing BookingListItem definitions in BookingsManagement.tsx
// (had messaging_unlocked) and CoachRightPanel.tsx (had created_at). Both fields are
// included so either consumer can read what it needs.
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
}

interface BookingsContextValue {
  upcoming: BookingListItem[]
  today: BookingListItem[]
  pendingApproval: BookingListItem[]
  loading: boolean
  error: string | null
  /** Re-fires the 3 fetches in parallel. Call after status mutations
   *  (approve / decline / cancel) so all cached lists reflect current
   *  server state — approving a pending booking should move it from
   *  pendingApproval to upcoming, and refresh() does that atomically. */
  refresh: () => Promise<void>
}

const BookingsContext = createContext<BookingsContextValue | null>(null)

interface BookingsApiResponse {
  bookings?: BookingListItem[]
}

export function BookingsProvider({ children }: { children: ReactNode }) {
  const [upcoming, setUpcoming] = useState<BookingListItem[]>([])
  const [today, setToday] = useState<BookingListItem[]>([])
  const [pendingApproval, setPendingApproval] = useState<BookingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // PERF-02b: in-flight guard prevents React strict-mode double-invoke
  // (and back-to-back refresh() calls during fast user actions) from
  // firing two parallel Promise.all batches of 3 fetches each. The ref
  // is stable across renders so useCallback deps stay []. Mirrors the
  // PERF-04 pattern in GetPaid.tsx (fetchStripeStatus).
  const fetchingRef = useRef(false)

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const [upRes, todayRes, pendingRes] = await Promise.all([
        fetch('/api/coaches/bookings?tab=upcoming&page=1'),
        fetch('/api/coaches/bookings?tab=today'),
        fetch('/api/coaches/bookings?tab=pending_approval'),
      ])

      // Each tab's response is independent — a partial failure leaves the
      // other tabs populated rather than wiping all three.
      if (upRes.ok) {
        const data = await upRes.json() as BookingsApiResponse
        setUpcoming(data.bookings ?? [])
      } else {
        setUpcoming([])
      }

      if (todayRes.ok) {
        const data = await todayRes.json() as BookingsApiResponse
        setToday(data.bookings ?? [])
      } else {
        setToday([])
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json() as BookingsApiResponse
        setPendingApproval(data.bookings ?? [])
      } else {
        setPendingApproval([])
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
        today,
        pendingApproval,
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
