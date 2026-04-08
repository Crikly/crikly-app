import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  created_at: string
}

function normalizeTime(time: string): string {
  if (time.match(/^\d{2}:\d{2}$/)) {
    return `${time}:00`
  }
  return time
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * PATCH /api/coaches/availability/[blockId]
 * 
 * Update an existing availability block with conflict validation.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ blockId: string }> }
): Promise<NextResponse<AvailabilityResponse | { error: string; details?: unknown; conflicting_block_id?: string; message?: string }>> {
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

    // 4. Verify coach owns this block and get current values
    const { data: existingBlock, error: blockCheckError } = await supabase
      .from('availability_templates')
      .select('id, sport_id, day_of_week, start_time, end_time')
      .eq('id', blockId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (blockCheckError || !existingBlock) {
      return NextResponse.json({ error: 'Availability block not found or access denied' }, { status: 404 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.day_of_week !== undefined) {
      if (typeof body.day_of_week !== 'number' || body.day_of_week < 0 || body.day_of_week > 6) {
        validationErrors.push('day_of_week must be a number between 0 and 6')
      }
    }

    if (body.start_time !== undefined && typeof body.start_time !== 'string') {
      validationErrors.push('start_time must be a string (HH:MM format)')
    }

    if (body.end_time !== undefined && typeof body.end_time !== 'string') {
      validationErrors.push('end_time must be a string (HH:MM format)')
    }

    // Validate times
    const finalStartTime = body.start_time !== undefined ? body.start_time : existingBlock.start_time
    const finalEndTime = body.end_time !== undefined ? body.end_time : existingBlock.end_time

    const startMinutes = timeToMinutes(finalStartTime)
    const endMinutes = timeToMinutes(finalEndTime)

    if (endMinutes <= startMinutes) {
      validationErrors.push('end_time must be after start_time')
    }

    const durationMinutes = endMinutes - startMinutes
    if (durationMinutes < 30) {
      validationErrors.push('Minimum block duration is 30 minutes')
    }

    if (body.sport_id !== undefined && body.sport_id !== null && typeof body.sport_id !== 'string') {
      validationErrors.push('sport_id must be a string')
    }

    if (body.price_override_pence !== undefined && body.price_override_pence !== null) {
      if (typeof body.price_override_pence !== 'number' || body.price_override_pence < 0) {
        validationErrors.push('price_override_pence must be a non-negative number')
      }
    }

    if (body.session_type_id !== undefined && body.session_type_id !== null && typeof body.session_type_id !== 'string') {
      validationErrors.push('session_type_id must be a string')
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

    // 6. If sport_id being changed, verify coach has this sport configured
    if (body.sport_id !== undefined && body.sport_id !== null) {
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

    // 7. If session_type_id being changed, verify it belongs to this coach
    if (body.session_type_id !== undefined && body.session_type_id !== null) {
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

    // 8. Conflict validation if time/day/sport changes
    const dayChanged = body.day_of_week !== undefined && body.day_of_week !== existingBlock.day_of_week
    const timeChanged = body.start_time !== undefined || body.end_time !== undefined
    const sportChanged = body.sport_id !== undefined

    if (dayChanged || timeChanged || sportChanged) {
      const finalDayOfWeek = body.day_of_week !== undefined ? body.day_of_week : existingBlock.day_of_week
      const finalSportId = body.sport_id !== undefined ? body.sport_id : existingBlock.sport_id
      const normalizedStartTime = normalizeTime(finalStartTime)
      const normalizedEndTime = normalizeTime(finalEndTime)

      // Check for overlapping blocks (excluding this block)
      let conflictQuery = supabase
        .from('availability_templates')
        .select('id, start_time, end_time, sports(name)')
        .eq('coach_profile_id', coachProfile.id)
        .eq('day_of_week', finalDayOfWeek)
        .eq('is_active', true)
        .neq('id', blockId)

      // Sport-specific conflict check
      if (finalSportId) {
        conflictQuery = conflictQuery.eq('sport_id', finalSportId)
      } else {
        conflictQuery = conflictQuery.is('sport_id', null)
      }

      const { data: potentialConflicts, error: conflictError } = await conflictQuery

      if (conflictError) {
        console.error('[PATCH /api/coaches/availability/[blockId]] conflict check error:', conflictError)
        return NextResponse.json({ error: 'Failed to check for conflicts' }, { status: 500 })
      }

      // Check for time overlap
      if (potentialConflicts && potentialConflicts.length > 0) {
        for (const existing of potentialConflicts) {
          const existingStart = timeToMinutes(existing.start_time)
          const existingEnd = timeToMinutes(existing.end_time)
          const newStart = timeToMinutes(normalizedStartTime)
          const newEnd = timeToMinutes(normalizedEndTime)

          if (newStart < existingEnd && newEnd > existingStart) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
            const sportData = existing.sports
              ? (Array.isArray(existing.sports) ? existing.sports[0] : existing.sports)
              : null
            const sportName = sportData?.name || 'All sports'
            const dayName = dayNames[finalDayOfWeek]

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
    }

    // 9. Build update object
    const updateData: {
      sport_id?: string | null
      day_of_week?: number
      start_time?: string
      end_time?: string
      is_active?: boolean
      price_override_pence?: number | null
      session_type_id?: string | null
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.sport_id !== undefined) updateData.sport_id = body.sport_id
    if (body.day_of_week !== undefined) updateData.day_of_week = body.day_of_week
    if (body.start_time !== undefined) updateData.start_time = normalizeTime(body.start_time)
    if (body.end_time !== undefined) updateData.end_time = normalizeTime(body.end_time)
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.price_override_pence !== undefined) updateData.price_override_pence = body.price_override_pence
    if (body.session_type_id !== undefined) updateData.session_type_id = body.session_type_id

    // 10. Update block
    const { data: updatedBlock, error: updateError } = await supabase
      .from('availability_templates')
      .update(updateData)
      .eq('id', blockId)
      .eq('coach_profile_id', coachProfile.id)
      .select(`
        id,
        sport_id,
        day_of_week,
        start_time,
        end_time,
        is_active,
        price_override_pence,
        session_type_id,
        created_at,
        sports (
          name
        ),
        coach_session_types (
          duration_minutes
        )
      `)
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/availability/[blockId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update availability block' }, { status: 500 })
    }

    // 11. Build response
    const sportData = updatedBlock.sports
      ? (Array.isArray(updatedBlock.sports) ? updatedBlock.sports[0] : updatedBlock.sports)
      : null

    const sessionTypeData = updatedBlock.coach_session_types
      ? (Array.isArray(updatedBlock.coach_session_types) ? updatedBlock.coach_session_types[0] : updatedBlock.coach_session_types)
      : null

    const response: AvailabilityResponse = {
      id: updatedBlock.id,
      sport_id: updatedBlock.sport_id,
      sport_name: sportData?.name || null,
      day_of_week: updatedBlock.day_of_week,
      start_time: updatedBlock.start_time,
      end_time: updatedBlock.end_time,
      is_active: updatedBlock.is_active,
      price_override_pence: updatedBlock.price_override_pence,
      session_type_id: updatedBlock.session_type_id,
      session_type_name: sessionTypeData ? `${sessionTypeData.duration_minutes}min` : null,
      created_at: updatedBlock.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/availability/[blockId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/availability/[blockId]
 * 
 * Hard delete an availability block.
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

    // 4. Verify coach owns this block
    const { data: existingBlock, error: blockCheckError } = await supabase
      .from('availability_templates')
      .select('id')
      .eq('id', blockId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (blockCheckError || !existingBlock) {
      return NextResponse.json({ error: 'Availability block not found or access denied' }, { status: 404 })
    }

    // 5. Delete block
    const { error: deleteError } = await supabase
      .from('availability_templates')
      .delete()
      .eq('id', blockId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/availability/[blockId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete availability block' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/availability/[blockId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
