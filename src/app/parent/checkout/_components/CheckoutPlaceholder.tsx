'use client'

// P-10 fix 5: MINIMAL placeholder for /parent/checkout — replaced entirely
// by P-13. Shows the held booking's summary (slot facts from the URL, player
// names from the sessionStorage hold — identities never ride URLs, docs/06)
// and says plainly that payment is still being built. No POST, no Stripe,
// no booking row is ever created from this page.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, Calendar, Clock, Users } from 'lucide-react'
import { readBookingHold, type AuthedBookingHold } from '@/lib/booking/authed-booking-handoff'
import { formatPlayersLabel } from '@/lib/booking/participants'

function formatDateLabel(dateISO: string | null): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return 'Date to be selected'
  const d = new Date(`${dateISO}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 'Date to be selected'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTimeLabel(hhmm: string | null): string {
  const m = hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm) : null
  if (!m) return 'Time to be selected'
  const h = Number(m[1])
  if (h > 23) return 'Time to be selected'
  const period = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]}${period}`
}

export function CheckoutPlaceholder() {
  const searchParams = useSearchParams()
  const coachId = searchParams.get('coachId')
  const date = searchParams.get('date')
  const startTime = searchParams.get('startTime')
  const players = searchParams.get('players')

  // sessionStorage is browser-only — read after mount. The read happens in a
  // microtask so the effect never calls setState synchronously (React
  // Compiler lint rule) and the hydration output stays stable.
  const [hold, setHold] = useState<AuthedBookingHold | null>(null)
  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setHold(readBookingHold())
    })
    return () => {
      cancelled = true
    }
  }, [])

  const playersLabel =
    hold?.playerAssignments && hold.playerAssignments.length > 0
      ? formatPlayersLabel(hold.playerAssignments.map((p) => p.firstName))
      : ''
  const playerCount = Number.parseInt(players ?? '', 10)
  const backHref = coachId ? `/coaches/${coachId}/availability` : '/coaches'

  return (
    <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-6">
      <Link
        href={backHref}
        data-testid="checkout-back-link"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </Link>

      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Booking summary</h1>

      <div
        className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-200 p-5 shadow-sm"
        data-testid="checkout-placeholder-summary"
      >
        <div className="flex items-center gap-2.5">
          <Calendar size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-[14.5px] text-neutral-900">{formatDateLabel(date)}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Clock size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-[14.5px] text-neutral-900">{formatTimeLabel(startTime)}</span>
        </div>
        {(playersLabel || Number.isInteger(playerCount)) && (
          <div className="flex items-center gap-2.5">
            <Users size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
            <span className="text-[14.5px] text-neutral-900">
              {playersLabel
                ? `For ${playersLabel}`
                : `${playerCount} ${playerCount === 1 ? 'player' : 'players'}`}
            </span>
          </div>
        )}
      </div>

      <p
        className="mt-5 rounded-xl bg-brand-50 px-4 py-3 text-[14px] font-medium text-brand-800"
        role="status"
        data-testid="checkout-coming-soon"
      >
        Payment coming soon — this step is being built.
      </p>
    </main>
  )
}
