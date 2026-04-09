import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Coach photo response
 */
interface PhotoResponse {
  id: string
  photo_url: string
  sort_order: number
  is_primary: boolean
  created_at: string
}

/**
 * GET /api/coaches/photos
 * 
 * Returns all photos for the authenticated coach.
 */
export async function GET(): Promise<NextResponse<{ photos: PhotoResponse[] } | { error: string }>> {
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

    // 4. Fetch photos ordered by sort_order
    const { data: photos, error: photosError } = await supabase
      .from('coach_photos')
      .select('id, photo_url, sort_order, is_primary, created_at')
      .eq('coach_profile_id', coachProfile.id)
      .order('sort_order', { ascending: true })

    if (photosError) {
      console.error('[GET /api/coaches/photos] fetch error:', photosError)
      return NextResponse.json({ error: 'Failed to fetch photos' }, { status: 500 })
    }

    const response: PhotoResponse[] = (photos || []).map((p) => ({
      id: p.id,
      photo_url: p.photo_url,
      sort_order: p.sort_order,
      is_primary: p.is_primary,
      created_at: p.created_at,
    }))

    return NextResponse.json({ photos: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/photos]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/photos
 * 
 * Add a new photo. Enforces tier limits.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<PhotoResponse | { error: string; details?: unknown }>> {
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

    if (!body.photo_url || typeof body.photo_url !== 'string') {
      validationErrors.push('photo_url is required and must be a string')
    } else {
      // Basic URL validation
      try {
        new URL(body.photo_url)
      } catch {
        validationErrors.push('photo_url must be a valid URL')
      }
    }

    if (body.is_primary !== undefined && typeof body.is_primary !== 'boolean') {
      validationErrors.push('is_primary must be a boolean')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. Check subscription tier and enforce limits
    // Get active subscription
    const { data: subscription, error: subError } = await supabase
      .from('coach_subscriptions')
      .select(`
        tier_id,
        subscription_tiers!inner (
          name
        )
      `)
      .eq('coach_profile_id', coachProfile.id)
      .eq('status', 'active')
      .single()

    // Determine tier (default to Free if no active subscription)
    const tierName = subscription && !subError
      ? (Array.isArray(subscription.subscription_tiers) 
          ? subscription.subscription_tiers[0]?.name 
          : subscription.subscription_tiers?.name)
      : 'Free'

    // Check photo count for Free tier
    if (tierName === 'Free') {
      const { count, error: countError } = await supabase
        .from('coach_photos')
        .select('id', { count: 'exact', head: true })
        .eq('coach_profile_id', coachProfile.id)

      if (countError) {
        console.error('[POST /api/coaches/photos] count error:', countError)
        return NextResponse.json({ error: 'Failed to check photo limit' }, { status: 500 })
      }

      if (count !== null && count >= 1) {
        return NextResponse.json(
          { error: 'Upgrade to Premium to add more photos' },
          { status: 403 }
        )
      }
    }

    // 6. Get current max sort_order and check if this is first photo
    const { data: existingPhotos, error: existingError } = await supabase
      .from('coach_photos')
      .select('sort_order')
      .eq('coach_profile_id', coachProfile.id)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (existingError) {
      console.error('[POST /api/coaches/photos] existing photos error:', existingError)
      return NextResponse.json({ error: 'Failed to check existing photos' }, { status: 500 })
    }

    const isFirstPhoto = !existingPhotos || existingPhotos.length === 0
    const maxSortOrder = existingPhotos && existingPhotos.length > 0 ? existingPhotos[0].sort_order : -1
    const newSortOrder = maxSortOrder + 1

    // If first photo, force is_primary = true
    const isPrimary = isFirstPhoto ? true : (body.is_primary || false)

    // 7. If setting as primary, unset all other photos
    if (isPrimary) {
      const { error: unsetError } = await supabase
        .from('coach_photos')
        .update({ is_primary: false })
        .eq('coach_profile_id', coachProfile.id)

      if (unsetError) {
        console.error('[POST /api/coaches/photos] unset primary error:', unsetError)
        return NextResponse.json({ error: 'Failed to update primary photo' }, { status: 500 })
      }
    }

    // 8. Insert new photo
    const { data: newPhoto, error: insertError } = await supabase
      .from('coach_photos')
      .insert({
        coach_profile_id: coachProfile.id,
        photo_url: body.photo_url,
        sort_order: newSortOrder,
        is_primary: isPrimary,
      })
      .select('id, photo_url, sort_order, is_primary, created_at')
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/photos] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to add photo' }, { status: 500 })
    }

    const response: PhotoResponse = {
      id: newPhoto.id,
      photo_url: newPhoto.photo_url,
      sort_order: newPhoto.sort_order,
      is_primary: newPhoto.is_primary,
      created_at: newPhoto.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/photos]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
