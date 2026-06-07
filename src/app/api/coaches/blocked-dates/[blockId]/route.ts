import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

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
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

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
