import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ProgrammeResponse {
  id: string
  sport_id: string
  sport_name: string
  title: string
  description: string | null
  schedule_type: string
  day_of_week: number | null
  day_name: string | null
  start_time: string | null
  duration_minutes: number
  max_spots: number
  current_spots: number
  spots_remaining: number
  payment_type: string
  price_per_session_pence: number
  block_price_pence: number | null
  block_session_count: number | null
  currency: string
  status: string
  created_at: string
}

function getDayName(dayOfWeek: number | null): string | null {
  if (dayOfWeek === null) return null
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] || null
}

function normalizeTime(time: string): string {
  if (time.match(/^\d{2}:\d{2}$/)) {
    return `${time}:00`
  }
  return time
}

/**
 * GET /api/coaches/programmes/[programmeId]
 * 
 * Returns single programme with full details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<ProgrammeResponse | { error: string }>> {
  try {
    const { programmeId } = await params
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

    // 4. Fetch programme and verify ownership
    const { data: programme, error: programmeError } = await supabase
      .from('group_programmes')
      .select(`
        id,
        sport_id,
        title,
        description,
        schedule_type,
        day_of_week,
        start_time,
        duration_minutes,
        max_spots,
        current_spots,
        payment_type,
        price_per_session_pence,
        block_price_pence,
        block_session_count,
        currency,
        status,
        created_at,
        sports!inner (
          name
        )
      `)
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeError || !programme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // 5. Build response
    const sportData = programme.sports
      ? (Array.isArray(programme.sports) ? programme.sports[0] : programme.sports)
      : null

    const response: ProgrammeResponse = {
      id: programme.id,
      sport_id: programme.sport_id,
      sport_name: sportData?.name || '',
      title: programme.title,
      description: programme.description,
      schedule_type: programme.schedule_type,
      day_of_week: programme.day_of_week,
      day_name: getDayName(programme.day_of_week),
      start_time: programme.start_time,
      duration_minutes: programme.duration_minutes,
      max_spots: programme.max_spots,
      current_spots: programme.current_spots,
      spots_remaining: programme.max_spots - programme.current_spots,
      payment_type: programme.payment_type,
      price_per_session_pence: programme.price_per_session_pence,
      block_price_pence: programme.block_price_pence,
      block_session_count: programme.block_session_count,
      currency: programme.currency,
      status: programme.status,
      created_at: programme.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/programmes/[programmeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/coaches/programmes/[programmeId]
 * 
 * Update a programme. Cannot update if completed or cancelled.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<ProgrammeResponse | { error: string; details?: unknown }>> {
  try {
    const { programmeId } = await params
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

    // 4. Verify coach owns this programme and get current values
    const { data: existingProgramme, error: programmeCheckError } = await supabase
      .from('group_programmes')
      .select('id, status, current_spots, max_spots')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeCheckError || !existingProgramme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // Cannot update if completed or cancelled
    if (existingProgramme.status === 'completed' || existingProgramme.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot update a programme that is completed or cancelled' },
        { status: 400 }
      )
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        validationErrors.push('title must be a string')
      } else if (body.title.length > 200) {
        validationErrors.push('title must be 200 characters or less')
      }
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        validationErrors.push('description must be a string')
      } else if (body.description.length > 1000) {
        validationErrors.push('description must be 1000 characters or less')
      }
    }

    if (body.schedule_type !== undefined && !['fixed', 'rolling'].includes(body.schedule_type)) {
      validationErrors.push('schedule_type must be either "fixed" or "rolling"')
    }

    if (body.day_of_week !== undefined) {
      if (typeof body.day_of_week !== 'number' || body.day_of_week < 0 || body.day_of_week > 6) {
        validationErrors.push('day_of_week must be a number between 0 and 6')
      }
    }

    if (body.start_time !== undefined && typeof body.start_time !== 'string') {
      validationErrors.push('start_time must be a string (HH:MM format)')
    }

    if (body.duration_minutes !== undefined) {
      if (typeof body.duration_minutes !== 'number') {
        validationErrors.push('duration_minutes must be a number')
      } else if (body.duration_minutes < 15 || body.duration_minutes > 480) {
        validationErrors.push('duration_minutes must be between 15 and 480')
      }
    }

    if (body.max_spots !== undefined) {
      if (typeof body.max_spots !== 'number') {
        validationErrors.push('max_spots must be a number')
      } else if (body.max_spots < 2 || body.max_spots > 100) {
        validationErrors.push('max_spots must be between 2 and 100')
      } else if (body.max_spots < existingProgramme.current_spots) {
        validationErrors.push(`Cannot reduce max_spots below current_spots (${existingProgramme.current_spots})`)
      }
    }

    if (body.payment_type !== undefined && !['per_session', 'block_upfront'].includes(body.payment_type)) {
      validationErrors.push('payment_type must be either "per_session" or "block_upfront"')
    }

    if (body.price_per_session_pence !== undefined) {
      if (typeof body.price_per_session_pence !== 'number') {
        validationErrors.push('price_per_session_pence must be a number')
      } else if (body.price_per_session_pence < 100) {
        validationErrors.push('price_per_session_pence must be at least 100 (£1.00)')
      }
    }

    if (body.block_price_pence !== undefined && body.block_price_pence !== null) {
      if (typeof body.block_price_pence !== 'number') {
        validationErrors.push('block_price_pence must be a number')
      } else if (body.block_price_pence < 100) {
        validationErrors.push('block_price_pence must be at least 100 (£1.00)')
      }
    }

    if (body.block_session_count !== undefined && body.block_session_count !== null) {
      if (typeof body.block_session_count !== 'number') {
        validationErrors.push('block_session_count must be a number')
      } else if (body.block_session_count < 2) {
        validationErrors.push('block_session_count must be at least 2')
      }
    }

    // Validate status transitions
    if (body.status !== undefined) {
      const validStatuses = ['draft', 'active', 'full', 'completed', 'cancelled']
      if (!validStatuses.includes(body.status)) {
        validationErrors.push('status must be one of: draft, active, full, completed, cancelled')
      }

      // Validate allowed transitions
      const currentStatus = existingProgramme.status
      const newStatus = body.status

      if (currentStatus === 'draft' && !['active', 'cancelled'].includes(newStatus)) {
        validationErrors.push('Can only transition from draft to active or cancelled')
      } else if (currentStatus === 'active' && !['full', 'completed', 'cancelled'].includes(newStatus)) {
        validationErrors.push('Can only transition from active to full, completed, or cancelled')
      } else if (currentStatus === 'full' && !['completed', 'cancelled'].includes(newStatus)) {
        validationErrors.push('Can only transition from full to completed or cancelled')
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
      title?: string
      description?: string | null
      schedule_type?: string
      day_of_week?: number
      start_time?: string
      duration_minutes?: number
      max_spots?: number
      payment_type?: string
      price_per_session_pence?: number
      block_price_pence?: number | null
      block_session_count?: number | null
      status?: string
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.schedule_type !== undefined) updateData.schedule_type = body.schedule_type
    if (body.day_of_week !== undefined) updateData.day_of_week = body.day_of_week
    if (body.start_time !== undefined) updateData.start_time = normalizeTime(body.start_time)
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.max_spots !== undefined) updateData.max_spots = body.max_spots
    if (body.payment_type !== undefined) updateData.payment_type = body.payment_type
    if (body.price_per_session_pence !== undefined) updateData.price_per_session_pence = body.price_per_session_pence
    if (body.block_price_pence !== undefined) updateData.block_price_pence = body.block_price_pence
    if (body.block_session_count !== undefined) updateData.block_session_count = body.block_session_count
    if (body.status !== undefined) updateData.status = body.status

    // 7. Update programme
    const { data: updatedProgramme, error: updateError } = await supabase
      .from('group_programmes')
      .update(updateData)
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .select(`
        id,
        sport_id,
        title,
        description,
        schedule_type,
        day_of_week,
        start_time,
        duration_minutes,
        max_spots,
        current_spots,
        payment_type,
        price_per_session_pence,
        block_price_pence,
        block_session_count,
        currency,
        status,
        created_at,
        sports!inner (
          name
        )
      `)
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/programmes/[programmeId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update programme' }, { status: 500 })
    }

    // 8. Build response
    const sportData = updatedProgramme.sports
      ? (Array.isArray(updatedProgramme.sports) ? updatedProgramme.sports[0] : updatedProgramme.sports)
      : null

    const response: ProgrammeResponse = {
      id: updatedProgramme.id,
      sport_id: updatedProgramme.sport_id,
      sport_name: sportData?.name || '',
      title: updatedProgramme.title,
      description: updatedProgramme.description,
      schedule_type: updatedProgramme.schedule_type,
      day_of_week: updatedProgramme.day_of_week,
      day_name: getDayName(updatedProgramme.day_of_week),
      start_time: updatedProgramme.start_time,
      duration_minutes: updatedProgramme.duration_minutes,
      max_spots: updatedProgramme.max_spots,
      current_spots: updatedProgramme.current_spots,
      spots_remaining: updatedProgramme.max_spots - updatedProgramme.current_spots,
      payment_type: updatedProgramme.payment_type,
      price_per_session_pence: updatedProgramme.price_per_session_pence,
      block_price_pence: updatedProgramme.block_price_pence,
      block_session_count: updatedProgramme.block_session_count,
      currency: updatedProgramme.currency,
      status: updatedProgramme.status,
      created_at: updatedProgramme.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/programmes/[programmeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/programmes/[programmeId]
 * 
 * Soft delete — sets deleted_at. Only allowed if draft or no enrolments.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { programmeId } = await params
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

    // 4. Verify coach owns this programme and check status/enrolments
    const { data: existingProgramme, error: programmeCheckError } = await supabase
      .from('group_programmes')
      .select('id, status, current_spots')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeCheckError || !existingProgramme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // Only allow deletion if draft or no enrolments
    if (existingProgramme.status !== 'draft' && existingProgramme.current_spots > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a programme with active enrolments. Cancel it instead.' },
        { status: 400 }
      )
    }

    // 5. Soft delete — set deleted_at
    const { error: deleteError } = await supabase
      .from('group_programmes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/programmes/[programmeId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete programme' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/programmes/[programmeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
