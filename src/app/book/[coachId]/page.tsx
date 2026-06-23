import type { Metadata } from 'next'
import { GuestBookingFlow } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

export const metadata: Metadata = {
  title: 'Complete your booking · Crikly',
  description: 'Review your coaching session and pay securely.',
}

// STUB — replaced with the real coach profile and the slot the guest selected
// on the availability page in P-00c-API. Money is integer pence (BR-10); the
// platform fee is added on top of the coach fee at 10% (BR-01, BR-02).
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
  return value === 'payment' || value === 'slot_taken' ? value : undefined
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
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto w-full max-w-md px-4 py-8 md:py-12">
        <GuestBookingFlow
          coachId={coachId}
          summary={STUB_SUMMARY}
          initialError={parseSimulatedError(simulateError)}
        />
      </div>
    </main>
  )
}
