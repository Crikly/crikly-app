import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Availability block response
 */
interface AvailabilityResponse {
  id: string
  sport_id: string | null
  sport_name: string | null
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
  price_override_pence: number | null
  session_type_id: string | null
  session_type_name: string | null
  coach_venue_id: string | null
  venue_name: string | null
  is_recurring: boolean
  specific_date: string | null
  created_at: string
}

/**
 * Helper to normalize time format (HH:MM to HH:MM:SS)
 */
function normalizeTime(time: string): string {
  if (time.match(/^\d{2}:\d{2}$/)) {
    return `${time}:00`
  }
  return time
}

/**
 * Helper to parse time string to minutes for comparison
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * GET /api/coaches/availability
 * 
 * Returns all availability blocks for the authenticated coach.
 * Optional filter: ?sport_id=uuid
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<{ availability: AvailabilityResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const sportIdFilter = searchParams.get('sport_id')
    
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

    // 3. Get or create coach profile
    // Fix-CD-04b: Upsert coach_profiles on first access instead of returning 404
    // This supports dashboard-first onboarding where coach_profiles is created progressively
    const { data: coachProfile, error: coachError } = await supabase
      .from('coach_profiles')
      .upsert(
        {
          user_profile_id: userProfile.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_profile_id',
          ignoreDuplicates: false, // Return existing row if present
        }
      )
      .select('id')
      .single()

    if (coachError || !coachProfile) {
      console.error('[GET /api/coaches/availability] coach profile upsert error:', coachError)
      return NextResponse.json({ error: 'Failed to create coach profile' }, { status: 500 })
    }

    // 4. Fix-16d: Fetch availability blocks WITHOUT joins
    let query = supabase
      .from('availability_templates')
      .select('*')
      .eq('coach_profile_id', coachProfile.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    // Apply sport filter if provided
    if (sportIdFilter) {
      query = query.eq('sport_id', sportIdFilter)
    }

    const { data: blocks, error: blocksError } = await query

    if (blocksError) {
      console.error('[GET /api/coaches/availability] fetch error:', blocksError)
      return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 })
    }

    // 5. Fix-16d: Fetch sport data separately
    const sportIds = [...new Set((blocks || [])
      .map(b => b.sport_id)
      .filter((id): id is string => id !== null))]
    
    const { data: sportsData, error: sportsError } = sportIds.length > 0
      ? await supabase
          .from('sports')
          .select('id, name')
          .in('id', sportIds)
      : { data: [], error: null }

    if (sportsError) {
      console.error('[GET /api/coaches/availability] sports error:', sportsError)
      return NextResponse.json({ error: 'Failed to fetch sports data' }, { status: 500 })
    }

    // 6. Fix-16d: Fetch session type data separately
    const sessionTypeIds = [...new Set((blocks || [])
      .map(b => b.session_type_id)
      .filter((id): id is string => id !== null))]

    const { data: sessionTypesData, error: sessionTypesError } = sessionTypeIds.length > 0
      ? await supabase
          .from('coach_session_types')
          .select('id, duration_minutes')
          .in('id', sessionTypeIds)
      : { data: [], error: null }

    if (sessionTypesError) {
      console.error('[GET /api/coaches/availability] session types error:', sessionTypesError)
      return NextResponse.json({ error: 'Failed to fetch session types data' }, { status: 500 })
    }

    // 7. Fix-16d: Fetch venue data separately
    const venueIds = [...new Set((blocks || [])
      .map(b => b.coach_venue_id)
      .filter((id): id is string => id !== null))]

    const venueMap: Record<string, string> = {}
    if (venueIds.length > 0) {
      const { data: venuesData } = await supabase
        .from('coach_venues')
        .select('id, name')
        .in('id', venueIds)
      venuesData?.forEach(v => { venueMap[v.id] = v.name })
    }

    // 8. Build response by merging data in application code
    const response: AvailabilityResponse[] = (blocks || []).map((block) => {
      const sportData = (sportsData || []).find(s => s.id === block.sport_id)
      const sessionTypeData = (sessionTypesData || []).find(st => st.id === block.session_type_id)

      return {
        id: block.id,
        sport_id: block.sport_id,
        sport_name: sportData?.name || null,
        day_of_week: block.day_of_week,
        start_time: block.start_time,
        end_time: block.end_time,
        is_active: block.is_active,
        price_override_pence: block.price_override_pence,
        session_type_id: block.session_type_id,
        session_type_name: sessionTypeData ? `${sessionTypeData.duration_minutes}min` : null,
        coach_venue_id: block.coach_venue_id,
        venue_name: block.coach_venue_id ? (venueMap[block.coach_venue_id] ?? null) : null,
        is_recurring: block.is_recurring,
        specific_date: block.specific_date ?? null,
        created_at: block.created_at,
      }
    })

    return NextResponse.json({ availability: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/availability]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/availability
 * 
 * Add a new availability block with conflict validation.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<AvailabilityResponse | { error: string; details?: unknown; conflicting_block_id?: string; message?: string }>> {
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

    // 3. Get or create coach profile
    // Fix-CD-04b: Upsert coach_profiles on first access instead of returning 404
    const { data: coachProfile, error: coachError } = await supabase
      .from('coach_profiles')
      .upsert(
        {
          user_profile_id: userProfile.id,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_profile_id',
          ignoreDuplicates: false,
        }
      )
      .select('id')
      .single()

    if (coachError || !coachProfile) {
      console.error('[POST /api/coaches/availability] coach profile upsert error:', coachError)
      return NextResponse.json({ error: 'Failed to create coach profile' }, { status: 500 })
    }

    // 4. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.day_of_week === undefined || body.day_of_week === null) {
      validationErrors.push('day_of_week is required')
    } else if (typeof body.day_of_week !== 'number' || body.day_of_week < 0 || body.day_of_week > 6) {
      validationErrors.push('day_of_week must be a number between 0 and 6')
    }

    if (!body.start_time || typeof body.start_time !== 'string') {
      validationErrors.push('start_time is required and must be a string (HH:MM format)')
    }

    if (!body.end_time || typeof body.end_time !== 'string') {
      validationErrors.push('end_time is required and must be a string (HH:MM format)')
    }

    // Validate times if provided
    if (body.start_time && body.end_time) {
      const startMinutes = timeToMinutes(body.start_time)
      const endMinutes = timeToMinutes(body.end_time)

      if (endMinutes <= startMinutes) {
        validationErrors.push('end_time must be after start_time')
      }

      const durationMinutes = endMinutes - startMinutes
      if (durationMinutes < 30) {
        validationErrors.push('Minimum block duration is 30 minutes')
      }
    }

    if (body.sport_id !== undefined && body.sport_id !== null) {
      if (typeof body.sport_id !== 'string') {
        validationErrors.push('sport_id must be a string')
      }
    }

    if (body.price_override_pence !== undefined && body.price_override_pence !== null) {
      if (typeof body.price_override_pence !== 'number' || body.price_override_pence < 0) {
        validationErrors.push('price_override_pence must be a non-negative number')
      }
    }

    if (body.session_type_id !== undefined && body.session_type_id !== null) {
      if (typeof body.session_type_id !== 'string') {
        validationErrors.push('session_type_id must be a string')
      }
    }

    if (body.coach_venue_id !== undefined && body.coach_venue_id !== null) {
      if (typeof body.coach_venue_id !== 'string') {
        validationErrors.push('coach_venue_id must be a string')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. If sport_id provided, verify coach has this sport configured (REQ-C-048)
    if (body.sport_id) {
      const { data: coachSport, error: sportCheckError } = await supabase
        .from('coach_sports')
        .select('id, sports!inner(name)')
        .eq('coach_profile_id', coachProfile.id)
        .eq('sport_id', body.sport_id)
        .single()

      if (sportCheckError || !coachSport) {
        const { data: sport } = await supabase
          .from('sports')
          .select('name')
          .eq('id', body.sport_id)
          .single()

        const sportName = sport?.name || 'this sport'
        return NextResponse.json(
          { error: `You haven't configured ${sportName} yet. Add it in My Profile → Sports first.` },
          { status: 400 }
        )
      }
    }

    // 6. If session_type_id provided, verify it belongs to this coach
    if (body.session_type_id) {
      const { data: sessionType, error: typeCheckError } = await supabase
        .from('coach_session_types')
        .select('id, coach_sports!inner(coach_profile_id)')
        .eq('id', body.session_type_id)
        .single()

      if (typeCheckError || !sessionType) {
        return NextResponse.json({ error: 'Session type not found' }, { status: 404 })
      }

      const sessionTypeCoachId = Array.isArray(sessionType.coach_sports)
        ? sessionType.coach_sports[0]?.coach_profile_id
        : sessionType.coach_sports?.coach_profile_id

      if (sessionTypeCoachId !== coachProfile.id) {
        return NextResponse.json({ error: 'Session type does not belong to you' }, { status: 403 })
      }
    }

    // 7. Conflict validation (REQ-C-047)
    const normalizedStartTime = normalizeTime(body.start_time)
    const normalizedEndTime = normalizeTime(body.end_time)

    // Check for overlapping blocks on same day + same sport
    let conflictQuery = supabase
      .from('availability_templates')
      .select('id, start_time, end_time, sports(name)')
      .eq('coach_profile_id', coachProfile.id)
      .eq('day_of_week', body.day_of_week)
      .eq('is_active', true)

    // Sport-specific conflict check
    if (body.sport_id) {
      conflictQuery = conflictQuery.eq('sport_id', body.sport_id)
    } else {
      conflictQuery = conflictQuery.is('sport_id', null)
    }

    const { data: potentialConflicts, error: conflictError } = await conflictQuery

    if (conflictError) {
      console.error('[POST /api/coaches/availability] conflict check error:', conflictError)
      return NextResponse.json({ error: 'Failed to check for conflicts' }, { status: 500 })
    }

    // Check for time overlap
    if (potentialConflicts && potentialConflicts.length > 0) {
      for (const existing of potentialConflicts) {
        const existingStart = timeToMinutes(existing.start_time)
        const existingEnd = timeToMinutes(existing.end_time)
        const newStart = timeToMinutes(normalizedStartTime)
        const newEnd = timeToMinutes(normalizedEndTime)

        // Overlap if: new start < existing end AND new end > existing start
        if (newStart < existingEnd && newEnd > existingStart) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          const sportData = existing.sports
            ? (Array.isArray(existing.sports) ? existing.sports[0] : existing.sports)
            : null
          const sportName = sportData?.name || 'All sports'
          const dayName = dayNames[body.day_of_week]

          return NextResponse.json(
            {
              error: 'Conflict detected',
              message: `${sportName} on ${dayName} already has a block from ${existing.start_time.slice(0, 5)}–${existing.end_time.slice(0, 5)}. Adjust the time or day.`,
              conflicting_block_id: existing.id,
            },
            { status: 409 }
          )
        }
      }
    }

    // 8. Insert new block
    const insertData: {
      coach_profile_id: string
      sport_id?: string | null
      day_of_week: number
      start_time: string
      end_time: string
      price_override_pence?: number | null
      session_type_id?: string | null
      coach_venue_id?: string | null
      is_recurring?: boolean
      specific_date?: string | null
    } = {
      coach_profile_id: coachProfile.id,
      day_of_week: body.day_of_week,
      start_time: normalizedStartTime,
      end_time: normalizedEndTime,
    }

    if (body.sport_id !== undefined) {
      insertData.sport_id = body.sport_id
    }

    if (body.price_override_pence !== undefined) {
      insertData.price_override_pence = body.price_override_pence
    }

    if (body.session_type_id !== undefined) {
      insertData.session_type_id = body.session_type_id
    }

    if (body.coach_venue_id !== undefined) {
      insertData.coach_venue_id = body.coach_venue_id
    }

    if (body.is_recurring !== undefined) {
      insertData.is_recurring = body.is_recurring
    }

    if (body.specific_date !== undefined) {
      insertData.specific_date = body.specific_date
    }

    // Fix-16d: Upsert instead of insert to handle conflicts on (coach_profile_id, day_of_week, start_time)
    const { data: newBlock, error: insertError } = await supabase
      .from('availability_templates')
      .upsert(insertData, {
        onConflict: 'coach_profile_id,day_of_week,start_time',
        ignoreDuplicates: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/availability] upsert error:', insertError)
      return NextResponse.json({ error: 'Failed to add availability block' }, { status: 500 })
    }

    // 9. Fetch sport, session type, and venue data separately if needed
    let sportData = null
    if (newBlock.sport_id) {
      const { data: sport } = await supabase
        .from('sports')
        .select('name')
        .eq('id', newBlock.sport_id)
        .single()
      sportData = sport
    }

    let sessionTypeData = null
    if (newBlock.session_type_id) {
      const { data: sessionType } = await supabase
        .from('coach_session_types')
        .select('duration_minutes')
        .eq('id', newBlock.session_type_id)
        .single()
      sessionTypeData = sessionType
    }

    let venueData = null
    if (newBlock.coach_venue_id) {
      const { data: venue } = await supabase
        .from('coach_venues')
        .select('name')
        .eq('id', newBlock.coach_venue_id)
        .single()
      venueData = venue
    }

    const response: AvailabilityResponse = {
      id: newBlock.id,
      sport_id: newBlock.sport_id,
      sport_name: sportData?.name || null,
      day_of_week: newBlock.day_of_week,
      start_time: newBlock.start_time,
      end_time: newBlock.end_time,
      is_active: newBlock.is_active,
      price_override_pence: newBlock.price_override_pence,
      session_type_id: newBlock.session_type_id,
      session_type_name: sessionTypeData ? `${sessionTypeData.duration_minutes}min` : null,
      coach_venue_id: newBlock.coach_venue_id,
      venue_name: venueData?.name ?? null,
      is_recurring: newBlock.is_recurring,
      specific_date: newBlock.specific_date ?? null,
      created_at: newBlock.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/availability]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
