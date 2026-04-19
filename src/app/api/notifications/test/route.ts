import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  sendBookingConfirmationToParent,
  sendNewBookingToCoach,
} from '@/lib/resend/emails'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crikly.app'

export async function POST(request: Request) {
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
