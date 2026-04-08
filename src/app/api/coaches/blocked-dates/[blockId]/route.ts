import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/coaches/blocked-dates/[blockId]
 * 
 * Hard delete a blocked date/range.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ blockId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { blockId } = await params
    const supabase = await createClient()
    
    // 1. Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Get user profile and check coach role
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { data: roleCheck, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_profile_id', userProfile.id)
      .eq('role', 'coach')
      .single()

    if (roleError || !roleCheck) {
      return NextResponse.json({ error: 'Forbidden — coach role required' }, { status: 403 })
    }

    // 3. Get coach profile
    const { data: coachProfile, error: coachError } = await supabase
      .from('coach_profiles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .single()

    if (coachError || !coachProfile) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
    }

    // 4. Verify coach owns this blocked date
    const { data: existingBlock, error: blockCheckError } = await supabase
      .from('blocked_dates')
      .select('id')
      .eq('id', blockId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (blockCheckError || !existingBlock) {
      return NextResponse.json({ error: 'Blocked date not found or access denied' }, { status: 404 })
    }

    // 5. Delete blocked date
    const { error: deleteError } = await supabase
      .from('blocked_dates')
      .delete()
      .eq('id', blockId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/blocked-dates/[blockId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete blocked date' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/blocked-dates/[blockId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
