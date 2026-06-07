import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface VenueResponse {
  id: string
  name: string
  address: string | null
  postcode: string | null
  lat: number | null
  lng: number | null
  is_default: boolean
  created_at: string
}

/**
 * PATCH /api/coaches/venues/[venueId]
 * 
 * Update a venue.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
): Promise<NextResponse<VenueResponse | { error: string; details?: unknown }>> {
  try {
    const { venueId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this venue
    const { data: existingVenue, error: venueCheckError } = await supabase
      .from('coach_venues')
      .select('id')
      .eq('id', venueId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (venueCheckError || !existingVenue) {
      return NextResponse.json({ error: 'Venue not found or access denied' }, { status: 404 })
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.name !== undefined) {
      if (typeof body.name !== 'string') {
        validationErrors.push('name must be a string')
      } else if (body.name.length > 200) {
        validationErrors.push('name must be 200 characters or less')
      }
    }

    if (body.address !== undefined && body.address !== null) {
      if (typeof body.address !== 'string') {
        validationErrors.push('address must be a string')
      } else if (body.address.length > 500) {
        validationErrors.push('address must be 500 characters or less')
      }
    }

    if (body.postcode !== undefined && body.postcode !== null) {
      if (typeof body.postcode !== 'string') {
        validationErrors.push('postcode must be a string')
      } else if (body.postcode.length > 20) {
        validationErrors.push('postcode must be 20 characters or less')
      }
    }

    if (body.lat !== undefined && body.lat !== null) {
      if (typeof body.lat !== 'number') {
        validationErrors.push('lat must be a number')
      } else if (body.lat < -90 || body.lat > 90) {
        validationErrors.push('lat must be between -90 and 90')
      }
    }

    if (body.lng !== undefined && body.lng !== null) {
      if (typeof body.lng !== 'number') {
        validationErrors.push('lng must be a number')
      } else if (body.lng < -180 || body.lng > 180) {
        validationErrors.push('lng must be between -180 and 180')
      }
    }

    if (body.is_default !== undefined && typeof body.is_default !== 'boolean') {
      validationErrors.push('is_default must be a boolean')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 6. If setting as default, unset all other venues first
    if (body.is_default === true) {
      const { error: unsetError } = await supabase
        .from('coach_venues')
        .update({ is_default: false })
        .eq('coach_profile_id', coachProfile.id)
        .neq('id', venueId)

      if (unsetError) {
        console.error('[PATCH /api/coaches/venues/[venueId]] unset default error:', unsetError)
        return NextResponse.json({ error: 'Failed to update default venue' }, { status: 500 })
      }
    }

    // 7. Build update object
    const updateData: {
      name?: string
      address?: string | null
      postcode?: string | null
      lat?: number | null
      lng?: number | null
      is_default?: boolean
      updated_at: string
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.name !== undefined) updateData.name = body.name
    if (body.address !== undefined) updateData.address = body.address
    if (body.postcode !== undefined) updateData.postcode = body.postcode
    if (body.lat !== undefined) updateData.lat = body.lat
    if (body.lng !== undefined) updateData.lng = body.lng
    if (body.is_default !== undefined) updateData.is_default = body.is_default

    // 8. Update venue
    const { data: updatedVenue, error: updateError } = await supabase
      .from('coach_venues')
      .update(updateData)
      .eq('id', venueId)
      .eq('coach_profile_id', coachProfile.id)
      .select('id, name, address, postcode, lat, lng, is_default, created_at')
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/venues/[venueId]] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update venue' }, { status: 500 })
    }

    const response: VenueResponse = {
      id: updatedVenue.id,
      name: updatedVenue.name,
      address: updatedVenue.address,
      postcode: updatedVenue.postcode,
      lat: updatedVenue.lat,
      lng: updatedVenue.lng,
      is_default: updatedVenue.is_default,
      created_at: updatedVenue.created_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/venues/[venueId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/venues/[venueId]
 * 
 * Hard delete venue. If deleting default, promote next venue.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { venueId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this venue and check if it's default
    const { data: existingVenue, error: venueCheckError } = await supabase
      .from('coach_venues')
      .select('id, is_default')
      .eq('id', venueId)
      .eq('coach_profile_id', coachProfile.id)
      .single()

    if (venueCheckError || !existingVenue) {
      return NextResponse.json({ error: 'Venue not found or access denied' }, { status: 404 })
    }

    const wasDefault = existingVenue.is_default

    // 5. Delete the venue
    const { error: deleteError } = await supabase
      .from('coach_venues')
      .delete()
      .eq('id', venueId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/venues/[venueId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete venue' }, { status: 500 })
    }

    // 6. If deleted venue was default, promote the next venue (first by name ASC)
    if (wasDefault) {
      const { data: nextVenue, error: nextError } = await supabase
        .from('coach_venues')
        .select('id')
        .eq('coach_profile_id', coachProfile.id)
        .order('name', { ascending: true })
        .limit(1)
        .single()

      // Only promote if there are remaining venues
      if (nextVenue && !nextError) {
        const { error: promoteError } = await supabase
          .from('coach_venues')
          .update({ is_default: true })
          .eq('id', nextVenue.id)

        if (promoteError) {
          console.error('[DELETE /api/coaches/venues/[venueId]] promote error:', promoteError)
          // Don't fail the delete if promotion fails - just log it
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/venues/[venueId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
