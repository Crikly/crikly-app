import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface SessionTypeResponse {
  id: string
  coach_sport_id: string
  sport_id: string
  sport_name: string
  duration_minutes: number
  price_individual_pence: number | null
  price_group_pence: number | null
  currency: string
  is_active: boolean
  created_at: string
}

/**
 * PATCH /api/coaches/session-types/[typeId]
 * 
 * Update a session type. Cannot change coach_sport_id.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ typeId: string }> }
): Promise<NextResponse<SessionTypeResponse | { error: string; details?: unknown }>> {
  try {
    const { typeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this session type
    const { data: existingType, error: typeCheckError } = await supabase
      .from('coach_session_types')
      .select(`
        id,
        coach_sport_id,
        duration_minutes,
        coach_sports!inner (
          coach_profile_id
        )
      `)
      .eq('id', typeId)
      .single()

    if (typeCheckError || !existingType) {
      return NextResponse.json({ error: 'Session type not found' }, { status: 404 })
    }

    const coachSportData = existingType.coach_sports
      ? (Array.isArray(existingType.coach_sports) ? existingType.coach_sports[0] : existingType.coach_sports)
      : null

    if (coachSportData?.coach_profile_id !== coachProfile.id) {
      return NextResponse.json({ error: 'Session type does not belong to you' }, { status: 403 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    // Cannot change coach_sport_id or session_type
    if (body.coach_sport_id !== undefined) {
      validationErrors.push('Cannot change coach_sport_id after creation')
    }

    if (body.sport_id !== undefined) {
      validationErrors.push('Cannot change sport_id after creation')
    }

    if (body.session_type !== undefined) {
      validationErrors.push('Cannot change session_type after creation')
    }

    if (body.duration_minutes !== undefined) {
      if (typeof body.duration_minutes !== 'number') {
        validationErrors.push('duration_minutes must be a number')
      } else if (body.duration_minutes < 15 || body.duration_minutes > 480) {
        validationErrors.push('duration_minutes must be between 15 and 480')
      }
    }

    if (body.price_individual_pence !== undefined && body.price_individual_pence !== null) {
      if (typeof body.price_individual_pence !== 'number') {
        validationErrors.push('price_individual_pence must be a number')
      } else if (body.price_individual_pence < 100) {
        validationErrors.push('price_individual_pence must be at least 100 (£1.00)')
      }
    }

    if (body.price_group_pence !== undefined && body.price_group_pence !== null) {
      if (typeof body.price_group_pence !== 'number') {
        validationErrors.push('price_group_pence must be a number')
      } else if (body.price_group_pence < 100) {
        validationErrors.push('price_group_pence must be at least 100 (£1.00)')
      }
    }

    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      validationErrors.push('is_active must be a boolean')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 6. If duration changes, check for duplicates
    if (body.duration_minutes !== undefined && body.duration_minutes !== existingType.duration_minutes) {
      const { data: duplicateType, error: duplicateError } = await supabase
        .from('coach_session_types')
        .select('id')
        .eq('coach_sport_id', existingType.coach_sport_id)
        .eq('duration_minutes', body.duration_minutes)
        .neq('id', typeId)
        .single()

      if (duplicateType && !duplicateError) {
        return NextResponse.json(
          { error: 'A session type with this duration already exists for this sport' },
          { status: 409 }
        )
      }
    }

    // 7. Build update object
    const updateData: {
      duration_minutes?: number
      price_individual_pence?: number | null
      price_group_pence?: number | null
      is_active?: boolean
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.price_individual_pence !== undefined) updateData.price_individual_pence = body.price_individual_pence
    if (body.price_group_pence !== undefined) updateData.price_group_pence = body.price_group_pence
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    // 8. Update session type
    const { data: updatedType, error: updateError } = await supabase
      .from('coach_session_types')
      .update(updateData)
      .eq('id', typeId)
      .select(`
        id,
        coach_sport_id,
        duration_minutes,
        price_individual_pence,
        price_group_pence,
        currency,
        is_active,
        created_at,
        coach_sports!inner (
          sport_id
        )
      `)
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/session-types/[typeId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update session type' }, { status: 500 })
    }

    // 9. Build response — Fix-SESSION-01: fetch sport name separately (no
    // coach_sports → sports FK for a nested join).
    const updatedCoachSportData = updatedType.coach_sports
      ? (Array.isArray(updatedType.coach_sports) ? updatedType.coach_sports[0] : updatedType.coach_sports)
      : null
    const updatedSportId = updatedCoachSportData?.sport_id || ''

    const { data: sportRow } = await supabase
      .from('sports')
      .select('name')
      .eq('id', updatedSportId)
      .single()

    const response: SessionTypeResponse = {
      id: updatedType.id,
      coach_sport_id: updatedType.coach_sport_id,
      sport_id: updatedSportId,
      sport_name: sportRow?.name || '',
      duration_minutes: updatedType.duration_minutes,
      price_individual_pence: updatedType.price_individual_pence,
      price_group_pence: updatedType.price_group_pence,
      currency: updatedType.currency,
      is_active: updatedType.is_active,
      created_at: updatedType.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/session-types/[typeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/session-types/[typeId]
 * 
 * Soft delete — sets is_active = false.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ typeId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { typeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this session type
    const { data: existingType, error: typeCheckError } = await supabase
      .from('coach_session_types')
      .select(`
        id,
        coach_sports!inner (
          coach_profile_id
        )
      `)
      .eq('id', typeId)
      .single()

    if (typeCheckError || !existingType) {
      return NextResponse.json({ error: 'Session type not found' }, { status: 404 })
    }

    const coachSportData = existingType.coach_sports
      ? (Array.isArray(existingType.coach_sports) ? existingType.coach_sports[0] : existingType.coach_sports)
      : null

    if (coachSportData?.coach_profile_id !== coachProfile.id) {
      return NextResponse.json({ error: 'Session type does not belong to you' }, { status: 403 })
    }

    // 5. Soft delete — set is_active = false
    const { error: deleteError } = await supabase
      .from('coach_session_types')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', typeId)

    if (deleteError) {
      console.error('[DELETE /api/coaches/session-types/[typeId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to deactivate session type' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/session-types/[typeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
