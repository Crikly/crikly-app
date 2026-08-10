import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findGuestBookings } from '@/lib/auth/guest-linking'

// P-04-B: fired by TermsAcceptanceForm right after a new parent/player
// accepts terms — answers "does this account's email have unclaimed guest
// bookings?". Returns only a count: the linking screen
// (/parent/link-bookings) re-derives full details server-side. The email
// is ALWAYS the verified session email — nothing client-supplied.
//
// Failure policy: this endpoint sits on the registration path, so any
// error (Stripe down, DB blip) degrades to count 0 — the user proceeds to
// the dashboard and the linking offer is simply not made. Never block
// auth on Stripe availability.

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in.' } },
      { status: 401 },
    )
  }

  if (!user.email) {
    return NextResponse.json({ success: true, count: 0 })
  }

  try {
    const scan = await findGuestBookings(user.email)
    return NextResponse.json({ success: true, count: scan.matches.length })
  } catch (error) {
    console.error('[guest-bookings] scan failed:', error)
    return NextResponse.json({ success: true, count: 0 })
  }
}
