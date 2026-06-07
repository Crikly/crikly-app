import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

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
  age_groups: string[]
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
  // AF-H-58: optional warning when session-type upsert fails non-fatally during sport creation
  warning?: string
}

/**
 * GET /api/coaches/sports
 * 
 * Returns all sports the authenticated coach has configured.
 */
export async function GET(): Promise<NextResponse<{ sports: CoachSportResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Fix-16d: Fetch coach sports WITHOUT joins (no sports!inner syntax)
    const { data: coachSports, error: sportsError } = await supabase
      .from('coach_sports')
      // AF-P-Wave-2: explicit columns matching CoachSportResponse builder at L102–117
      .select('id, sport_id, session_types, skill_levels, age_groups, price_individual_pence, price_group_pence, max_group_size, session_duration_minutes, currency, is_active')
      .eq('coach_profile_id', coachProfile.id)

    if (sportsError) {
      console.error('[GET /api/coaches/sports] fetch error:', sportsError)
      return NextResponse.json({ error: 'Failed to fetch sports' }, { status: 500 })
    }

    // AF-P-Wave-2: parallelise sports + session_types lookups (both depend only on coach_sports rows above)
    const sportIds = [...new Set((coachSports || []).map(cs => cs.sport_id).filter(Boolean))]
    const coachSportIds = (coachSports || []).map(cs => cs.id)

    const [
      { data: sportsData, error: sportsDataError },
      { data: sessionTypes, error: typesError },
    ] = await Promise.all([
      sportIds.length > 0
        ? supabase.from('sports').select('id, name, slug').in('id', sportIds)
        : Promise.resolve({ data: [], error: null }),
      coachSportIds.length > 0
        ? supabase.from('coach_session_types')
            .select('id, coach_sport_id, duration_minutes, price_individual_pence, price_group_pence, is_active')
            .in('coach_sport_id', coachSportIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (sportsDataError) {
      console.error('[GET /api/coaches/sports] sports data error:', sportsDataError)
      return NextResponse.json({ error: 'Failed to fetch sports data' }, { status: 500 })
    }
    if (typesError) {
      console.error('[GET /api/coaches/sports] session types error:', typesError)
      return NextResponse.json({ error: 'Failed to fetch session types' }, { status: 500 })
    }

    // 7. Build response by merging sport data in application code
    const sports: CoachSportResponse[] = (coachSports || []).map((cs) => {
      const sportData = (sportsData || []).find(s => s.id === cs.sport_id)
      
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
        sport_name: sportData?.name || 'Unknown Sport',
        sport_slug: sportData?.slug || 'unknown',
        session_types: cs.session_types,
        skill_levels: cs.skill_levels,
        age_groups: cs.age_groups || [],
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
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

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
      const validSkillLevels = ['beginner', 'intermediate', 'advanced', 'elite']
      const invalidLevels = body.skill_levels.filter((l: unknown) => !validSkillLevels.includes(l as string))
      if (invalidLevels.length > 0) {
        validationErrors.push('skill_levels must only contain: beginner, intermediate, advanced, elite')
      }
    }

    // Fix-16e: Validate age_groups if provided
    if (body.age_groups !== undefined && body.age_groups !== null) {
      if (!Array.isArray(body.age_groups)) {
        validationErrors.push('age_groups must be an array')
      } else {
        const validAgeGroups = ['under_8', 'under_10', 'under_12', 'under_14', 'under_16', 'under_18', 'adults']
        const invalidGroups = body.age_groups.filter((g: unknown) => !validAgeGroups.includes(g as string))
        if (invalidGroups.length > 0) {
          validationErrors.push('age_groups must only contain: under_8, under_10, under_12, under_14, under_16, under_18, adults')
        }
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

    // Fix-15b: Make group pricing optional - can be set later
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
      age_groups?: string[]
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

    // Fix-16e: Add age_groups to insert data
    if (body.age_groups !== undefined && Array.isArray(body.age_groups)) {
      insertData.age_groups = body.age_groups
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

    // Fix-16a: Upsert instead of insert to allow repeat saves
    const { data: newSport, error: upsertError } = await supabase
      .from('coach_sports')
      .upsert(insertData, {
        onConflict: 'coach_profile_id,sport_id',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (upsertError) {
      console.error('[POST /api/coaches/sports] upsert error:', upsertError)
      return NextResponse.json({ error: 'Failed to save sport' }, { status: 500 })
    }

    // AF-H-58: track session-type save state for response builder
    let savedVariant: CoachSportResponse['session_type_variants'][number] | null = null
    let sessionTypeWarning: string | null = null

    // Fix-18b: Insert/upsert session type into coach_session_types table
    // This replaces the deprecated price columns in coach_sports
    if (body.session_duration_minutes && (body.price_individual_pence || body.price_group_pence)) {
      const sessionTypeData: {
        coach_sport_id: string
        duration_minutes: number
        price_individual_pence: number | null
        price_group_pence: number | null
        currency: string
        is_active: boolean
      } = {
        coach_sport_id: newSport.id,
        duration_minutes: body.session_duration_minutes,
        price_individual_pence: body.price_individual_pence || null,
        price_group_pence: body.price_group_pence || null,
        currency: 'GBP',
        is_active: true
      }

      // AF-H-58: capture upsert row so the response can return the saved variant (was always [])
      const { data: sessionTypeRow, error: sessionTypeError } = await supabase
        .from('coach_session_types')
        .upsert(sessionTypeData, {
          onConflict: 'coach_sport_id,duration_minutes',
          ignoreDuplicates: false
        })
        .select()
        .single()

      if (sessionTypeError) {
        console.error('[POST /api/coaches/sports] session type upsert error:', sessionTypeError)
        sessionTypeWarning = 'Sport saved but pricing variant failed. Please update pricing in My Profile.'
      } else if (sessionTypeRow) {
        savedVariant = {
          id: sessionTypeRow.id,
          duration_minutes: sessionTypeRow.duration_minutes,
          price_individual_pence: sessionTypeRow.price_individual_pence,
          price_group_pence: sessionTypeRow.price_group_pence,
          is_active: sessionTypeRow.is_active,
        }
      }
    }

    // 7. Fetch sport name and slug separately
    const { data: sportData } = await supabase
      .from('sports')
      .select('name, slug')
      .eq('id', newSport.sport_id)
      .single()

    const response: CoachSportResponse = {
      id: newSport.id,
      sport_id: newSport.sport_id,
      sport_name: sportData?.name || '',
      sport_slug: sportData?.slug || '',
      session_types: newSport.session_types,
      skill_levels: newSport.skill_levels,
      age_groups: newSport.age_groups || [],
      price_individual_pence: newSport.price_individual_pence,
      price_group_pence: newSport.price_group_pence,
      max_group_size: newSport.max_group_size,
      session_duration_minutes: newSport.session_duration_minutes,
      currency: newSport.currency,
      is_active: newSport.is_active,
      // AF-H-58: was always [] — now returns the variant just upserted (or [] on upsert failure)
      session_type_variants: savedVariant ? [savedVariant] : [],
      ...(sessionTypeWarning && { warning: sessionTypeWarning }),
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/sports]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
