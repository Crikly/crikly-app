import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type BookingRow = Database['public']['Tables']['bookings']['Row']
type UserProfileRow = Database['public']['Tables']['user_profiles']['Row']
type ChildProfileRow = Database['public']['Tables']['child_profiles']['Row']
type SessionNoteRow = Database['public']['Tables']['session_notes']['Row']

// Service-role client for auth.users email lookup.
// user_profiles RLS is "own record only" — service role bypasses it safely
// since we only read name and then use admin.getUserById for email.
const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── GET /api/coaches/bookings/[id] ──────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

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

  // 5. Booking — must belong to this coach
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('coach_profile_id', coachProfile.id)
    .is('deleted_at', null)
    .single()
  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }
  const b = booking as BookingRow

  // 6. Booker's user_profile (name) via admin client — RLS blocks server client here
  const { data: bookerProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('id, full_name, auth_user_id')
    .eq('id', b.booked_by_user_id)
    .single()

  // 7. Booker email via admin auth API
  let bookedByEmail: string | null = null
  if (bookerProfile?.auth_user_id) {
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(
      bookerProfile.auth_user_id,
    )
    bookedByEmail = authUser?.user?.email ?? null
  }

  // 8. Child profile (if applicable)
  let childProfile: Pick<ChildProfileRow, 'id' | 'full_name' | 'date_of_birth'> | null = null
  if (b.child_profile_id) {
    const { data: cp } = await supabase
      .from('child_profiles')
      .select('id, full_name, date_of_birth')
      .eq('id', b.child_profile_id)
      .single()
    childProfile = (cp as Pick<ChildProfileRow, 'id' | 'full_name' | 'date_of_birth'> | null)
  }

  // 9. Session note (if exists)
  const { data: sessionNote } = await supabase
    .from('session_notes')
    .select('id, notes, is_shared_with_parent, updated_at')
    .eq('booking_id', b.id)
    .maybeSingle()
  const note = sessionNote as Pick<SessionNoteRow, 'id' | 'notes' | 'is_shared_with_parent' | 'updated_at'> | null

  return NextResponse.json({
    id: b.id,
    booking_reference: b.booking_reference,
    session_date: b.session_date,
    session_start_time: b.session_start_time,
    session_end_time: b.session_end_time,
    session_type: b.session_type,
    status: b.status,
    sport_id: b.sport_id,
    coach_price_pence: b.coach_price_pence,
    commission_pence: b.commission_pence,
    commission_rate: b.commission_rate,
    parent_total_pence: b.parent_total_pence,
    currency: b.currency,
    messaging_unlocked: b.messaging_unlocked,
    cancellation_window_hours: b.cancellation_window_hours,
    cancelled_at: b.cancelled_at,
    cancelled_by: b.cancelled_by,
    cancellation_reason: b.cancellation_reason,
    completed_at: b.completed_at,
    notes_for_coach: b.notes_for_coach,
    created_at: b.created_at,
    venue: b.venue_name
      ? {
          id: b.venue_id,
          name: b.venue_name,
          address: b.venue_address ?? null,
        }
      : null,
    booker: {
      user_profile_id: b.booked_by_user_id,
      full_name: (bookerProfile as Pick<UserProfileRow, 'full_name'> | null)?.full_name ?? null,
      email: bookedByEmail,
    },
    child: childProfile,
    session_note: note
      ? {
          id: note.id,
          notes: note.notes,
          is_shared_with_parent: note.is_shared_with_parent,
          updated_at: note.updated_at,
        }
      : null,
  })
}
