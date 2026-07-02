'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Mail, CalendarDays, Activity, User, Clock, MapPin, RefreshCw, Check, X } from 'lucide-react'
// AF-P-Wave-1: sports cache adoption
import { fetchSportsListCached } from '@/lib/onboarding-cache'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingDetailData {
  id: string
  booking_reference: string
  session_date: string
  session_start_time: string
  session_end_time: string
  session_type: string
  status: string
  sport_id: string
  coach_price_pence: number
  commission_pence: number
  commission_rate: number
  parent_total_pence: number
  currency: string
  messaging_unlocked: boolean
  cancellation_window_hours: number
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  completed_at: string | null
  notes_for_coach: string | null
  created_at: string
  venue: {
    id: string | null
    name: string
    address: string | null
  } | null
  booker: {
    user_profile_id: string
    full_name: string | null
    email: string | null
  }
  child: {
    id: string
    full_name: string
    date_of_birth: string
  } | null
  /** UX-16: guest-checkout snapshot of who the session is for (no profile row). */
  participant_name: string | null
  participant_age: number | null
  session_note: {
    id: string
    notes: string
    is_shared_with_parent: boolean
    updated_at: string
  } | null
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
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

function calculateDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em) - (sh * 60 + sm)
}

function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function formatCreatedAt(isoStr: string): string {
  const d = new Date(isoStr)
  const datePart = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const timePart = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${datePart} at ${timePart}`
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

function statusBadge(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'pending_approval': return { bg: '#FFFBEB', text: '#92400E', label: 'Pending approval' }
    case 'confirmed':        return { bg: '#E0F6F8', text: '#0099AA', label: 'Confirmed' }
    case 'completed':        return { bg: '#DCFCE7', text: '#15803D', label: 'Completed' }
    case 'no_show':          return { bg: '#FEE2E2', text: '#B91C1C', label: 'No show' }
    case 'cancelled_parent':
    case 'cancelled_coach':  return { bg: '#FEE2E2', text: '#B91C1C', label: 'Cancelled' }
    default:                 return { bg: '#F3F4F6', text: '#6B7280', label: status }
  }
}

function calculateCanCancel(
  sessionDate: string,
  sessionStartTime: string,
  cancellationWindowHours: number,
): boolean {
  const sessionDt = new Date(`${sessionDate}T${sessionStartTime}`)
  const hoursUntilSession = (sessionDt.getTime() - Date.now()) / (1000 * 60 * 60)
  return cancellationWindowHours > 0 && hoursUntilSession > cancellationWindowHours
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BookingDetailSkeleton() {
  return (
    <div className="flex-1 px-5 py-6 space-y-4 animate-pulse">
      <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 bg-gray-200 rounded shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-40" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-gray-200 shrink-0" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-200 rounded w-48" />
          </div>
        </div>
        <div className="h-10 bg-gray-100 rounded" />
      </div>
      <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingDetail() {
  const router = useRouter()
  const params = useParams<{ bookingId: string }>()
  const bookingId = params?.bookingId

  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<BookingDetailData | null>(null)
  const [notFound, setNotFound] = useState(false)
  // AF-H-31: distinguish 404 from server/network errors (was collapsed to notFound)
  const [isError, setIsError] = useState(false)
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({})

  useEffect(() => {
    // AF-P-Wave-1: use sports cache — fetchSportsListCached returns Sport[] directly,
    // so destructure is now Sport[] instead of { sports?: Sport[] }
    Promise.all([
      fetchSportsListCached().catch(() => [] as Sport[]),
      bookingId
        ? fetch(`/api/coaches/bookings/${bookingId}`).then(async (r) => {
            if (r.status === 404) return { notFound: true }
            if (!r.ok) return { error: true }
            return r.json()
          })
        : Promise.resolve({ notFound: true }),
    ]).then(([sports, bookingData]: [Sport[], Record<string, unknown>]) => {
      const map: Record<string, string> = {}
      sports.forEach((s) => { map[s.id] = s.name })
      setSportsMap(map)

      // AF-H-31: split 404 from server errors
      if (bookingData.notFound) {
        setNotFound(true)
      } else if (bookingData.error) {
        setIsError(true)
      } else {
        setBooking(bookingData as unknown as BookingDetailData)
      }
    })
    // AF-H-31: catch network errors that previously caused a blank screen
    .catch(() => setIsError(true))
    .finally(() => setLoading(false))
  }, [bookingId])

  // AF-C-08: action state for Approve / Decline
  const [actionLoading, setActionLoading] = useState<'approve' | 'decline' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // AF-C-08: silent re-fetch after status action — no skeleton flash
  const refetchBooking = useCallback(async () => {
    if (!bookingId) return
    try {
      const r = await fetch(`/api/coaches/bookings/${bookingId}`)
      if (!r.ok) return
      const data = (await r.json()) as BookingDetailData
      setBooking(data)
    } catch {
      // keep previous booking state — error surfaced via actionError if relevant
    }
  }, [bookingId])

  // AF-C-08: handle Approve / Decline via existing PATCH /status endpoint
  const handleStatusAction = async (action: 'approve' | 'decline') => {
    if (!bookingId) return
    setActionLoading(action)
    setActionError(null)
    try {
      const res = await fetch(`/api/coaches/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setActionError(data.error ?? 'Something went wrong — please try again.')
        return
      }
      await refetchBooking()
    } catch {
      setActionError('Network error — please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const badge = booking ? statusBadge(booking.status) : null

  return (
    <div className="min-h-screen">
      <div className="w-full max-w-2xl mx-auto min-h-screen relative flex flex-col pb-12">
        {/* BUG-QA-01: sticky back-arrow row (mini-title removed — body h1 below
            replaces it per design system v1.3 §Page titles (h1) canonical). */}
        <div className="px-5 py-4 bg-white sticky top-0 z-10 border-b border-gray-100 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 text-gray-900 hover:bg-neutral-50 rounded-full transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={24} />
          </button>
          {badge && (
            <div
              className="px-2.5 py-1 rounded-full text-[12px] font-bold"
              style={{ backgroundColor: badge.bg, color: badge.text }}
            >
              {badge.label}
            </div>
          )}
          {!badge && <div className="w-16" />}
        </div>

        {/* BUG-QA-01: canonical body h1 (matches ProfileEdit/Bookings/Programmes). */}
        <div className="px-5 pt-8 pb-2">
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900">Booking Detail</h1>
        </div>

        {/* BUG-QA-01: quick approve/decline at top for pending_approval bookings.
            Reuses handleStatusAction(); existing bottom buttons stay at L429-452.
            actionError is shared with the bottom row — surfaced here too so a
            failure on the top buttons is visible without scrolling. */}
        {!loading && booking && booking.status === 'pending_approval' && (
          <>
            <div className="px-5 pb-4 flex gap-2">
              <button
                disabled={actionLoading !== null}
                onClick={() => handleStatusAction('approve')}
                className="flex-1 py-2 flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-[13px] font-medium transition-colors"
              >
                {actionLoading === 'approve' ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Approve
              </button>
              <button
                disabled={actionLoading !== null}
                onClick={() => handleStatusAction('decline')}
                className="flex-1 py-2 flex items-center justify-center gap-1.5 border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed bg-white rounded-lg text-[13px] font-medium transition-colors"
              >
                {actionLoading === 'decline' ? <RefreshCw size={14} className="animate-spin" /> : <X size={14} />}
                Decline
              </button>
            </div>
            {actionError && (
              <p className="px-5 pb-2 text-[13px] text-red-600" role="alert">{actionError}</p>
            )}
          </>
        )}

        {/* Loading */}
        {loading && <BookingDetailSkeleton />}

        {/* Not found */}
        {!loading && notFound && (
          <div className="flex-1 flex flex-col items-center justify-center px-5 py-20">
            <p className="text-[17px] font-bold text-gray-900 mb-2">Booking not found</p>
            <p className="text-[14px] text-gray-500 mb-6 text-center">This booking doesn&apos;t exist or you don&apos;t have access to it.</p>
            <button
              onClick={() => router.push('/coach/bookings')}
              className="text-[14px] font-medium text-brand-600 hover:underline"
            >
              Back to Bookings
            </button>
          </div>
        )}

        {/* AF-H-31: server/network error (distinct from 404 not-found) */}
        {!loading && isError && !notFound && (
          <div className="flex-1 flex flex-col items-center justify-center px-5 py-20">
            <p className="text-[17px] font-bold text-gray-900 mb-2">Failed to load booking</p>
            <p className="text-[14px] text-gray-500 mb-6 text-center">Something went wrong. Please try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && booking && (
          <div className="flex-1 px-5 py-6 space-y-4">
            {/* Session details card */}
            <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-4">
              <div className="flex items-start gap-3">
                <CalendarDays size={18} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[15px] font-bold text-gray-900">{formatSessionDate(booking.session_date)}</div>
                  <div className="text-[14px] text-gray-500 font-medium mt-0.5">
                    {formatTime(booking.session_start_time)} – {formatTime(booking.session_end_time)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Activity size={18} className="text-gray-400 shrink-0" />
                <span className="text-[15px] text-gray-900 font-medium">{sportsMap[booking.sport_id] ?? '—'}</span>
              </div>
              <div className="flex items-center gap-3">
                <User size={18} className="text-gray-400 shrink-0" />
                <span className="text-[15px] text-gray-900 font-medium">
                  {booking.session_type === 'individual' ? '1-on-1' : 'Group'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-gray-400 shrink-0" />
                <span className="text-[15px] text-gray-900 font-medium">
                  {calculateDurationMinutes(booking.session_start_time, booking.session_end_time)} min
                </span>
              </div>
            </div>

            {/* Venue card — render only when name is truthy */}
            {booking.venue?.name && (
              <div className="bg-white rounded-[16px] p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[12px] font-medium text-gray-500 uppercase tracking-wide mb-1">Venue</div>
                    <div className="text-[15px] font-bold text-gray-900">{booking.venue.name}</div>
                    {booking.venue.address && (
                      <div className="text-[13px] text-gray-500 mt-0.5">{booking.venue.address}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Booker / contact card */}
            <div className="bg-white rounded-[16px] p-0 shadow-sm overflow-hidden">
              <div className="p-5 flex items-center gap-4 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center text-[16px] font-bold shrink-0">
                  {initials(booking.booker.full_name)}
                </div>
                <div>
                  <div className="text-[16px] font-bold text-gray-900">{booking.booker.full_name ?? '—'}</div>
                  <div className="text-[13px] text-gray-500 font-medium mt-1 leading-snug">
                    {booking.child
                      ? `Parent · Booking for: ${booking.child.full_name} (age ${calculateAge(booking.child.date_of_birth)})`
                      : booking.participant_name
                        ? `Booking for: ${booking.participant_name}${
                            booking.participant_age !== null ? ` (age ${booking.participant_age})` : ''
                          }`
                        : 'Player booking'}
                  </div>
                </div>
              </div>
              {booking.booker.email && (
                <button
                  className="w-full p-4 px-5 flex items-center gap-3 hover:bg-neutral-50 transition-colors text-left"
                  onClick={() => { window.location.href = `mailto:${booking.booker.email}` }}
                  aria-label={`Email ${booking.booker.full_name ?? 'booker'}`}
                >
                  <Mail size={18} className="text-brand-600 shrink-0" />
                  <span className="text-[15px] font-medium text-gray-900">{booking.booker.email}</span>
                </button>
              )}
            </div>

            {/* Earnings card — coach receives the full coach_price (BR-01: commission added on top, never deducted) */}
            <div className="bg-white rounded-[16px] p-5 shadow-sm flex items-center justify-between">
              <span className="text-[15px] text-gray-600 font-medium">Your earnings</span>
              <span className="text-[18px] font-bold text-brand-600">{formatPence(booking.coach_price_pence)}</span>
            </div>

            {/* Session notes card (shown only if note exists) */}
            {booking.session_note && (
              <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-2">
                <div className="text-[14px] font-semibold text-gray-900">Session notes</div>
                <p className="text-[14px] text-gray-700 leading-relaxed">{booking.session_note.notes}</p>
                {booking.session_note.is_shared_with_parent && (
                  <p className="text-[12px] text-gray-400">Shared with parent</p>
                )}
              </div>
            )}

            {/* Policy card — dynamic cancellation copy */}
            <div className="bg-white rounded-[16px] p-5 shadow-sm space-y-3">
              {booking.cancellation_window_hours != null && (
                <div className="text-[14px] text-gray-700 font-medium">
                  {booking.cancellation_window_hours === 0
                    ? 'No cancellations'
                    : `Cancel up to ${booking.cancellation_window_hours} hours before the session`}
                </div>
              )}
              <div className="text-[14px] text-gray-500 font-medium">
                Booked on: {formatCreatedAt(booking.created_at)}
              </div>
            </div>

            {/* AF-H-48: cancellation context — reason, who, when */}
            {(booking.status === 'cancelled_parent' || booking.status === 'cancelled_coach') && (
              <div className="bg-neutral-50 rounded-[16px] p-5 space-y-2">
                <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wide">
                  Cancellation
                </p>
                {booking.cancelled_by && (
                  <p className="text-[13px] text-gray-700">
                    Cancelled by {booking.cancelled_by === 'parent' ? 'parent' : booking.cancelled_by === 'coach' ? 'coach' : booking.cancelled_by}
                    {booking.cancelled_at && ` on ${formatCreatedAt(booking.cancelled_at)}`}
                  </p>
                )}
                {booking.cancellation_reason && (
                  <div className="pt-1">
                    <p className="text-[12px] text-gray-500 mb-0.5">Reason</p>
                    <p className="text-[13px] text-gray-900">{booking.cancellation_reason}</p>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons — state-aware on booking.status */}
            {booking.status === 'pending_approval' && (
              <div className="pt-4 pb-6 space-y-3">
                {actionError && (
                  <p className="text-[14px] text-red-600 text-center" role="alert">{actionError}</p>
                )}
                <button
                  disabled={actionLoading !== null}
                  className="w-full py-3.5 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-[15px] font-bold transition-colors"
                  onClick={() => handleStatusAction('approve')}
                >
                  {actionLoading === 'approve' ? <RefreshCw size={16} className="animate-spin" /> : null}
                  Approve
                </button>
                <button
                  disabled={actionLoading !== null}
                  className="w-full py-3.5 flex items-center justify-center gap-2 border border-red-600 text-red-600 rounded-xl text-[15px] font-bold hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors bg-white"
                  onClick={() => handleStatusAction('decline')}
                >
                  {actionLoading === 'decline' ? <RefreshCw size={16} className="animate-spin" /> : null}
                  Decline
                </button>
              </div>
            )}
            {booking.status === 'confirmed' &&
              calculateCanCancel(
                booking.session_date,
                booking.session_start_time,
                booking.cancellation_window_hours,
              ) && (
                <div className="pt-4 pb-6 space-y-3">
                  {/* AF-C-09: coach-initiated cancel-of-confirmed-booking endpoint
                      not yet implemented. Status route only accepts approve|decline
                      and only against pending_approval bookings. Disabled until a
                      dedicated cancel route exists (BR-04 refund + BR-13 flagging
                      involved — separate 🔴 high-risk task). */}
                  <button
                    disabled
                    aria-disabled="true"
                    className="w-full py-3.5 flex items-center justify-center gap-2 border border-gray-200 text-gray-400 rounded-xl text-[15px] font-bold opacity-60 cursor-not-allowed bg-white"
                  >
                    Cancel booking
                  </button>
                  <p className="text-[12px] text-gray-400 text-center">Coming soon</p>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  )
}
