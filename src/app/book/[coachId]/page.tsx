import type { Metadata } from 'next'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { GuestBookingFlow } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

export const metadata: Metadata = {
  title: 'Complete your booking · Crikly',
  description: 'Review your coaching session and pay securely.',
}

// TODO(P-00c-API): replace with server fetch using coachId + slot params.
const STUB_SUMMARY: BookingSummary = {
  coachName: 'Alex Stuart',
  sportLabel: 'Cricket',
  sessionDate: 'Saturday, 27 June',
  sessionTime: '10:00am · 60 minutes',
  sessionType: '1-to-1 technical session',
  sessionFeePence: 4000,
  platformFeePence: 400,
}

type CheckoutError = 'payment' | 'slot_taken'

function parseSimulatedError(value: string | string[] | undefined): CheckoutError | undefined {
  if (value === 'payment' || value === 'slot_taken') return value
  return undefined
}

export default async function GuestBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { coachId } = await params
  const { simulateError } = await searchParams

  return (
    <main className="min-h-screen bg-white">
      <PublicHeader />
      <div className="mx-auto w-full max-w-6xl px-5 py-5 lg:px-10 lg:pt-6 lg:pb-14">
        <GuestBookingFlow
          coachId={coachId}
          summary={STUB_SUMMARY}
          initialError={parseSimulatedError(simulateError)}
        />
      </div>
    </main>
  )
}
