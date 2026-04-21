import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Programme response
 */
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

/**
 * Helper to get day name from day_of_week
 */
function getDayName(dayOfWeek: number | null): string | null {
  if (dayOfWeek === null) return null
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] || null
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
 * GET /api/coaches/programmes
 * 
 * Returns all programmes for the authenticated coach.
 * Optional filter: ?status=active|draft|full|completed|cancelled
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<{ programmes: ProgrammeResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    
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

    // 4. Build query
    let query = supabase
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
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    // Apply status filter if provided
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data: programmes, error: programmesError } = await query

    if (programmesError) {
      console.error('[GET /api/coaches/programmes] fetch error:', programmesError)
      return NextResponse.json({ error: 'Failed to fetch programmes' }, { status: 500 })
    }

    // 5. Build response
    const response: ProgrammeResponse[] = (programmes || []).map((prog) => {
      const sportData = prog.sports
        ? (Array.isArray(prog.sports) ? prog.sports[0] : prog.sports)
        : null

      return {
        id: prog.id,
        sport_id: prog.sport_id,
        sport_name: sportData?.name || '',
        title: prog.title,
        description: prog.description,
        schedule_type: prog.schedule_type,
        day_of_week: prog.day_of_week,
        day_name: getDayName(prog.day_of_week),
        start_time: prog.start_time,
        duration_minutes: prog.duration_minutes,
        max_spots: prog.max_spots,
        current_spots: prog.current_spots,
        spots_remaining: prog.max_spots - prog.current_spots,
        payment_type: prog.payment_type,
        price_per_session_pence: prog.price_per_session_pence,
        block_price_pence: prog.block_price_pence,
        block_session_count: prog.block_session_count,
        currency: prog.currency,
        status: prog.status,
        created_at: prog.created_at,
      }
    })

    return NextResponse.json({ programmes: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/programmes]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/programmes
 * 
 * Create a new programme.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ProgrammeResponse | { error: string; details?: unknown }>> {
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

    if (!body.title || typeof body.title !== 'string') {
      validationErrors.push('title is required and must be a string')
    } else if (body.title.length > 200) {
      validationErrors.push('title must be 200 characters or less')
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        validationErrors.push('description must be a string')
      } else if (body.description.length > 1000) {
        validationErrors.push('description must be 1000 characters or less')
      }
    }

    if (!body.schedule_type || !['fixed', 'rolling'].includes(body.schedule_type)) {
      validationErrors.push('schedule_type must be either "fixed" or "rolling"')
    }

    if (body.day_of_week === undefined || body.day_of_week === null) {
      validationErrors.push('day_of_week is required')
    } else if (typeof body.day_of_week !== 'number' || body.day_of_week < 0 || body.day_of_week > 6) {
      validationErrors.push('day_of_week must be a number between 0 and 6')
    }

    if (!body.start_time || typeof body.start_time !== 'string') {
      validationErrors.push('start_time is required and must be a string (HH:MM format)')
    }

    if (!body.duration_minutes || typeof body.duration_minutes !== 'number') {
      validationErrors.push('duration_minutes is required and must be a number')
    } else if (body.duration_minutes < 15 || body.duration_minutes > 480) {
      validationErrors.push('duration_minutes must be between 15 and 480')
    }

    if (!body.max_spots || typeof body.max_spots !== 'number') {
      validationErrors.push('max_spots is required and must be a number')
    } else if (body.max_spots < 2 || body.max_spots > 100) {
      validationErrors.push('max_spots must be between 2 and 100')
    }

    if (!body.payment_type || !['per_session', 'block_upfront'].includes(body.payment_type)) {
      validationErrors.push('payment_type must be either "per_session" or "block_upfront"')
    }

    // Validate payment fields based on payment_type
    if (body.payment_type === 'per_session') {
      if (!body.price_per_session_pence || typeof body.price_per_session_pence !== 'number') {
        validationErrors.push('price_per_session_pence is required for per_session payment type')
      } else if (body.price_per_session_pence < 100) {
        validationErrors.push('price_per_session_pence must be at least 100 (£1.00)')
      }
    } else if (body.payment_type === 'block_upfront') {
      if (!body.block_price_pence || typeof body.block_price_pence !== 'number') {
        validationErrors.push('block_price_pence is required for block_upfront payment type')
      } else if (body.block_price_pence < 100) {
        validationErrors.push('block_price_pence must be at least 100 (£1.00)')
      }

      if (!body.block_session_count || typeof body.block_session_count !== 'number') {
        validationErrors.push('block_session_count is required for block_upfront payment type')
      } else if (body.block_session_count < 2) {
        validationErrors.push('block_session_count must be at least 2')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. Verify sport_id is in coach's configured sports
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('coach_profile_id', coachProfile.id)
      .eq('sport_id', body.sport_id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json(
        { error: 'Sport not configured. Add it in My Profile → Sports first.' },
        { status: 400 }
      )
    }

    // Validate skill_level if provided
    const VALID_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'all']
    const skillLevel: string = body.skill_level && VALID_SKILL_LEVELS.includes(body.skill_level)
      ? body.skill_level
      : 'all'

    // Validate status if provided
    const requestedStatus: string = body.status === 'active' ? 'active' : 'draft'

    // 6. Insert new programme
    const insertData: {
      coach_profile_id: string
      sport_id: string
      title: string
      description?: string | null
      schedule_type: string
      day_of_week: number
      start_time: string
      duration_minutes: number
      session_count?: number | null
      max_spots: number
      payment_type: string
      price_per_session_pence: number
      block_price_pence?: number | null
      block_session_count?: number | null
      late_joining_allowed: boolean
      model: string
      skill_level: string
      status: string
      currency: string
    } = {
      coach_profile_id: coachProfile.id,
      sport_id: body.sport_id,
      title: body.title,
      schedule_type: body.schedule_type,
      day_of_week: body.day_of_week,
      start_time: normalizeTime(body.start_time),
      duration_minutes: body.duration_minutes,
      max_spots: body.max_spots,
      payment_type: body.payment_type,
      price_per_session_pence: body.price_per_session_pence || 0,
      late_joining_allowed: body.late_joining_allowed === true,
      model: 'programme',
      skill_level: skillLevel,
      status: requestedStatus,
      currency: 'GBP',
    }

    if (body.description !== undefined) {
      insertData.description = body.description
    }

    if (body.schedule_type === 'fixed' && typeof body.session_count === 'number' && body.session_count > 0) {
      insertData.session_count = body.session_count
    }

    if (body.payment_type === 'block_upfront') {
      insertData.block_price_pence = body.block_price_pence
      // Use session_count as block_session_count when not explicitly provided
      insertData.block_session_count = typeof body.block_session_count === 'number'
        ? body.block_session_count
        : (typeof body.session_count === 'number' ? body.session_count : null)
    }

    // Fix-62: Use admin client for INSERT only — user is already authenticated and
    // coach ownership verified above. Bypasses RLS to avoid auth_user_id mapping
    // mismatch on dev DB (same root cause as Fix-19).
    const adminSupabase = createAdminClient()
    const { data: newProgramme, error: insertError } = await adminSupabase
      .from('group_programmes')
      .insert(insertData)
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

    if (insertError) {
      console.error('[POST /api/coaches/programmes] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create programme' }, { status: 500 })
    }

    // 7. Build response
    const sportData = newProgramme.sports
      ? (Array.isArray(newProgramme.sports) ? newProgramme.sports[0] : newProgramme.sports)
      : null

    const response: ProgrammeResponse = {
      id: newProgramme.id,
      sport_id: newProgramme.sport_id,
      sport_name: sportData?.name || '',
      title: newProgramme.title,
      description: newProgramme.description,
      schedule_type: newProgramme.schedule_type,
      day_of_week: newProgramme.day_of_week,
      day_name: getDayName(newProgramme.day_of_week),
      start_time: newProgramme.start_time,
      duration_minutes: newProgramme.duration_minutes,
      max_spots: newProgramme.max_spots,
      current_spots: newProgramme.current_spots,
      spots_remaining: newProgramme.max_spots - newProgramme.current_spots,
      payment_type: newProgramme.payment_type,
      price_per_session_pence: newProgramme.price_per_session_pence,
      block_price_pence: newProgramme.block_price_pence,
      block_session_count: newProgramme.block_session_count,
      currency: newProgramme.currency,
      status: newProgramme.status,
      created_at: newProgramme.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/programmes]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
