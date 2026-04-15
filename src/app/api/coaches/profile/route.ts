import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Coach profile response shape
 */
interface CoachProfileResponse {
  id: string
  user_profile_id: string
  full_name: string
  avatar_url: string | null
  location_city: string | null
  location_postcode: string | null
  bio: string | null
  years_experience: number | null
  dbs_status: 'none' | 'pending' | 'verified' | 'expired'
  is_profile_live: boolean
  stripe_onboarding_complete: boolean
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  gender: string | null
  created_at: string
  updated_at: string
}

/**
 * GET /api/coaches/profile
 * 
 * Returns the authenticated coach's full profile.
 * Joins with user_profiles to include identity data.
 */
export async function GET(): Promise<NextResponse<CoachProfileResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    
    // 1. Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Check coach role exists
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, auth_user_id')
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

    // 3. Fetch coach profile with user_profiles join
    const { data: coachProfile, error: coachError } = await supabase
      .from('coach_profiles')
      .select(`
        id,
        user_profile_id,
        bio,
        years_experience,
        dbs_status,
        is_profile_live,
        stripe_onboarding_complete,
        cancellation_window_hours,
        min_advance_hours,
        max_advance_days,
        rating_avg,
        rating_count,
        sessions_completed,
        gender,
        created_at,
        updated_at,
        user_profiles!inner (
          full_name,
          avatar_url,
          location_city,
          location_postcode
        )
      `)
      .eq('user_profile_id', userProfile.id)
      .single()

    if (coachError || !coachProfile) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
    }

    // 4. Flatten response
    const userProfileData = Array.isArray(coachProfile.user_profiles) 
      ? coachProfile.user_profiles[0] 
      : coachProfile.user_profiles

    const response: CoachProfileResponse = {
      id: coachProfile.id,
      user_profile_id: coachProfile.user_profile_id,
      full_name: userProfileData.full_name,
      avatar_url: userProfileData.avatar_url,
      location_city: userProfileData.location_city,
      location_postcode: userProfileData.location_postcode,
      bio: coachProfile.bio,
      years_experience: coachProfile.years_experience,
      dbs_status: coachProfile.dbs_status as 'none' | 'pending' | 'verified' | 'expired',
      is_profile_live: coachProfile.is_profile_live,
      stripe_onboarding_complete: coachProfile.stripe_onboarding_complete,
      cancellation_window_hours: coachProfile.cancellation_window_hours,
      min_advance_hours: coachProfile.min_advance_hours,
      max_advance_days: coachProfile.max_advance_days,
      rating_avg: coachProfile.rating_avg,
      rating_count: coachProfile.rating_count,
      sessions_completed: coachProfile.sessions_completed,
      gender: coachProfile.gender,
      created_at: coachProfile.created_at,
      updated_at: coachProfile.updated_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/profile]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/profile
 * 
 * Creates or updates the coach's profile (upsert).
 * Used during onboarding and profile edit.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CoachProfileResponse | { error: string; details?: unknown }>> {
  try {
    const supabase = await createClient()
    
    // 1. Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Check coach role exists
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, auth_user_id')
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

    // 3. Parse and validate body
    const body = await request.json()

    const validationErrors: string[] = []

    // Validate coach_profiles fields
    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string') {
        validationErrors.push('bio must be a string')
      } else if (body.bio.length > 500) {
        validationErrors.push('bio must be 500 characters or less')
      }
    }

    if (body.years_experience !== undefined) {
      if (typeof body.years_experience !== 'number' || !Number.isInteger(body.years_experience)) {
        validationErrors.push('years_experience must be an integer')
      } else if (body.years_experience < 0 || body.years_experience > 50) {
        validationErrors.push('years_experience must be between 0 and 50')
      }
    }

    if (body.gender !== undefined) {
      const validGenders = ['male', 'female', 'other', 'prefer_not_to_say']
      if (!validGenders.includes(body.gender)) {
        validationErrors.push('gender must be one of: male, female, other, prefer_not_to_say')
      }
    }

    if (body.cancellation_window_hours !== undefined) {
      const validWindows = [0, 12, 24, 48, 72]
      if (!validWindows.includes(body.cancellation_window_hours)) {
        validationErrors.push('cancellation_window_hours must be one of: 0, 12, 24, 48, 72')
      }
    }

    if (body.min_advance_hours !== undefined) {
      if (typeof body.min_advance_hours !== 'number' || !Number.isInteger(body.min_advance_hours)) {
        validationErrors.push('min_advance_hours must be an integer')
      } else if (body.min_advance_hours < 1 || body.min_advance_hours > 168) {
        validationErrors.push('min_advance_hours must be between 1 and 168')
      }
    }

    if (body.max_advance_days !== undefined) {
      if (typeof body.max_advance_days !== 'number' || !Number.isInteger(body.max_advance_days)) {
        validationErrors.push('max_advance_days must be an integer')
      } else if (body.max_advance_days < 1 || body.max_advance_days > 365) {
        validationErrors.push('max_advance_days must be between 1 and 365')
      }
    }

    // Validate user_profiles fields
    if (body.full_name !== undefined) {
      if (typeof body.full_name !== 'string') {
        validationErrors.push('full_name must be a string')
      } else if (body.full_name.length > 100) {
        validationErrors.push('full_name must be 100 characters or less')
      } else if (body.full_name.trim().length === 0) {
        validationErrors.push('full_name cannot be empty')
      }
    }

    if (body.location_city !== undefined && body.location_city !== null) {
      if (typeof body.location_city !== 'string') {
        validationErrors.push('location_city must be a string')
      }
    }

    if (body.location_postcode !== undefined && body.location_postcode !== null) {
      if (typeof body.location_postcode !== 'string') {
        validationErrors.push('location_postcode must be a string')
      }
    }

    if (body.avatar_url !== undefined && body.avatar_url !== null) {
      if (typeof body.avatar_url !== 'string') {
        validationErrors.push('avatar_url must be a string')
      }
    }

    // Fix-16e: Validate languages if provided
    if (body.languages !== undefined && body.languages !== null) {
      if (!Array.isArray(body.languages)) {
        validationErrors.push('languages must be an array')
      } else if (body.languages.some((lang: unknown) => typeof lang !== 'string')) {
        validationErrors.push('languages must be an array of strings')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 4. Update user_profiles if any fields provided
    const userProfileUpdates: Record<string, unknown> = {}
    if (body.full_name !== undefined) userProfileUpdates.full_name = body.full_name
    if (body.location_city !== undefined) userProfileUpdates.location_city = body.location_city
    if (body.location_postcode !== undefined) userProfileUpdates.location_postcode = body.location_postcode
    if (body.avatar_url !== undefined) userProfileUpdates.avatar_url = body.avatar_url

    if (Object.keys(userProfileUpdates).length > 0) {
      userProfileUpdates.updated_at = new Date().toISOString()
      
      const { error: userUpdateError } = await supabase
        .from('user_profiles')
        .update(userProfileUpdates)
        .eq('id', userProfile.id)

      if (userUpdateError) {
        console.error('[POST /api/coaches/profile] user_profiles update error:', userUpdateError)
        return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 })
      }
    }

    // 5. Upsert coach_profiles
    const coachProfileUpdates: {
      user_profile_id: string
      bio?: string | null
      years_experience?: number | null
      gender?: string | null
      languages?: string[]
      cancellation_window_hours?: number
      min_advance_hours?: number
      max_advance_days?: number
      updated_at: string
    } = {
      user_profile_id: userProfile.id,
      updated_at: new Date().toISOString(),
    }

    if (body.bio !== undefined) coachProfileUpdates.bio = body.bio
    if (body.years_experience !== undefined) coachProfileUpdates.years_experience = body.years_experience
    if (body.gender !== undefined) coachProfileUpdates.gender = body.gender
    // Fix-16e: Add languages to coach profile updates
    if (body.languages !== undefined && Array.isArray(body.languages)) coachProfileUpdates.languages = body.languages
    if (body.cancellation_window_hours !== undefined) coachProfileUpdates.cancellation_window_hours = body.cancellation_window_hours
    if (body.min_advance_hours !== undefined) coachProfileUpdates.min_advance_hours = body.min_advance_hours
    if (body.max_advance_days !== undefined) coachProfileUpdates.max_advance_days = body.max_advance_days

    const { error: coachUpsertError } = await supabase
      .from('coach_profiles')
      .upsert(coachProfileUpdates, {
        onConflict: 'user_profile_id',
      })

    if (coachUpsertError) {
      console.error('[POST /api/coaches/profile] coach_profiles upsert error:', coachUpsertError)
      return NextResponse.json({ error: 'Failed to update coach profile' }, { status: 500 })
    }

    // 6. Fetch and return updated profile
    const { data: updatedProfile, error: fetchError } = await supabase
      .from('coach_profiles')
      .select(`
        id,
        user_profile_id,
        bio,
        years_experience,
        dbs_status,
        is_profile_live,
        stripe_onboarding_complete,
        cancellation_window_hours,
        min_advance_hours,
        max_advance_days,
        rating_avg,
        rating_count,
        sessions_completed,
        gender,
        created_at,
        updated_at,
        user_profiles!inner (
          full_name,
          avatar_url,
          location_city,
          location_postcode
        )
      `)
      .eq('user_profile_id', userProfile.id)
      .single()

    if (fetchError || !updatedProfile) {
      console.error('[POST /api/coaches/profile] fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch updated profile' }, { status: 500 })
    }

    // 7. Flatten response
    const userProfileData = Array.isArray(updatedProfile.user_profiles) 
      ? updatedProfile.user_profiles[0] 
      : updatedProfile.user_profiles

    const response: CoachProfileResponse = {
      id: updatedProfile.id,
      user_profile_id: updatedProfile.user_profile_id,
      full_name: userProfileData.full_name,
      avatar_url: userProfileData.avatar_url,
      location_city: userProfileData.location_city,
      location_postcode: userProfileData.location_postcode,
      bio: updatedProfile.bio,
      years_experience: updatedProfile.years_experience,
      dbs_status: updatedProfile.dbs_status as 'none' | 'pending' | 'verified' | 'expired',
      is_profile_live: updatedProfile.is_profile_live,
      stripe_onboarding_complete: updatedProfile.stripe_onboarding_complete,
      cancellation_window_hours: updatedProfile.cancellation_window_hours,
      min_advance_hours: updatedProfile.min_advance_hours,
      max_advance_days: updatedProfile.max_advance_days,
      rating_avg: updatedProfile.rating_avg,
      rating_count: updatedProfile.rating_count,
      sessions_completed: updatedProfile.sessions_completed,
      gender: updatedProfile.gender,
      created_at: updatedProfile.created_at,
      updated_at: updatedProfile.updated_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[POST /api/coaches/profile]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
