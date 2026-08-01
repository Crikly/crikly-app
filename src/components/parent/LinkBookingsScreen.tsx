'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Loader2 } from 'lucide-react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import type { GuestBookingMatch } from '@/lib/auth/guest-linking'

// P-04-B (Screen 04, approved design): confirmation screen offering to
// link guest-checkout bookings to the freshly-registered account. Shown
// at most once (the registration path never revisits it). Max 3 bookings
// listed, "+X more" beyond that. Both CTAs land on the dashboard — "Yes"
// via POST /api/auth/link-guest-bookings (server derives everything from
// the session email), "No thanks" without touching anything.

const MAX_LISTED = 3

function formatDate(isoDate: string | null): string | null {
  if (!isoDate) return null
  const date = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Display-only pence → pounds. Never stored back. */
function formatAmount(pence: number): string {
  const pounds = pence / 100
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`
}

interface LinkBookingsScreenProps {
  matches: GuestBookingMatch[]
}

export function LinkBookingsScreen({ matches }: LinkBookingsScreenProps) {
  const router = useRouter()
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const count = matches.length
  const listed = matches.slice(0, MAX_LISTED)
  const overflow = count - listed.length

  const handleLink = async () => {
    if (linking) return
    setError(null)
    setLinking(true)
    try {
      const res = await fetch('/api/auth/link-guest-bookings', { method: 'POST' })
      const data = (await res.json()) as { success: boolean }
      if (!res.ok || !data.success) {
        setError('Could not link your bookings. Please try again.')
        setLinking(false)
        return
      }
      router.push('/parent/dashboard')
    } catch {
      setError('Connection error. Please try again.')
      setLinking(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-5 px-4 py-12 md:px-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50">
        <Calendar size={22} className="text-teal-800" />
      </span>

      <div>
        <h1 className="text-2xl font-bold tracking-heading text-neutral-900">
          We found {count} past {count === 1 ? 'booking' : 'bookings'} with this
          email
        </h1>
        <p className="mt-2 text-base text-neutral-600">
          Link them to your new account and you&apos;ll keep the history,
          receipts and coach details all in one place.
        </p>
      </div>

      <ul className="flex w-full flex-col gap-3" data-testid="guest-booking-list">
        {listed.map((match) => {
          const dateLabel = formatDate(match.sessionDate)
          return (
            <li
              key={match.id}
              className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm"
              data-testid="guest-booking-row"
            >
              <CriklyAvatar
                seed={match.coachName}
                style="personas"
                size={40}
                alt={match.coachName}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-neutral-900">
                  {match.coachName}
                </p>
                <p className="truncate text-sm text-neutral-600">
                  {[dateLabel, match.venueName].filter(Boolean).join(' · ') ||
                    'Booking details'}
                </p>
              </div>
              <span className="flex-shrink-0 text-base font-semibold text-neutral-900">
                {formatAmount(match.amountPaidPence)}
              </span>
            </li>
          )
        })}
      </ul>
      {overflow > 0 && (
        <p className="text-sm font-medium text-neutral-600">
          +{overflow} more
        </p>
      )}

      <p className="text-sm text-neutral-400">
        Matched on the email address you just registered with. Nothing is
        shared with your coaches.
      </p>

      {error && (
        <div
          role="alert"
          className="w-full rounded-lg bg-danger/10 px-3.5 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={handleLink}
          disabled={linking}
          data-testid="link-bookings-yes"
          className="flex h-btn-mobile w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-base font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {linking && <Loader2 size={16} className="animate-spin" />}
          {linking ? 'Linking…' : 'Yes, link my bookings'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/parent/dashboard')}
          disabled={linking}
          data-testid="link-bookings-no"
          className="flex h-btn-mobile w-full items-center justify-center rounded-md text-base font-medium text-brand-600 shadow-[inset_0_0_0_1.5px_currentColor] transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-70"
        >
          No thanks, start fresh
        </button>
      </div>
    </div>
  )
}
