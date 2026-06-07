import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface SessionTypeResponse {
  id: string
  duration_minutes: number
  price_individual_pence: number | null
  price_group_pence: number | null
  currency: string
  is_active: boolean
}

/**
 * PATCH /api/coaches/sports/[sportId]/session-types/[typeId]
 * 
 * Update a session type variant.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sportId: string; typeId: string }> }
): Promise<NextResponse<SessionTypeResponse | { error: string; details?: unknown }>> {
  try {
    const { sportId, typeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns the sport
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json({ error: 'Sport not found or access denied' }, { status: 404 })
    }

    // 5. Verify session type exists and belongs to this sport
    const { data: existingType, error: typeCheckError } = await supabase
      .from('coach_session_types')
      .select('id')
      .eq('id', typeId)
      .eq('coach_sport_id', sportId)
      .single()

    if (typeCheckError || !existingType) {
      return NextResponse.json({ error: 'Session type not found or access denied' }, { status: 404 })
    }

    // 6. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.duration_minutes !== undefined) {
      if (typeof body.duration_minutes !== 'number' || body.duration_minutes < 15 || body.duration_minutes > 480) {
        validationErrors.push('duration_minutes must be a number between 15 and 480')
      }
    }

    if (body.price_individual_pence !== undefined && body.price_individual_pence !== null) {
      if (typeof body.price_individual_pence !== 'number' || body.price_individual_pence < 100) {
        validationErrors.push('price_individual_pence must be a number >= 100 (£1.00)')
      }
    }

    if (body.price_group_pence !== undefined && body.price_group_pence !== null) {
      if (typeof body.price_group_pence !== 'number' || body.price_group_pence < 100) {
        validationErrors.push('price_group_pence must be a number >= 100 (£1.00)')
      }
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        validationErrors.push('is_active must be a boolean')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 7. Build update object
    const updateData: {
      duration_minutes?: number
      price_individual_pence?: number | null
      price_group_pence?: number | null
      is_active?: boolean
    } = {}

    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.price_individual_pence !== undefined) updateData.price_individual_pence = body.price_individual_pence
    if (body.price_group_pence !== undefined) updateData.price_group_pence = body.price_group_pence
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    // 8. Update session type
    const { data: updatedType, error: updateError } = await supabase
      .from('coach_session_types')
      .update(updateData)
      .eq('id', typeId)
      .eq('coach_sport_id', sportId)
      .select('id, duration_minutes, price_individual_pence, price_group_pence, currency, is_active')
      .single()

    if (updateError) {
      // Check for unique constraint violation
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'Session type with this duration already exists' }, { status: 409 })
      }
      console.error('[PATCH /api/coaches/sports/[sportId]/session-types/[typeId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update session type' }, { status: 500 })
    }

    const response: SessionTypeResponse = {
      id: updatedType.id,
      duration_minutes: updatedType.duration_minutes,
      price_individual_pence: updatedType.price_individual_pence,
      price_group_pence: updatedType.price_group_pence,
      currency: updatedType.currency,
      is_active: updatedType.is_active,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/sports/[sportId]/session-types/[typeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/sports/[sportId]/session-types/[typeId]
 * 
 * Soft deactivation — sets is_active = false.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sportId: string; typeId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { sportId, typeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns the sport
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json({ error: 'Sport not found or access denied' }, { status: 404 })
    }

    // 5. Verify session type exists and belongs to this sport
    const { data: existingType, error: typeCheckError } = await supabase
      .from('coach_session_types')
      .select('id')
      .eq('id', typeId)
      .eq('coach_sport_id', sportId)
      .single()

    if (typeCheckError || !existingType) {
      return NextResponse.json({ error: 'Session type not found or access denied' }, { status: 404 })
    }

    // 6. Soft delete — set is_active = false
    const { error: deleteError } = await supabase
      .from('coach_session_types')
      .update({ is_active: false })
      .eq('id', typeId)
      .eq('coach_sport_id', sportId)

    if (deleteError) {
      console.error('[DELETE /api/coaches/sports/[sportId]/session-types/[typeId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to deactivate session type' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/sports/[sportId]/session-types/[typeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
