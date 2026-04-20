'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Star, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachSport {
  sport_id: string
  sport_name: string
  session_types: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  session_duration_minutes: number
}

interface AvailabilitySlot {
  id: string
  sport_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
}

interface AvailabilityResponse {
  availability: AvailabilitySlot[]
  blocked_dates: string[]
  booking_policy: {
    cancellation_window_hours: number
    min_advance_hours: number
    max_advance_days: number
  }
}

interface NextSlot {
  dateLabel: string
  timeLabel: string
  nextLabel: string
}

export interface BookingCardProps {
  coachId: string
  sports: CoachSport[]
  priceFrom: number | null
  ratingAvg: number | null
  ratingCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatDateLabel(d: Date): string {
  return `${DAY_ABBREV[d.getDay()]} ${d.getDate()} ${MONTH_ABBREV[d.getMonth()]}`
}

function findNextSlot(data: AvailabilityResponse): NextSlot | null {
  const { availability, blocked_dates, booking_policy } = data
  if (availability.length === 0) return null

  const now = new Date()
  const blockedSet = new Set(blocked_dates)
  const minAdvanceMs = booking_policy.min_advance_hours * 3600 * 1000
  const maxDays = booking_policy.max_advance_days ?? 60

  for (let i = 0; i <= maxDays; i++) {
    const date = new Date(now)
    date.setDate(now.getDate() + i)
    date.setHours(0, 0, 0, 0)

    const dateStr = toDateStr(date)
    if (blockedSet.has(dateStr)) continue

    const dayOfWeek = date.getDay()
    const slots = availability
      .filter(t => t.day_of_week === dayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))

    for (const slot of slots) {
      const [h, m] = slot.start_time.split(':').map(Number)
      const slotTime = new Date(date)
      slotTime.setHours(h, m, 0, 0)

      if (slotTime.getTime() - now.getTime() >= minAdvanceMs) {
        const tomorrow = new Date(now)
        tomorrow.setDate(now.getDate() + 1)
        tomorrow.setHours(0, 0, 0, 0)

        const today = new Date(now)
        today.setHours(0, 0, 0, 0)

        let nextLabel: string
        if (toDateStr(date) === toDateStr(today)) {
          nextLabel = 'Today'
        } else if (toDateStr(date) === toDateStr(tomorrow)) {
          nextLabel = 'Tomorrow'
        } else {
          nextLabel = formatDateLabel(date)
        }

        return {
          dateLabel: formatDateLabel(date),
          timeLabel: slot.start_time,
          nextLabel,
        }
      }
    }
  }

  return null
}

function slotFromParams(dateParam: string, timeParam: string): NextSlot {
  const d = new Date(dateParam + 'T12:00:00')
  const dateLabel = formatDateLabel(d)

  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  let nextLabel: string
  if (toDateStr(d) === toDateStr(today)) nextLabel = 'Today'
  else if (toDateStr(d) === toDateStr(tomorrow)) nextLabel = 'Tomorrow'
  else nextLabel = dateLabel

  return { dateLabel, timeLabel: timeParam, nextLabel }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BookingCard({ coachId, sports, priceFrom, ratingAvg, ratingCount }: BookingCardProps) {
  const [loading, setLoading] = useState(true)
  const [nextSlot, setNextSlot] = useState<NextSlot | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const paramDate = searchParams.get('date')
    const paramTime = searchParams.get('time')

    if (paramDate && paramTime) {
      setNextSlot(slotFromParams(paramDate, paramTime))
      setLoading(false)
      return
    }

    fetch(`/api/coaches/${coachId}/availability`)
      .then(r => r.ok ? r.json() as Promise<AvailabilityResponse> : null)
      .then(data => {
        if (data) setNextSlot(findNextSlot(data))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [coachId, searchParams])

  const firstSport = sports[0]
  const sessionLabel = firstSport
    ? `${firstSport.session_types[0] === 'group' ? 'Group' : '1-to-1'} · ${firstSport.session_duration_minutes} min`
    : '1-to-1 · 60 min'

  return (
    <div
      className="border border-gray-200 rounded-2xl p-6 shadow-sm"
      data-testid="book-card"
    >
      {/* Price + rating header */}
      <div className="flex items-baseline justify-between gap-2 mb-5">
        <div>
          {priceFrom !== null ? (
            <>
              <span className="text-2xl font-bold text-gray-900">{formatPence(priceFrom)}</span>
              <span className="text-sm text-gray-500 ml-1">/ session</span>
            </>
          ) : (
            <span className="text-sm text-gray-500">Price on request</span>
          )}
        </div>
        {ratingAvg !== null && ratingCount > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-semibold text-gray-900">{ratingAvg.toFixed(1)}</span>
            <span className="text-xs text-gray-500">· {ratingCount}</span>
          </div>
        )}
      </div>

      {/* Session picker */}
      <div className="mb-5 border border-gray-200 rounded-xl overflow-hidden">
        {/* Session row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div>
            <p className="text-[11px] uppercase tracking-wide font-medium text-gray-500">Session</p>
            <p className="text-[15px] font-medium text-gray-900 mt-0.5">{sessionLabel}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        </div>
        {/* Date + Time row */}
        <div className="flex">
          <div className="flex-1 px-4 py-3 border-r border-gray-200">
            <p className="text-[11px] uppercase tracking-wide font-medium text-gray-500">Date</p>
            {loading ? (
              <div className="mt-1.5 h-4 w-20 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className={`text-[15px] font-medium mt-0.5 ${nextSlot ? 'text-gray-900' : 'text-gray-400'}`}>
                {nextSlot ? nextSlot.dateLabel : 'Select date'}
              </p>
            )}
          </div>
          <div className="flex-1 px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide font-medium text-gray-500">Time</p>
            {loading ? (
              <div className="mt-1.5 h-4 w-14 bg-gray-100 rounded animate-pulse" />
            ) : (
              <p className={`text-[15px] font-medium mt-0.5 ${nextSlot ? 'text-gray-900' : 'text-gray-400'}`}>
                {nextSlot ? nextSlot.timeLabel : 'Select time'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* CTA */}
      <Link
        href={`/book/${coachId}`}
        className="flex items-center justify-center w-full h-12 rounded-xl bg-[#0077CC] text-white font-semibold hover:bg-[#005fa3] transition-colors"
        data-testid="desktop-book-cta"
      >
        Book a session
      </Link>

      {/* Next available */}
      {!loading && nextSlot && (
        <p className="mt-3 text-xs text-center text-gray-500">
          Next available: {nextSlot.nextLabel}, {nextSlot.timeLabel}
        </p>
      )}

      <p className="mt-3 text-xs text-center text-gray-400">You won&apos;t be charged yet</p>
    </div>
  )
}
