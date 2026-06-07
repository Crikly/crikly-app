import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

/**
 * Venue response
 */
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
 * GET /api/coaches/venues
 * 
 * Returns all venues for the authenticated coach.
 */
export async function GET(): Promise<NextResponse<{ venues: VenueResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Fetch venues ordered by is_default DESC, then name ASC
    const { data: venues, error: venuesError } = await supabase
      .from('coach_venues')
      .select('id, name, address, postcode, lat, lng, is_default, created_at')
      .eq('coach_profile_id', coachProfile.id)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true })

    if (venuesError) {
      console.error('[GET /api/coaches/venues] fetch error:', venuesError)
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 })
    }

    const response: VenueResponse[] = (venues || []).map((v) => ({
      id: v.id,
      name: v.name,
      address: v.address,
      postcode: v.postcode,
      lat: v.lat,
      lng: v.lng,
      is_default: v.is_default,
      created_at: v.created_at,
    }))

    return NextResponse.json({ venues: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/venues]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/venues
 * 
 * Add a new venue with max limit enforcement.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<VenueResponse | { error: string; details?: unknown }>> {
  try {
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (!body.name || typeof body.name !== 'string') {
      validationErrors.push('name is required and must be a string')
    } else if (body.name.length > 200) {
      validationErrors.push('name must be 200 characters or less')
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

    // 5. Check venue count limit (max 10)
    const { count, error: countError } = await supabase
      .from('coach_venues')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)

    if (countError) {
      console.error('[POST /api/coaches/venues] count error:', countError)
      return NextResponse.json({ error: 'Failed to check venue limit' }, { status: 500 })
    }

    if (count !== null && count >= 10) {
      return NextResponse.json(
        { error: 'Maximum 10 venues allowed' },
        { status: 400 }
      )
    }

    // 6. Check if this is the first venue
    const isFirstVenue = count === 0

    // If first venue, force is_default = true
    const isDefault = isFirstVenue ? true : (body.is_default || false)

    // 7. If setting as default, unset all other venues
    if (isDefault) {
      const { error: unsetError } = await supabase
        .from('coach_venues')
        .update({ is_default: false })
        .eq('coach_profile_id', coachProfile.id)

      if (unsetError) {
        console.error('[POST /api/coaches/venues] unset default error:', unsetError)
        return NextResponse.json({ error: 'Failed to update default venue' }, { status: 500 })
      }
    }

    // 8. Insert new venue
    const insertData: {
      coach_profile_id: string
      name: string
      address?: string | null
      postcode?: string | null
      lat?: number | null
      lng?: number | null
      is_default: boolean
    } = {
      coach_profile_id: coachProfile.id,
      name: body.name,
      is_default: isDefault,
    }

    if (body.address !== undefined) insertData.address = body.address
    if (body.postcode !== undefined) insertData.postcode = body.postcode
    if (body.lat !== undefined) insertData.lat = body.lat
    if (body.lng !== undefined) insertData.lng = body.lng

    const { data: newVenue, error: insertError } = await supabase
      .from('coach_venues')
      .insert(insertData)
      .select('id, name, address, postcode, lat, lng, is_default, created_at')
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/venues] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to add venue' }, { status: 500 })
    }

    const response: VenueResponse = {
      id: newVenue.id,
      name: newVenue.name,
      address: newVenue.address,
      postcode: newVenue.postcode,
      lat: newVenue.lat,
      lng: newVenue.lng,
      is_default: newVenue.is_default,
      created_at: newVenue.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/venues]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
