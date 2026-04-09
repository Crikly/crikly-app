import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Coach sport with session type variants
 * Note: coach_session_types from Migration 014a has different schema than docs
 */
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
  session_type_variants: Array<{
    id: string
    duration_minutes: number
    price_individual_pence: number | null
    price_group_pence: number | null
    is_active: boolean
  }>
}

/**
 * GET /api/coaches/sports
 * 
 * Returns all sports the authenticated coach has configured.
 */
export async function GET(): Promise<NextResponse<{ sports: CoachSportResponse[] } | { error: string }>> {
  try {
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

    // 4. Fetch coach sports with sport details
    const { data: coachSports, error: sportsError } = await supabase
      .from('coach_sports')
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
      .eq('coach_profile_id', coachProfile.id)

    if (sportsError) {
      console.error('[GET /api/coaches/sports] fetch error:', sportsError)
      return NextResponse.json({ error: 'Failed to fetch sports' }, { status: 500 })
    }

    // 5. Fetch session type variants for all sports
    // Note: coach_session_types links via coach_sport_id, need to get sport IDs first
    const sportIds = (coachSports || []).map(cs => cs.id)
    
    const { data: sessionTypes, error: typesError } = sportIds.length > 0
      ? await supabase
          .from('coach_session_types')
          .select('id, coach_sport_id, duration_minutes, price_individual_pence, price_group_pence, is_active')
          .in('coach_sport_id', sportIds)
      : { data: [], error: null }

    if (typesError) {
      console.error('[GET /api/coaches/sports] session types error:', typesError)
      return NextResponse.json({ error: 'Failed to fetch session types' }, { status: 500 })
    }

    // 6. Build response with nested session types
    const sports: CoachSportResponse[] = (coachSports || []).map((cs) => {
      const sportData = Array.isArray(cs.sports) ? cs.sports[0] : cs.sports
      
      const variants = (sessionTypes || [])
        .filter((st) => st.coach_sport_id === cs.id)
        .map((st) => ({
          id: st.id,
          duration_minutes: st.duration_minutes,
          price_individual_pence: st.price_individual_pence,
          price_group_pence: st.price_group_pence,
          is_active: st.is_active,
        }))

      return {
        id: cs.id,
        sport_id: cs.sport_id,
        sport_name: sportData.name,
        sport_slug: sportData.slug,
        session_types: cs.session_types,
        skill_levels: cs.skill_levels,
        price_individual_pence: cs.price_individual_pence,
        price_group_pence: cs.price_group_pence,
        max_group_size: cs.max_group_size,
        session_duration_minutes: cs.session_duration_minutes,
        currency: cs.currency,
        is_active: cs.is_active,
        session_type_variants: variants,
      }
    })

    return NextResponse.json({ sports }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/sports]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/sports
 * 
 * Add a new sport to the coach's profile.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CoachSportResponse | { error: string; details?: unknown }>> {
  try {
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

    // 4. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (!body.sport_id || typeof body.sport_id !== 'string') {
      validationErrors.push('sport_id is required and must be a string')
    }

    if (!Array.isArray(body.session_types) || body.session_types.length === 0) {
      validationErrors.push('session_types is required and must be a non-empty array')
    } else {
      const validSessionTypes = ['individual', 'group', 'both']
      const invalidTypes = body.session_types.filter((t: unknown) => !validSessionTypes.includes(t as string))
      if (invalidTypes.length > 0) {
        validationErrors.push('session_types must only contain: individual, group, both')
      }
    }

    if (!Array.isArray(body.skill_levels) || body.skill_levels.length === 0) {
      validationErrors.push('skill_levels is required and must be a non-empty array')
    } else {
      const validSkillLevels = ['beginner', 'intermediate', 'advanced']
      const invalidLevels = body.skill_levels.filter((l: unknown) => !validSkillLevels.includes(l as string))
      if (invalidLevels.length > 0) {
        validationErrors.push('skill_levels must only contain: beginner, intermediate, advanced')
      }
    }

    // Validate pricing based on session types
    if (body.session_types && (body.session_types.includes('individual') || body.session_types.includes('both'))) {
      if (body.price_individual_pence === undefined || body.price_individual_pence === null) {
        validationErrors.push('price_individual_pence is required when offering individual sessions')
      } else if (typeof body.price_individual_pence !== 'number' || body.price_individual_pence < 100) {
        validationErrors.push('price_individual_pence must be a number >= 100 (£1.00)')
      }
    }

    if (body.session_types && (body.session_types.includes('group') || body.session_types.includes('both'))) {
      if (body.price_group_pence === undefined || body.price_group_pence === null) {
        validationErrors.push('price_group_pence is required when offering group sessions')
      } else if (typeof body.price_group_pence !== 'number' || body.price_group_pence < 100) {
        validationErrors.push('price_group_pence must be a number >= 100 (£1.00)')
      }

      if (body.max_group_size === undefined || body.max_group_size === null) {
        validationErrors.push('max_group_size is required when offering group sessions')
      } else if (typeof body.max_group_size !== 'number' || body.max_group_size < 2 || body.max_group_size > 50) {
        validationErrors.push('max_group_size must be a number between 2 and 50')
      }
    }

    if (body.session_duration_minutes !== undefined) {
      if (typeof body.session_duration_minutes !== 'number' || body.session_duration_minutes < 15) {
        validationErrors.push('session_duration_minutes must be a number >= 15')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. Verify sport exists
    const { data: sportExists, error: sportCheckError } = await supabase
      .from('sports')
      .select('id')
      .eq('id', body.sport_id)
      .single()

    if (sportCheckError || !sportExists) {
      return NextResponse.json({ error: 'Sport not found' }, { status: 404 })
    }

    // 6. Insert coach sport
    const insertData: {
      coach_profile_id: string
      sport_id: string
      session_types: string[]
      skill_levels: string[]
      price_individual_pence?: number | null
      price_group_pence?: number | null
      max_group_size?: number | null
      session_duration_minutes?: number
    } = {
      coach_profile_id: coachProfile.id,
      sport_id: body.sport_id,
      session_types: body.session_types,
      skill_levels: body.skill_levels,
    }

    if (body.price_individual_pence !== undefined) {
      insertData.price_individual_pence = body.price_individual_pence
    }
    if (body.price_group_pence !== undefined) {
      insertData.price_group_pence = body.price_group_pence
    }
    if (body.max_group_size !== undefined) {
      insertData.max_group_size = body.max_group_size
    }
    if (body.session_duration_minutes !== undefined) {
      insertData.session_duration_minutes = body.session_duration_minutes
    }

    const { data: newSport, error: insertError } = await supabase
      .from('coach_sports')
      .insert(insertData)
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

    if (insertError) {
      // Check for unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'You have already added this sport' }, { status: 409 })
      }
      console.error('[POST /api/coaches/sports] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to add sport' }, { status: 500 })
    }

    // 7. Build response
    const sportData = Array.isArray(newSport.sports) ? newSport.sports[0] : newSport.sports

    const response: CoachSportResponse = {
      id: newSport.id,
      sport_id: newSport.sport_id,
      sport_name: sportData.name,
      sport_slug: sportData.slug,
      session_types: newSport.session_types,
      skill_levels: newSport.skill_levels,
      price_individual_pence: newSport.price_individual_pence,
      price_group_pence: newSport.price_group_pence,
      max_group_size: newSport.max_group_size,
      session_duration_minutes: newSport.session_duration_minutes,
      currency: newSport.currency,
      is_active: newSport.is_active,
      session_type_variants: [], // No variants yet
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/sports]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
