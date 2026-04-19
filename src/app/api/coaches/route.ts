import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachSportRow {
  sport_id: string
  session_types: string[]
  skill_levels: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  is_active: boolean
  sports: { id: string; name: string; slug: string } | null
}

interface CoachPhotoRow {
  photo_url: string
  is_primary: boolean
  sort_order: number
}

interface CoachRow {
  id: string
  bio: string | null
  dbs_status: string
  is_featured: boolean
  is_suspended: boolean
  gender: string | null
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  years_experience: number | null
  user_profiles: {
    full_name: string
    location_city: string | null
    location_lat: number | null
    location_lng: number | null
  } | {
    full_name: string
    location_city: string | null
    location_lat: number | null
    location_lng: number | null
  }[]
  coach_sports: CoachSportRow[]
  coach_photos: CoachPhotoRow[]
}

interface CoachSportResult {
  sport_id: string
  sport_name: string
  sport_slug: string
  session_types: string[]
  skill_levels: string[]
  min_price_pence: number | null
}

interface CoachResult {
  id: string
  full_name: string
  bio: string | null
  location_city: string | null
  location_lat: number | null
  location_lng: number | null
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  dbs_status: string
  is_featured: boolean
  gender: string | null
  distance_km: number | null
  sports: CoachSportResult[]
  primary_photo: string | null
}

// ─── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenUserProfile(raw: CoachRow['user_profiles']) {
  return Array.isArray(raw) ? raw[0] : raw
}

function minPrice(sport: CoachSportRow): number | null {
  const prices = [sport.price_individual_pence, sport.price_group_pence].filter(
    (p): p is number => p !== null,
  )
  return prices.length > 0 ? Math.min(...prices) : null
}

function coachMinPrice(sports: CoachSportRow[]): number | null {
  const prices = sports
    .filter(s => s.is_active)
    .map(minPrice)
    .filter((p): p is number => p !== null)
  return prices.length > 0 ? Math.min(...prices) : null
}

function sortCoaches(
  coaches: CoachResult[],
  sort: string,
): CoachResult[] {
  return [...coaches].sort((a, b) => {
    switch (sort) {
      case 'nearest':
        if (a.distance_km === null && b.distance_km === null) return 0
        if (a.distance_km === null) return 1
        if (b.distance_km === null) return -1
        return a.distance_km - b.distance_km

      case 'price_asc': {
        const pa = a.sports.reduce<number | null>((acc, s) => {
          const p = s.min_price_pence
          return p !== null ? (acc === null ? p : Math.min(acc, p)) : acc
        }, null)
        const pb = b.sports.reduce<number | null>((acc, s) => {
          const p = s.min_price_pence
          return p !== null ? (acc === null ? p : Math.min(acc, p)) : acc
        }, null)
        if (pa === null && pb === null) return 0
        if (pa === null) return 1
        if (pb === null) return -1
        return pa - pb
      }

      // sort=available proxies "most active coach" via sessions_completed.
      // Phase 1 only — replace with real-time availability slot count post-launch.
      case 'available':
        return b.sessions_completed - a.sessions_completed

      case 'rating':
      default:
        if (a.rating_avg === null && b.rating_avg === null) return 0
        if (a.rating_avg === null) return 1
        if (b.rating_avg === null) return -1
        return b.rating_avg - a.rating_avg
    }
  })
}

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/coaches
 * Public route — no auth required. Parents can search without being logged in.
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl

    // ── Parse & validate query params ────────────────────────────────────────

    const sport_id = searchParams.get('sport_id')
    const location_lat = searchParams.get('location_lat')
    const location_lng = searchParams.get('location_lng')
    const radius_km_raw = searchParams.get('radius_km')
    const session_type = searchParams.get('session_type')
    const skill_level = searchParams.get('skill_level')
    const min_price_raw = searchParams.get('min_price')
    const max_price_raw = searchParams.get('max_price')
    const dbs_verified = searchParams.get('dbs_verified')
    const gender = searchParams.get('gender')
    const min_rating_raw = searchParams.get('min_rating')
    const sort = searchParams.get('sort') ?? 'rating'
    const page_raw = searchParams.get('page') ?? '1'
    const limit_raw = searchParams.get('limit') ?? '20'

    const validationErrors: string[] = []

    // Coordinates — both required together, or neither
    let searchLat: number | null = null
    let searchLng: number | null = null
    if (location_lat !== null || location_lng !== null) {
      if (location_lat === null || location_lng === null) {
        validationErrors.push('location_lat and location_lng must both be provided')
      } else {
        searchLat = parseFloat(location_lat)
        searchLng = parseFloat(location_lng)
        if (!isFinite(searchLat) || !isFinite(searchLng)) {
          validationErrors.push('location_lat and location_lng must be valid numbers')
        } else if (searchLat < -90 || searchLat > 90) {
          validationErrors.push('location_lat must be between -90 and 90')
        } else if (searchLng < -180 || searchLng > 180) {
          validationErrors.push('location_lng must be between -180 and 180')
        }
      }
    }

    const radius_km = radius_km_raw !== null ? parseInt(radius_km_raw, 10) : 10
    if (!Number.isInteger(radius_km) || radius_km < 1 || radius_km > 500) {
      validationErrors.push('radius_km must be an integer between 1 and 500')
    }

    const min_price = min_price_raw !== null ? parseInt(min_price_raw, 10) : null
    if (min_price !== null && (!Number.isInteger(min_price) || min_price < 0)) {
      validationErrors.push('min_price must be a non-negative integer (pence)')
    }

    const max_price = max_price_raw !== null ? parseInt(max_price_raw, 10) : null
    if (max_price !== null && (!Number.isInteger(max_price) || max_price < 0)) {
      validationErrors.push('max_price must be a non-negative integer (pence)')
    }

    const min_rating = min_rating_raw !== null ? parseFloat(min_rating_raw) : null
    if (min_rating !== null && (!isFinite(min_rating) || min_rating < 0 || min_rating > 5)) {
      validationErrors.push('min_rating must be a number between 0 and 5')
    }

    const page = parseInt(page_raw, 10)
    if (!Number.isInteger(page) || page < 1) {
      validationErrors.push('page must be a positive integer')
    }

    const limit = Math.min(parseInt(limit_raw, 10), 50)
    if (!Number.isInteger(limit) || limit < 1) {
      validationErrors.push('limit must be a positive integer (max 50)')
    }

    const validSorts = ['nearest', 'rating', 'price_asc', 'available']
    if (!validSorts.includes(sort)) {
      validationErrors.push(`sort must be one of: ${validSorts.join(', ')}`)
    }

    const validSessionTypes = ['individual', 'group']
    if (session_type !== null && !validSessionTypes.includes(session_type)) {
      validationErrors.push('session_type must be individual or group')
    }

    const validSkillLevels = ['beginner', 'intermediate', 'advanced']
    if (skill_level !== null && !validSkillLevels.includes(skill_level)) {
      validationErrors.push('skill_level must be beginner, intermediate, or advanced')
    }

    const validGenders = ['male', 'female', 'other']
    if (gender !== null && !validGenders.includes(gender)) {
      validationErrors.push('gender must be male, female, or other')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 },
      )
    }

    // ── Database query ────────────────────────────────────────────────────────

    const supabase = await createClient()

    let query = supabase
      .from('coach_profiles')
      .select(`
        id,
        bio,
        dbs_status,
        is_featured,
        is_suspended,
        gender,
        rating_avg,
        rating_count,
        sessions_completed,
        years_experience,
        user_profiles!inner (
          full_name,
          location_city,
          location_lat,
          location_lng
        ),
        coach_sports (
          sport_id,
          session_types,
          skill_levels,
          price_individual_pence,
          price_group_pence,
          is_active,
          sports ( id, name, slug )
        ),
        coach_photos (
          photo_url,
          is_primary,
          sort_order
        )
      `)
      .eq('is_profile_live', true)
      .eq('is_suspended', false)
      .is('deleted_at', null)

    // DB-level filters for indexed columns
    if (dbs_verified === 'true') {
      query = query.eq('dbs_status', 'verified')
    }
    if (gender !== null) {
      query = query.eq('gender', gender)
    }
    if (min_rating !== null) {
      query = query.gte('rating_avg', min_rating)
    }

    const { data: rows, error: dbError } = await query.returns<CoachRow[]>()

    if (dbError) {
      console.error('[GET /api/coaches] db error:', dbError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    // ── Transform raw rows ────────────────────────────────────────────────────

    let coaches: CoachResult[] = (rows ?? []).map(row => {
      const profile = flattenUserProfile(row.user_profiles)

      const sports: CoachSportResult[] = (row.coach_sports ?? [])
        .filter(s => s.is_active && s.sports !== null)
        .map(s => ({
          sport_id: s.sport_id,
          sport_name: s.sports!.name,
          sport_slug: s.sports!.slug,
          session_types: s.session_types ?? [],
          skill_levels: s.skill_levels ?? [],
          min_price_pence: minPrice(s),
        }))

      const primaryPhoto =
        (row.coach_photos ?? [])
          .filter(p => p.is_primary)
          .sort((a, b) => a.sort_order - b.sort_order)[0]?.photo_url ?? null

      return {
        id: row.id,
        full_name: profile.full_name,
        bio: row.bio,
        location_city: profile.location_city,
        location_lat: profile.location_lat,
        location_lng: profile.location_lng,
        rating_avg: row.rating_avg,
        rating_count: row.rating_count,
        sessions_completed: row.sessions_completed,
        dbs_status: row.dbs_status,
        is_featured: row.is_featured,
        gender: row.gender,
        distance_km: null,
        sports,
        primary_photo: primaryPhoto,
      }
    })

    // ── JS filters ────────────────────────────────────────────────────────────
    // Applied after fetch — correct for Phase 1 coach volumes.
    // At scale: move sport/session/price to PostGIS + DB-level filtering.

    // Distance filter
    if (searchLat !== null && searchLng !== null) {
      coaches = coaches
        .map(c => {
          if (c.location_lat === null || c.location_lng === null) {
            return { ...c, distance_km: null }
          }
          return {
            ...c,
            distance_km: haversineKm(searchLat!, searchLng!, c.location_lat, c.location_lng),
          }
        })
        .filter(c => c.distance_km === null || c.distance_km <= radius_km)
    }

    // Sport filter
    if (sport_id !== null) {
      coaches = coaches.filter(c =>
        c.sports.some(s => s.sport_id === sport_id),
      )
    }

    // Session type filter
    if (session_type !== null) {
      coaches = coaches.filter(c =>
        c.sports.some(s => s.session_types.includes(session_type)),
      )
    }

    // Skill level filter
    if (skill_level !== null) {
      coaches = coaches.filter(c =>
        c.sports.some(s => s.skill_levels.includes(skill_level)),
      )
    }

    // Price filter — coach passes if any active sport falls in range
    if (min_price !== null || max_price !== null) {
      coaches = coaches.filter(c => {
        return c.sports.some(s => {
          const p = s.min_price_pence
          if (p === null) return false
          if (min_price !== null && p < min_price) return false
          if (max_price !== null && p > max_price) return false
          return true
        })
      })
    }

    // ── Featured / organic split ──────────────────────────────────────────────

    const featured = sortCoaches(
      coaches.filter(c => c.is_featured),
      'rating', // featured group always sorted by rating DESC
    )
    const organic = sortCoaches(
      coaches.filter(c => !c.is_featured),
      sort,
    )

    const sorted = [...featured, ...organic]

    // ── Pagination ────────────────────────────────────────────────────────────

    const total = sorted.length
    const pages = Math.ceil(total / limit)
    const offset = (page - 1) * limit
    const paginated = sorted.slice(offset, offset + limit)

    return NextResponse.json(
      { coaches: paginated, total, page, pages },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/coaches]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
