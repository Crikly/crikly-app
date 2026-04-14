import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Coach qualification response
 */
interface QualificationResponse {
  id: string
  qualification_type_id: string | null
  type_name: string | null
  issuing_body: string | null
  custom_name: string | null
  issued_date: string | null
  expiry_date: string | null
  notes: string | null
  is_custom: boolean
  created_at: string
}

/**
 * GET /api/coaches/qualifications
 * 
 * Returns all qualifications for the authenticated coach.
 */
export async function GET(): Promise<NextResponse<{ qualifications: QualificationResponse[] } | { error: string }>> {
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

    // 4. Fetch qualifications with optional qualification_types join
    const { data: qualifications, error: qualError } = await supabase
      .from('coach_qualifications')
      .select(`
        id,
        qualification_type_id,
        custom_name,
        issuing_body,
        issued_date,
        expiry_date,
        notes,
        created_at,
        qualification_types (
          name,
          issuing_body
        )
      `)
      .eq('coach_profile_id', coachProfile.id)
      .order('created_at', { ascending: false })

    if (qualError) {
      console.error('[GET /api/coaches/qualifications] fetch error:', qualError)
      return NextResponse.json({ error: 'Failed to fetch qualifications' }, { status: 500 })
    }

    // 5. Build response
    const response: QualificationResponse[] = (qualifications || []).map((q) => {
      const typeData = q.qualification_types
        ? (Array.isArray(q.qualification_types) ? q.qualification_types[0] : q.qualification_types)
        : null

      return {
        id: q.id,
        qualification_type_id: q.qualification_type_id,
        type_name: typeData?.name || null,
        issuing_body: q.issuing_body || typeData?.issuing_body || null,
        custom_name: q.custom_name,
        issued_date: q.issued_date,
        expiry_date: q.expiry_date,
        notes: q.notes,
        is_custom: q.qualification_type_id === null,
        created_at: q.created_at,
      }
    })

    return NextResponse.json({ qualifications: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/qualifications]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/qualifications
 * 
 * Add a new qualification (structured or custom).
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<QualificationResponse | { error: string; details?: unknown }>> {
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

    // Must have EITHER qualification_type_id OR custom_name, not both, not neither
    const hasTypeId = body.qualification_type_id !== undefined && body.qualification_type_id !== null
    const hasCustomName = body.custom_name !== undefined && body.custom_name !== null && body.custom_name.trim() !== ''

    if (!hasTypeId && !hasCustomName) {
      validationErrors.push('Must provide either qualification_type_id or custom_name')
    }

    if (hasTypeId && hasCustomName) {
      validationErrors.push('Cannot provide both qualification_type_id and custom_name')
    }

    // Validate qualification_type_id if provided
    if (hasTypeId) {
      if (typeof body.qualification_type_id !== 'string') {
        validationErrors.push('qualification_type_id must be a string')
      }
    }

    // Validate custom_name if provided
    if (hasCustomName) {
      if (typeof body.custom_name !== 'string') {
        validationErrors.push('custom_name must be a string')
      } else if (body.custom_name.length > 200) {
        validationErrors.push('custom_name must be 200 characters or less')
      }
    }

    // Validate issuing_body
    if (body.issuing_body !== undefined && body.issuing_body !== null) {
      if (typeof body.issuing_body !== 'string') {
        validationErrors.push('issuing_body must be a string')
      } else if (body.issuing_body.length > 200) {
        validationErrors.push('issuing_body must be 200 characters or less')
      }
    }

    // Validate dates
    if (body.issued_date !== undefined && body.issued_date !== null) {
      if (typeof body.issued_date !== 'string') {
        validationErrors.push('issued_date must be a string (ISO date)')
      } else {
        const issuedDate = new Date(body.issued_date)
        if (isNaN(issuedDate.getTime())) {
          validationErrors.push('issued_date must be a valid ISO date')
        }
      }
    }

    if (body.expiry_date !== undefined && body.expiry_date !== null) {
      if (typeof body.expiry_date !== 'string') {
        validationErrors.push('expiry_date must be a string (ISO date)')
      } else {
        const expiryDate = new Date(body.expiry_date)
        if (isNaN(expiryDate.getTime())) {
          validationErrors.push('expiry_date must be a valid ISO date')
        }

        // Check expiry_date is after issued_date if both provided
        if (body.issued_date) {
          const issuedDate = new Date(body.issued_date)
          if (!isNaN(issuedDate.getTime()) && expiryDate <= issuedDate) {
            validationErrors.push('expiry_date must be after issued_date')
          }
        }
      }
    }

    // Validate notes
    if (body.notes !== undefined && body.notes !== null) {
      if (typeof body.notes !== 'string') {
        validationErrors.push('notes must be a string')
      } else if (body.notes.length > 500) {
        validationErrors.push('notes must be 500 characters or less')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. If qualification_type_id provided, verify it exists
    if (hasTypeId) {
      const { data: typeExists, error: typeCheckError } = await supabase
        .from('qualification_types')
        .select('id')
        .eq('id', body.qualification_type_id)
        .single()

      if (typeCheckError || !typeExists) {
        return NextResponse.json({ error: 'Qualification type not found' }, { status: 404 })
      }

      // Check for duplicate qualification_type_id
      const { data: duplicate, error: dupError } = await supabase
        .from('coach_qualifications')
        .select('id')
        .eq('coach_profile_id', coachProfile.id)
        .eq('qualification_type_id', body.qualification_type_id)
        .single()

      if (duplicate && !dupError) {
        return NextResponse.json({ error: 'You have already added this qualification' }, { status: 409 })
      }
    }

    // 6. Insert qualification
    const insertData: {
      coach_profile_id: string
      qualification_type_id?: string | null
      custom_name?: string | null
      issuing_body?: string | null
      issued_date?: string | null
      expiry_date?: string | null
      notes?: string | null
    } = {
      coach_profile_id: coachProfile.id,
    }

    if (hasTypeId) {
      insertData.qualification_type_id = body.qualification_type_id
    } else {
      insertData.qualification_type_id = null
    }

    if (hasCustomName) {
      insertData.custom_name = body.custom_name
    }

    if (body.issuing_body !== undefined) {
      insertData.issuing_body = body.issuing_body
    }

    if (body.issued_date !== undefined) {
      insertData.issued_date = body.issued_date
    }

    if (body.expiry_date !== undefined) {
      insertData.expiry_date = body.expiry_date
    }

    if (body.notes !== undefined) {
      insertData.notes = body.notes
    }

    // Fix-16a: Insert without join - joins not supported on insert
    const { data: newQual, error: insertError } = await supabase
      .from('coach_qualifications')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/qualifications] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to add qualification' }, { status: 500 })
    }

    // 7. Fetch qualification type data separately if needed
    let typeData = null
    if (newQual.qualification_type_id) {
      const { data: qualType } = await supabase
        .from('qualification_types')
        .select('name, issuing_body')
        .eq('id', newQual.qualification_type_id)
        .single()
      typeData = qualType
    }

    const response: QualificationResponse = {
      id: newQual.id,
      qualification_type_id: newQual.qualification_type_id,
      type_name: typeData?.name || null,
      issuing_body: newQual.issuing_body || typeData?.issuing_body || null,
      custom_name: newQual.custom_name,
      issued_date: newQual.issued_date,
      expiry_date: newQual.expiry_date,
      notes: newQual.notes,
      is_custom: newQual.qualification_type_id === null,
      created_at: newQual.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/qualifications]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
