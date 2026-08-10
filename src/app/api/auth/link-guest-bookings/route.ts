import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findGuestBookings } from '@/lib/auth/guest-linking'

// P-04-B: "Yes, link my bookings" on Screen 04. The request carries NO
// body — every argument is derived server-side: the verified session
// email selects the provisional profiles (via the same Stripe-metadata
// match the screen was rendered from), and the atomic transfer runs in
// the link_provisional_bookings SECURITY DEFINER RPC (migration 052) via
// the service-role client. RLS makes provisional rows unreachable to the
// caller's own client by design.

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not signed in.' } },
      { status: 401 },
    )
  }

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, is_provisional')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile || profile.is_provisional) {
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Account not ready.' } },
        { status: 500 },
      )
    }

    const scan = await findGuestBookings(user.email)
    if (scan.provisionalProfileIds.length === 0) {
      return NextResponse.json({ success: true, bookings: 0, enrolments: 0 })
    }

    const admin = createAdminClient()
    const { data: result, error: rpcError } = await admin.rpc(
      'link_provisional_bookings',
      {
        p_target_profile_id: profile.id,
        p_provisional_profile_ids: scan.provisionalProfileIds,
      },
    )
    if (rpcError) throw rpcError

    const counts = (result ?? {}) as { bookings?: number; enrolments?: number }
    return NextResponse.json({
      success: true,
      bookings: counts.bookings ?? 0,
      enrolments: counts.enrolments ?? 0,
    })
  } catch (error) {
    console.error('[link-guest-bookings] link failed:', error)
    return NextResponse.json(
      { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not link bookings. Please try again.' } },
      { status: 500 },
    )
  }
}
