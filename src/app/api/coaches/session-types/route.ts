import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

/**
 * Session type response
 * Note: Actual schema uses coach_sport_id and separate price columns
 */
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
 * GET /api/coaches/session-types
 * 
 * Returns all session types for the authenticated coach.
 * Optional filter: ?sport_id=uuid
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<{ session_types: SessionTypeResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const sportIdFilter = searchParams.get('sport_id')
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Get coach's sport IDs first
    const { data: coachSports, error: sportsError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('coach_profile_id', coachProfile.id)

    if (sportsError) {
      console.error('[GET /api/coaches/session-types] coach sports fetch error:', sportsError)
      return NextResponse.json({ error: 'Failed to fetch coach sports' }, { status: 500 })
    }

    // Return empty array if coach has no sports configured yet (valid state)
    if (!coachSports || coachSports.length === 0) {
      return NextResponse.json({ session_types: [] }, { status: 200 })
    }

    const coachSportIds = coachSports.map(cs => cs.id)

    // 5. Query coach_session_types using .in() on coach_sport_id
    // AF-C-19: join through coach_sports → sports for real sport_id + sport_name
    const { data: sessionTypes, error: typesError } = await supabase
      .from('coach_session_types')
      .select(`
        id,
        coach_sport_id,
        duration_minutes,
        price_individual_pence,
        price_group_pence,
        currency,
        is_active,
        created_at,
        coach_sports!inner(
          sport_id
        )
      `)
      .in('coach_sport_id', coachSportIds)
      .eq('is_active', true)
      .order('duration_minutes', { ascending: true })

    if (typesError) {
      console.error('[GET /api/coaches/session-types] fetch error:', typesError)
      return NextResponse.json({ error: 'Failed to fetch session types' }, { status: 500 })
    }

    // Fix-SESSION-01: coach_sports.sport_id has no FK to sports, so a nested
    // PostgREST join (sports!inner) can't resolve (PGRST200). Resolve sport
    // names in a separate query keyed by sport_id (mirrors Fix-16d / Fix-65-1).
    const sportIds = [...new Set(
      (sessionTypes || []).map((t) => {
        const cs = Array.isArray(t.coach_sports) ? t.coach_sports[0] : t.coach_sports
        return cs?.sport_id
      }).filter((id): id is string => typeof id === 'string')
    )]
    const sportNameById = new Map<string, string>()
    if (sportIds.length > 0) {
      const { data: sportsData } = await supabase
        .from('sports')
        .select('id, name')
        .in('id', sportIds)
      for (const s of sportsData ?? []) sportNameById.set(s.id, s.name)
    }

    // 6. Build response and apply sport filter if needed
    const response: SessionTypeResponse[] = (sessionTypes || []).map((type) => {
      const coachSportData = Array.isArray(type.coach_sports) ? type.coach_sports[0] : type.coach_sports
      const sportId = coachSportData?.sport_id ?? ''
      return {
        id: type.id,
        coach_sport_id: type.coach_sport_id,
        sport_id: sportId,
        sport_name: sportNameById.get(sportId) ?? '',
        duration_minutes: type.duration_minutes,
        price_individual_pence: type.price_individual_pence,
        price_group_pence: type.price_group_pence,
        currency: type.currency,
        is_active: type.is_active,
        created_at: type.created_at,
      }
    })
    .filter((type) => {
      if (sportIdFilter) {
        return type.sport_id === sportIdFilter
      }
      return true
    })

    return NextResponse.json({ session_types: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/session-types]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/session-types
 * 
 * Create a new session type variant.
 * Note: Actual schema uses coach_sport_id and separate price columns
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<SessionTypeResponse | { error: string; details?: unknown }>> {
  try {
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (!body.sport_id || typeof body.sport_id !== 'string') {
      validationErrors.push('sport_id is required and must be a string')
    }

    if (!body.duration_minutes || typeof body.duration_minutes !== 'number') {
      validationErrors.push('duration_minutes is required and must be a number')
    } else if (body.duration_minutes < 15 || body.duration_minutes > 480) {
      validationErrors.push('duration_minutes must be between 15 and 480')
    }

    // Validate price fields based on session type
    if (body.session_type === 'individual') {
      if (!body.price_pence || typeof body.price_pence !== 'number') {
        validationErrors.push('price_pence is required for individual sessions')
      } else if (body.price_pence < 100) {
        validationErrors.push('price_pence must be at least 100 (£1.00)')
      }
    } else if (body.session_type === 'group') {
      if (!body.price_pence || typeof body.price_pence !== 'number') {
        validationErrors.push('price_pence is required for group sessions')
      } else if (body.price_pence < 100) {
        validationErrors.push('price_pence must be at least 100 (£1.00)')
      }
    } else {
      validationErrors.push('session_type must be either "individual" or "group"')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. Verify sport_id is in coach's configured sports and get coach_sport_id
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id, sport_id')
      .eq('coach_profile_id', coachProfile.id)
      .eq('sport_id', body.sport_id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json(
        { error: 'Sport not configured. Add it in My Profile → Sports first.' },
        { status: 400 }
      )
    }

    // 6. Check for duplicate (same coach_sport_id + duration)
    const { data: existingType, error: duplicateError } = await supabase
      .from('coach_session_types')
      .select('id')
      .eq('coach_sport_id', coachSport.id)
      .eq('duration_minutes', body.duration_minutes)
      .single()

    if (existingType && !duplicateError) {
      return NextResponse.json(
        { error: 'A session type with this duration already exists for this sport' },
        { status: 409 }
      )
    }

    // 7. Insert new session type
    const insertData: {
      coach_sport_id: string
      duration_minutes: number
      price_individual_pence?: number | null
      price_group_pence?: number | null
      currency: string
    } = {
      coach_sport_id: coachSport.id,
      duration_minutes: body.duration_minutes,
      currency: 'GBP',
    }

    // Set price based on session type
    if (body.session_type === 'individual') {
      insertData.price_individual_pence = body.price_pence
      insertData.price_group_pence = null
    } else {
      insertData.price_group_pence = body.price_pence
      insertData.price_individual_pence = null
    }

    const { data: newType, error: insertError } = await supabase
      .from('coach_session_types')
      .insert(insertData)
      .select(`
        id,
        coach_sport_id,
        duration_minutes,
        price_individual_pence,
        price_group_pence,
        currency,
        is_active,
        created_at
      `)
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/session-types] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create session type' }, { status: 500 })
    }

    // 8. Build response — Fix-SESSION-01: fetch sport name separately (no
    // coach_sports → sports FK for a nested join).
    const { data: sportRow } = await supabase
      .from('sports')
      .select('name')
      .eq('id', coachSport.sport_id)
      .single()

    const response: SessionTypeResponse = {
      id: newType.id,
      coach_sport_id: newType.coach_sport_id,
      sport_id: coachSport.sport_id,
      sport_name: sportRow?.name || '',
      duration_minutes: newType.duration_minutes,
      price_individual_pence: newType.price_individual_pence,
      price_group_pence: newType.price_group_pence,
      currency: newType.currency,
      is_active: newType.is_active,
      created_at: newType.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/session-types]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
