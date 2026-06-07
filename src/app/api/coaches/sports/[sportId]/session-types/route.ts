import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

/**
 * Session type variant response
 * Note: Using actual schema from Migration 014a
 */
interface SessionTypeResponse {
  id: string
  duration_minutes: number
  price_individual_pence: number | null
  price_group_pence: number | null
  currency: string
  is_active: boolean
}

/**
 * GET /api/coaches/sports/[sportId]/session-types
 * 
 * Returns all session type variants for a specific sport.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sportId: string }> }
): Promise<NextResponse<{ session_types: SessionTypeResponse[] } | { error: string }>> {
  try {
    const { sportId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this sport
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json({ error: 'Sport not found or access denied' }, { status: 404 })
    }

    // 5. Fetch session types for this sport
    const { data: sessionTypes, error: typesError } = await supabase
      .from('coach_session_types')
      .select('id, duration_minutes, price_individual_pence, price_group_pence, currency, is_active')
      .eq('coach_sport_id', sportId)

    if (typesError) {
      console.error('[GET /api/coaches/sports/[sportId]/session-types] fetch error:', typesError)
      return NextResponse.json({ error: 'Failed to fetch session types' }, { status: 500 })
    }

    const response: SessionTypeResponse[] = (sessionTypes || []).map((st) => ({
      id: st.id,
      duration_minutes: st.duration_minutes,
      price_individual_pence: st.price_individual_pence,
      price_group_pence: st.price_group_pence,
      currency: st.currency,
      is_active: st.is_active,
    }))

    return NextResponse.json({ session_types: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/sports/[sportId]/session-types]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/sports/[sportId]/session-types
 * 
 * Create a new session type variant for a sport.
 * Note: Using Migration 014a schema (price_individual_pence + price_group_pence)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sportId: string }> }
): Promise<NextResponse<SessionTypeResponse | { error: string; details?: unknown }>> {
  try {
    const { sportId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this sport
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('id', sportId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json({ error: 'Sport not found or access denied' }, { status: 404 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.duration_minutes === undefined || body.duration_minutes === null) {
      validationErrors.push('duration_minutes is required')
    } else if (typeof body.duration_minutes !== 'number' || body.duration_minutes < 15 || body.duration_minutes > 480) {
      validationErrors.push('duration_minutes must be a number between 15 and 480')
    }

    // At least one price must be provided
    if ((body.price_individual_pence === undefined || body.price_individual_pence === null) &&
        (body.price_group_pence === undefined || body.price_group_pence === null)) {
      validationErrors.push('At least one of price_individual_pence or price_group_pence is required')
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

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 6. Insert session type
    const { data: newType, error: insertError } = await supabase
      .from('coach_session_types')
      .insert({
        coach_sport_id: sportId,
        duration_minutes: body.duration_minutes,
        price_individual_pence: body.price_individual_pence || null,
        price_group_pence: body.price_group_pence || null,
      })
      .select('id, duration_minutes, price_individual_pence, price_group_pence, currency, is_active')
      .single()

    if (insertError) {
      // Check for unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'Session type with this duration already exists' }, { status: 409 })
      }
      console.error('[POST /api/coaches/sports/[sportId]/session-types] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create session type' }, { status: 500 })
    }

    const response: SessionTypeResponse = {
      id: newType.id,
      duration_minutes: newType.duration_minutes,
      price_individual_pence: newType.price_individual_pence,
      price_group_pence: newType.price_group_pence,
      currency: newType.currency,
      is_active: newType.is_active,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/sports/[sportId]/session-types]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
