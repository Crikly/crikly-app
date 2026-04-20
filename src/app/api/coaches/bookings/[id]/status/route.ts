import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── PATCH /api/coaches/bookings/[id]/status ──────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient()
  const { id: bookingId } = await params

  // 1. Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // 2. user_profiles
  const { data: userProfile, error: upError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (upError || !userProfile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
  }

  // 3. Coach role check
  const { data: roleRow, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
    .eq('role', 'coach')
    .single()
  if (roleError || !roleRow) {
    return NextResponse.json({ error: 'Forbidden: coach role required' }, { status: 403 })
  }

  // 4. coach_profiles
  const { data: coachProfile, error: cpError } = await supabase
    .from('coach_profiles')
    .select('id')
    .eq('user_profile_id', userProfile.id)
    .single()
  if (cpError || !coachProfile) {
    return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
  }

  // 5. Parse + validate body
  let body: { action?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { action, reason } = body
  if (action !== 'approve' && action !== 'decline') {
    return NextResponse.json(
      { error: 'Validation failed', details: ['action must be "approve" or "decline"'] },
      { status: 400 },
    )
  }

  // 6. Fetch booking — must belong to this coach
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('id, status, coach_profile_id')
    .eq('id', bookingId)
    .eq('coach_profile_id', coachProfile.id)
    .is('deleted_at', null)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // 7. Guard — must be pending_approval to act on
  if (booking.status !== 'pending_approval') {
    return NextResponse.json(
      { error: 'Conflict: booking is not in pending_approval status', current_status: booking.status },
      { status: 409 },
    )
  }

  // 8. Apply action
  const now = new Date().toISOString()
  const updatePayload =
    action === 'approve'
      ? { status: 'confirmed', updated_at: now }
      : {
          status: 'cancelled_coach',
          cancelled_at: now,
          cancelled_by: 'coach' as string,
          cancellation_reason: reason ?? null,
          updated_at: now,
        }

  const { error: updateError } = await supabase
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update booking status' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    booking_id: bookingId,
    new_status: updatePayload.status,
  })
}
