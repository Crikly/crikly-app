import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

/**
 * Enrolment response
 */
interface EnrolmentResponse {
  id: string
  booked_by_user_id: string
  booker_name: string
  child_name: string | null
  player_name: string | null
  payment_type: string
  status: string
  created_at: string
}

/**
 * GET /api/coaches/programmes/[programmeId]/enrolments
 * 
 * Returns all enrolments for a programme.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<{ enrolments: EnrolmentResponse[]; total_active: number; total_cancelled: number } | { error: string }>> {
  try {
    const { programmeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this programme
    const { data: programme, error: programmeCheckError } = await supabase
      .from('group_programmes')
      .select('id')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeCheckError || !programme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // 5. Fetch enrolments with user and profile details
    const { data: enrolments, error: enrolmentsError } = await supabase
      .from('group_programme_enrolments')
      .select(`
        id,
        booked_by_user_id,
        payment_type,
        status,
        created_at,
        user_profiles!group_programme_enrolments_booked_by_user_id_fkey (
          full_name
        ),
        child_profiles (
          full_name
        ),
        player_profiles (
          full_name
        )
      `)
      .eq('programme_id', programmeId)
      .order('created_at', { ascending: false })

    if (enrolmentsError) {
      console.error('[GET /api/coaches/programmes/[programmeId]/enrolments] fetch error:', enrolmentsError)
      return NextResponse.json({ error: 'Failed to fetch enrolments' }, { status: 500 })
    }

    // 6. Build response
    const enrolmentsList: EnrolmentResponse[] = (enrolments || []).map((enrol) => {
      const bookerData = enrol.user_profiles
        ? (Array.isArray(enrol.user_profiles) ? enrol.user_profiles[0] : enrol.user_profiles)
        : null

      const childData = enrol.child_profiles
        ? (Array.isArray(enrol.child_profiles) ? enrol.child_profiles[0] : enrol.child_profiles)
        : null

      const playerData = enrol.player_profiles
        ? (Array.isArray(enrol.player_profiles) ? enrol.player_profiles[0] : enrol.player_profiles)
        : null

      // Fix-110: schema uses full_name, not first_name + last_name
      const bookerName = bookerData?.full_name ?? 'Unknown'
      const childName = childData?.full_name ?? null
      const playerName = playerData?.full_name ?? null

      return {
        id: enrol.id,
        booked_by_user_id: enrol.booked_by_user_id,
        booker_name: bookerName,
        child_name: childName,
        player_name: playerName,
        payment_type: enrol.payment_type,
        status: enrol.status,
        created_at: enrol.created_at,
      }
    })

    // Calculate totals
    const totalActive = enrolmentsList.filter(e => e.status === 'active').length
    const totalCancelled = enrolmentsList.filter(e => e.status === 'cancelled').length

    return NextResponse.json({
      enrolments: enrolmentsList,
      total_active: totalActive,
      total_cancelled: totalCancelled,
    }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/programmes/[programmeId]/enrolments]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
