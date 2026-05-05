import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface PhotoResponse {
  id: string
  photo_url: string
  sort_order: number
  is_primary: boolean
  created_at: string
}

/**
 * PATCH /api/coaches/photos/[photoId]
 * 
 * Update photo metadata (is_primary, sort_order).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
): Promise<NextResponse<PhotoResponse | { error: string; details?: unknown }>> {
  try {
    const { photoId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this photo
    const { data: existingPhoto, error: photoCheckError } = await supabase
      .from('coach_photos')
      .select('id')
      .eq('id', photoId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (photoCheckError || !existingPhoto) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    // Cannot update photo_url
    if (body.photo_url !== undefined) {
      validationErrors.push('Cannot update photo_url after upload')
    }

    if (body.is_primary !== undefined && typeof body.is_primary !== 'boolean') {
      validationErrors.push('is_primary must be a boolean')
    }

    if (body.sort_order !== undefined) {
      if (typeof body.sort_order !== 'number' || body.sort_order < 0) {
        validationErrors.push('sort_order must be a non-negative number')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 6. If setting as primary, unset all other photos first
    if (body.is_primary === true) {
      const { error: unsetError } = await supabase
        .from('coach_photos')
        .update({ is_primary: false })
        .eq('coach_profile_id', coachProfile.id)
        .neq('id', photoId)

      if (unsetError) {
        console.error('[PATCH /api/coaches/photos/[photoId]] unset primary error:', unsetError)
        return NextResponse.json({ error: 'Failed to update primary photo' }, { status: 500 })
      }
    }

    // 7. Build update object
    const updateData: {
      is_primary?: boolean
      sort_order?: number
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.is_primary !== undefined) updateData.is_primary = body.is_primary
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

    // 8. Update photo
    const { data: updatedPhoto, error: updateError } = await supabase
      .from('coach_photos')
      .update(updateData)
      .eq('id', photoId)
      .eq('coach_profile_id', coachProfile.id)
      .select('id, photo_url, sort_order, is_primary, created_at')
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/photos/[photoId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 })
    }

    const response: PhotoResponse = {
      id: updatedPhoto.id,
      photo_url: updatedPhoto.photo_url,
      sort_order: updatedPhoto.sort_order,
      is_primary: updatedPhoto.is_primary,
      created_at: updatedPhoto.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/photos/[photoId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/photos/[photoId]
 * 
 * Hard delete photo metadata. If deleting primary photo, promote next photo.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { photoId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this photo and check if it's primary
    const { data: existingPhoto, error: photoCheckError } = await supabase
      .from('coach_photos')
      .select('id, is_primary')
      .eq('id', photoId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (photoCheckError || !existingPhoto) {
      return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 })
    }

    const wasPrimary = existingPhoto.is_primary

    // 5. Delete the photo
    const { error: deleteError } = await supabase
      .from('coach_photos')
      .delete()
      .eq('id', photoId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/photos/[photoId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
    }

    // 6. If deleted photo was primary, promote the next photo (lowest sort_order)
    if (wasPrimary) {
      const { data: nextPhoto, error: nextError } = await supabase
        .from('coach_photos')
        .select('id')
        .eq('coach_profile_id', coachProfile.id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single()

      // Only promote if there are remaining photos
      if (nextPhoto && !nextError) {
        const { error: promoteError } = await supabase
          .from('coach_photos')
          .update({ is_primary: true })
          .eq('id', nextPhoto.id)

        if (promoteError) {
          console.error('[DELETE /api/coaches/photos/[photoId]] promote error:', promoteError)
          // Don't fail the delete if promotion fails - just log it
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/photos/[photoId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
