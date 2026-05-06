import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

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
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

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
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

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

    // 5. Enforce global 10-photo limit (all tiers)
    const { count, error: countError } = await supabase
      .from('coach_photos')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)

    if (countError) {
      console.error('[POST /api/coaches/photos] count error:', countError)
      return NextResponse.json({ error: 'Failed to check photo limit' }, { status: 500 })
    }

    if (count !== null && count >= 10) {
      return NextResponse.json(
        { error: 'Maximum 10 photos allowed per coach' },
        { status: 403 }
      )
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

/**
 * DELETE /api/coaches/photos
 *
 * Remove a photo by ID. Deletes from DB and Supabase Storage.
 * Body: { photo_id: string }
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<{ success: true } | { error: string }>> {
  try {
    const supabase = await createClient()

    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Parse body
    const body = await request.json()
    if (!body.photo_id || typeof body.photo_id !== 'string') {
      return NextResponse.json({ error: 'photo_id is required' }, { status: 400 })
    }

    // 5. Verify ownership and get photo_url
    const { data: photo, error: fetchError } = await supabase
      .from('coach_photos')
      .select('id, photo_url')
      .eq('id', body.photo_id)
      .eq('coach_profile_id', coachProfile.id)
      .single()
    if (fetchError || !photo) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 })
    }

    // AF-H-54: storage first so DB delete only happens after the file has been handled.
    // URL extraction via new URL() — was fragile string split (broke on signed URLs / query strings).
    let storagePath: string | null = null
    try {
      const url = new URL(photo.photo_url)
      const marker = '/coach-photos/'
      const idx = url.pathname.indexOf(marker)
      storagePath = idx >= 0 ? url.pathname.slice(idx + marker.length) : null
    } catch {
      // Malformed URL — skip storage cleanup, proceed to DB delete
    }

    // 6. Delete from Storage first (non-fatal — preserves prior user-visible behaviour for storage-down case)
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from('coach-photos')
        .remove([storagePath])
      if (storageError) {
        console.error('[DELETE /api/coaches/photos] storage delete error:', storageError)
        // Non-fatal — continue to DB delete
      }
    }

    // 7. Delete DB row
    const { error: deleteError } = await supabase
      .from('coach_photos')
      .delete()
      .eq('id', photo.id)
    if (deleteError) {
      console.error('[DELETE /api/coaches/photos] db delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/photos]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
