import type { Metadata } from 'next'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { GuestBookingFlow, type GuestCheckoutParams } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

export const metadata: Metadata = {
  title: 'Complete your booking · Crikly',
  description: 'Review your coaching session and pay securely.',
}

// TODO(P-00c-FE): replace the descriptive fields (coachName, sport, date/time
// labels) with a server fetch keyed on coachId + slot. The MONEY fields below are
// driven by the `price` query param and re-verified server-side against
// coach_sports in POST /api/guest/bookings (anti-tampering, BR-01).
const STUB_SUMMARY: Omit<BookingSummary, 'sessionFeePence' | 'platformFeePence'> = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
}

// Fallback coach price (pence) used only when the page is opened without a
// `price` query param (e.g. local UI preview). Real bookings always arrive with
// the slot params from the availability page.
const FALLBACK_PRICE_PENCE = 4000
// TODO(P-00c-COMMISSION-DISPLAY): fetch the rate from platform_config so the
// displayed fee matches the charged amount. Today this is BR-02's default for
// DISPLAY ONLY — the server re-reads platform_config and is authoritative, so an
// admin changing the rate would make this label diverge from the real charge.
const COMMISSION_RATE = 0.1

type CheckoutError = 'payment' | 'slot_taken'

function parseSimulatedError(value: string | string[] | undefined): CheckoutError | undefined {
  if (value === 'payment' || value === 'slot_taken') return value
  return undefined
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parsePricePence(value: string | string[] | undefined): number {
  const raw = firstParam(value)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : FALLBACK_PRICE_PENCE
}

function parseSessionType(value: string | string[] | undefined): 'individual' | 'group' {
  return firstParam(value) === 'group' ? 'group' : 'individual'
}

export default async function GuestBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { coachId } = await params
  const sp = await searchParams

  const pricePence = parsePricePence(sp.price)
  const platformFeePence = Math.round(pricePence * COMMISSION_RATE)

  const summary: BookingSummary = {
    ...STUB_SUMMARY,
    sessionFeePence: pricePence,
    platformFeePence,
  }

  const checkout: GuestCheckoutParams = {
    coachId,
    sportId: firstParam(sp.sportId) ?? '',
    sessionType: parseSessionType(sp.sessionType),
    date: firstParam(sp.date) ?? '',
    startTime: firstParam(sp.startTime) ?? '',
    pricePence,
  }

  return (
    <main className="min-h-screen bg-white">
      <PublicHeader />
      <div className="mx-auto w-full max-w-6xl px-5 py-5 lg:px-10 lg:pt-6 lg:pb-14">
        <GuestBookingFlow
          coachId={coachId}
          summary={summary}
          checkout={checkout}
          initialError={parseSimulatedError(firstParam(sp.simulateError))}
        />
      </div>
    </main>
  )
}
