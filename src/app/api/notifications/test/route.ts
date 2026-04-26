import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crikly.app'

export async function POST(request: Request) {
  // Check key at request time — not at module load (avoids build-time throw)
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY is not configured' },
      { status: 500 },
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { type?: string }
  const type = body?.type

  if (type !== 'booking_confirmation' && type !== 'new_booking') {
    return NextResponse.json(
      { error: 'type must be "booking_confirmation" or "new_booking"' },
      { status: 400 },
    )
  }

  // Dynamic import keeps @/lib/resend/emails out of the module-evaluation
  // graph so its RESEND_API_KEY check only runs when this route is called.
  const { sendBookingConfirmationToParent, sendNewBookingToCoach } =
    await import('@/lib/resend/emails')

  const dummyRef = 'CRK-TEST-001'
  const dummyDate = '26 Apr 2026'
  const dummyTime = '10:00 – 11:00'

  if (type === 'booking_confirmation') {
    await sendBookingConfirmationToParent({
      parentEmail: user.email,
      parentName: 'Test Parent',
      coachName: 'Test Coach',
      sport: 'Cricket',
      sessionDate: dummyDate,
      sessionTime: dummyTime,
      totalPricePence: 5500,
      bookingReference: dummyRef,
      coachProfileUrl: `${APP_URL}/coaches/test`,
    })
  } else {
    await sendNewBookingToCoach({
      coachEmail: user.email,
      coachName: 'Test Coach',
      parentName: 'Test Parent',
      sport: 'Cricket',
      sessionDate: dummyDate,
      sessionTime: dummyTime,
      coachPricePence: 5000,
      bookingReference: dummyRef,
      dashboardUrl: `${APP_URL}/coach/dashboard`,
    })
  }

  return NextResponse.json({ success: true, sentTo: user.email, type })
}
