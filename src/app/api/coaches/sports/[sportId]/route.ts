import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface CoachSportResponse {
  id: string
  sport_id: string
  sport_name: string
  sport_slug: string
  session_types: string[]
  skill_levels: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
  currency: string
  is_active: boolean
}

/**
 * PATCH /api/coaches/sports/[sportId]
 * 
 * Update an existing coach sport.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sportId: string }> }
): Promise<NextResponse<CoachSportResponse | { error: string; details?: unknown }>> {
  try {
    const { sportId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this sport
    const { data: existingSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id, sport_id')
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (sportCheckError || !existingSport) {
      return NextResponse.json({ error: 'Sport not found or access denied' }, { status: 404 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.session_types !== undefined) {
      if (!Array.isArray(body.session_types) || body.session_types.length === 0) {
        validationErrors.push('session_types must be a non-empty array')
      } else {
        const validSessionTypes = ['individual', 'group', 'both']
        const invalidTypes = body.session_types.filter((t: unknown) => !validSessionTypes.includes(t as string))
        if (invalidTypes.length > 0) {
          validationErrors.push('session_types must only contain: individual, group, both')
        }
      }
    }

    if (body.skill_levels !== undefined) {
      if (!Array.isArray(body.skill_levels) || body.skill_levels.length === 0) {
        validationErrors.push('skill_levels must be a non-empty array')
      } else {
        const validSkillLevels = ['beginner', 'intermediate', 'advanced']
        const invalidLevels = body.skill_levels.filter((l: unknown) => !validSkillLevels.includes(l as string))
        if (invalidLevels.length > 0) {
          validationErrors.push('skill_levels must only contain: beginner, intermediate, advanced')
        }
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

    if (body.max_group_size !== undefined && body.max_group_size !== null) {
      if (typeof body.max_group_size !== 'number' || body.max_group_size < 2 || body.max_group_size > 50) {
        validationErrors.push('max_group_size must be a number between 2 and 50')
      }
    }

    if (body.session_duration_minutes !== undefined) {
      if (typeof body.session_duration_minutes !== 'number' || body.session_duration_minutes < 15) {
        validationErrors.push('session_duration_minutes must be a number >= 15')
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

    // 6. Build update object
    const updateData: {
      session_types?: string[]
      skill_levels?: string[]
      price_individual_pence?: number | null
      price_group_pence?: number | null
      max_group_size?: number | null
      session_duration_minutes?: number
      is_active?: boolean
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.session_types !== undefined) updateData.session_types = body.session_types
    if (body.skill_levels !== undefined) updateData.skill_levels = body.skill_levels
    if (body.price_individual_pence !== undefined) updateData.price_individual_pence = body.price_individual_pence
    if (body.price_group_pence !== undefined) updateData.price_group_pence = body.price_group_pence
    if (body.max_group_size !== undefined) updateData.max_group_size = body.max_group_size
    if (body.session_duration_minutes !== undefined) updateData.session_duration_minutes = body.session_duration_minutes
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    // 7. Update sport
    const { data: updatedSport, error: updateError } = await supabase
      .from('coach_sports')
      .update(updateData)
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .select(`
        id,
        sport_id,
        session_types,
        skill_levels,
        price_individual_pence,
        price_group_pence,
        max_group_size,
        session_duration_minutes,
        currency,
        is_active,
        sports!inner (
          name,
          slug
        )
      `)
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/sports/[sportId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update sport' }, { status: 500 })
    }

    // 8. Build response
    const sportData = Array.isArray(updatedSport.sports) ? updatedSport.sports[0] : updatedSport.sports

    const response: CoachSportResponse = {
      id: updatedSport.id,
      sport_id: updatedSport.sport_id,
      sport_name: sportData.name,
      sport_slug: sportData.slug,
      session_types: updatedSport.session_types,
      skill_levels: updatedSport.skill_levels,
      price_individual_pence: updatedSport.price_individual_pence,
      price_group_pence: updatedSport.price_group_pence,
      max_group_size: updatedSport.max_group_size,
      session_duration_minutes: updatedSport.session_duration_minutes,
      currency: updatedSport.currency,
      is_active: updatedSport.is_active,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/sports/[sportId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/sports/[sportId]
 * 
 * Soft deactivation — sets is_active = false.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sportId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { sportId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this sport
    const { data: existingSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (sportCheckError || !existingSport) {
      return NextResponse.json({ error: 'Sport not found or access denied' }, { status: 404 })
    }

    // 5. Soft delete — set is_active = false
    const { error: deleteError } = await supabase
      .from('coach_sports')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/sports/[sportId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to deactivate sport' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/sports/[sportId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
