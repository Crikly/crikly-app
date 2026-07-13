import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Service-role client used only for user_profiles lookups.
// user_profiles RLS is "own record only", which blocks the anon client
// on public routes. Service role bypasses RLS safely here because we only
// read the coach's public display name and location — no sensitive data.
//
// Fix-LINT-02: lazy-init. A module-level `createSupabaseClient(...)` ran at
// import time and threw "supabaseUrl is required" during `next build` page-data
// collection when env vars are absent (CI build env). Instantiating on first
// use keeps the build env-var-free; production still has the vars at runtime.
let _supabaseAdmin: ReturnType<typeof createSupabaseClient> | null = null
function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _supabaseAdmin
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface QualificationRow {
  id: string
  qualification_type_id: string | null
  custom_name: string | null
  issuing_body: string | null
  issued_date: string | null
  expiry_date: string | null
  notes: string | null
}

interface CoachSportRow {
  sport_id: string
  session_types: string[]
  skill_levels: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
  currency: string
  is_active: boolean
}

interface SportRow {
  id: string
  name: string
  slug: string
}

interface QualificationTypeRow {
  id: string
  name: string
  issuing_body: string
}

interface ReviewRow {
  id: string
  rating: number
  comment: string | null
  created_at: string
}

interface UserProfileRow {
  full_name: string
  location_city: string | null
  location_lat: number | null
  location_lng: number | null
  avatar_url: string | null
}

interface PhotoRow {
  id: string
  photo_url: string
  sort_order: number
  is_primary: boolean
}

interface AvailabilityTemplateRow {
  id: string
  sport_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
  is_active: boolean
}

interface CoachDetailRow {
  id: string
  slug: string | null
  user_profile_id: string
  display_name: string | null
  bio: string | null
  years_experience: number | null
  dbs_status: string
  dbs_verified_at: string | null
  dbs_expires_at: string | null
  is_featured: boolean
  gender: string | null
  languages: string[] | null
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
  coach_sports: CoachSportRow[]
  coach_qualifications: QualificationRow[]
  coach_photos: PhotoRow[]
  availability_templates: AvailabilityTemplateRow[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Route handler ────────────────────────────────────────────────────────────

/**
 * GET /api/coaches/[id]
 * Public route — no auth required.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params

    const supabase = await createClient()

    // user_profiles!inner was silently dropping rows when PostgREST couldn't
    // resolve the join, so user_profiles is fetched separately below by
    // user_profile_id. coach_sports.sport_id and
    // coach_qualifications.qualification_type_id also have no FK constraints
    // and are fetched separately for the same reason.
    const { data: row, error: dbError } = await supabase
      .from('coach_profiles')
      .select(`
        id,
        slug,
        user_profile_id,
        display_name,
        bio,
        years_experience,
        dbs_status,
        dbs_verified_at,
        dbs_expires_at,
        is_featured,
        gender,
        languages,
        rating_avg,
        rating_count,
        sessions_completed,
        cancellation_window_hours,
        min_advance_hours,
        max_advance_days,
        coach_sports (
          sport_id,
          session_types,
          skill_levels,
          price_individual_pence,
          price_group_pence,
          max_group_size,
          session_duration_minutes,
          currency,
          is_active
        ),
        coach_qualifications (
          id,
          qualification_type_id,
          custom_name,
          issuing_body,
          issued_date,
          expiry_date,
          notes
        ),
        coach_photos (
          id,
          photo_url,
          sort_order,
          is_primary
        ),
        availability_templates (
          id,
          sport_id,
          day_of_week,
          start_time,
          end_time,
          is_active
        )
      `)
      .eq(UUID_RE.test(id) ? 'id' : 'slug', id)
      .eq('is_profile_live', true)
      .eq('is_suspended', false)
      // BUG-PUBLIC-PROFILE-404: paused coaches must not be publicly discoverable
      // (is_paused added in Migration 027 / C-Settings-01-DB; the public route
      // had been missing this filter so paused coaches were still reachable
      // by direct URL — defeating the Settings page Pause toggle).
      .eq('is_paused', false)
      .is('deleted_at', null)
      .maybeSingle()

    if (dbError) {
      console.error('[GET /api/coaches/[id]] db error:', dbError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const coach = row as CoachDetailRow | null

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }

    // ── Fetch user_profiles separately (no nested join — see comment above) ────

    const { data: userProfileData, error: userProfileError } = await getSupabaseAdmin()
      .from('user_profiles')
      .select('full_name, location_city, location_lat, location_lng, avatar_url')
      .eq('id', coach.user_profile_id)
      .single()

    if (userProfileError) {
      console.error('[GET /api/coaches/[id]] user_profiles lookup error:', userProfileError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const profile = userProfileData as UserProfileRow

    // ── Fetch sports by ID (no FK — must query separately) ────────────────────

    const sportIds = [
      ...new Set((coach.coach_sports ?? []).map(s => s.sport_id).filter(Boolean)),
    ]

    const sportMap = new Map<string, { name: string; slug: string }>()

    if (sportIds.length > 0) {
      const { data: sportsData, error: sportsError } = await supabase
        .from('sports')
        .select('id, name, slug')
        .in('id', sportIds)

      if (sportsError) {
        console.error('[GET /api/coaches/[id]] sports lookup error:', sportsError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      for (const s of (sportsData ?? []) as SportRow[]) {
        sportMap.set(s.id, { name: s.name, slug: s.slug })
      }
    }

    // ── Fetch qualification_types by ID (no FK — must query separately) ───────

    const qualTypeIds = [
      ...new Set(
        (coach.coach_qualifications ?? [])
          .map(q => q.qualification_type_id)
          .filter((qid): qid is string => qid !== null),
      ),
    ]

    const qualTypeMap = new Map<string, { name: string; issuing_body: string }>()

    if (qualTypeIds.length > 0) {
      const { data: qualTypesData, error: qualTypesError } = await supabase
        .from('qualification_types')
        .select('id, name, issuing_body')
        .in('id', qualTypeIds)

      if (qualTypesError) {
        console.error('[GET /api/coaches/[id]] qualification_types lookup error:', qualTypesError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }

      for (const qt of (qualTypesData ?? []) as QualificationTypeRow[]) {
        qualTypeMap.set(qt.id, { name: qt.name, issuing_body: qt.issuing_body })
      }
    }

    // ── Sports ───────────────────────────────────────────────────────────────

    const sports = (coach.coach_sports ?? [])
      .filter((s: CoachSportRow) => s.is_active && sportMap.has(s.sport_id))
      .map((s: CoachSportRow) => {
        const sportInfo = sportMap.get(s.sport_id)!
        return {
          sport_id: s.sport_id,
          sport_name: sportInfo.name,
          sport_slug: sportInfo.slug,
          session_types: s.session_types ?? [],
          skill_levels: s.skill_levels ?? [],
          price_individual_pence: s.price_individual_pence,
          price_group_pence: s.price_group_pence,
          max_group_size: s.max_group_size,
          session_duration_minutes: s.session_duration_minutes,
          currency: s.currency,
        }
      })

    // ── Qualifications ────────────────────────────────────────────────────────

    const today = new Date().toISOString().slice(0, 10)

    const qualifications = (coach.coach_qualifications ?? []).map((q: QualificationRow) => {
      const qualType = q.qualification_type_id ? qualTypeMap.get(q.qualification_type_id) : null
      const name = qualType?.name ?? q.custom_name ?? 'Unknown'
      const issuing_body = qualType?.issuing_body ?? q.issuing_body ?? null

      let status: 'active' | 'expired' = 'active'
      if (q.expiry_date && q.expiry_date < today) {
        status = 'expired'
      }

      return {
        id: q.id,
        name,
        issuing_body,
        issued_date: q.issued_date,
        expiry_date: q.expiry_date,
        status,
        notes: q.notes,
        // TODO: add certificate_url column via migration — tracked as Fix-39
        certificate_url: null as string | null,
      }
    })

    // ── Photos — primary first, then by sort_order ────────────────────────────

    let photos = [...(coach.coach_photos ?? [])]
      .sort((a: PhotoRow, b: PhotoRow) => {
        if (a.is_primary && !b.is_primary) return -1
        if (!a.is_primary && b.is_primary) return 1
        return a.sort_order - b.sort_order
      })
      .map((p: PhotoRow) => ({
        id: p.id,
        photo_url: p.photo_url,
        is_primary: p.is_primary,
        sort_order: p.sort_order,
      }))

    if (photos.length === 0 && profile.avatar_url) {
      const avatarUrl = profile.avatar_url.includes('=s96-c')
        ? profile.avatar_url.replace('=s96-c', '=s400-c')
        : profile.avatar_url
      photos = [{ id: 'avatar', photo_url: avatarUrl, is_primary: true, sort_order: 0 }]
    }

    // ── Reviews (SELECT: Public RLS — anon client is fine) ───────────────────

    const { data: reviewsData, error: reviewsError } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at')
      .eq('coach_profile_id', coach.id)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(10)

    if (reviewsError) {
      console.error('[GET /api/coaches/[id]] reviews lookup error:', reviewsError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    const reviews = (reviewsData ?? []) as ReviewRow[]

    // ── Availability templates (active only) ──────────────────────────────────

    const availability = (coach.availability_templates ?? [])
      .filter((t: AvailabilityTemplateRow) => t.is_active)
      .map((t: AvailabilityTemplateRow) => ({
        id: t.id,
        sport_id: t.sport_id,
        day_of_week: t.day_of_week,
        start_time: t.start_time.slice(0, 5), // HH:MM
        end_time: t.end_time.slice(0, 5),
      }))

    return NextResponse.json(
      {
        id: coach.id,
        slug: coach.slug,
        // BUG-37: public surfaces show the coach's display_name, never the
        // account holder's name — same precedence as /api/public/coaches and
        // the webhook confirmation emails. Response key unchanged for consumers.
        full_name: coach.display_name ?? profile.full_name,
        bio: coach.bio,
        years_experience: coach.years_experience,
        location_city: profile.location_city,
        location_lat: profile.location_lat,
        location_lng: profile.location_lng,
        gender: coach.gender,
        languages: coach.languages ?? [],
        dbs_status: coach.dbs_status,
        dbs_verified_at: coach.dbs_verified_at,
        is_featured: coach.is_featured,
        rating_avg: coach.rating_avg,
        rating_count: coach.rating_count,
        sessions_completed: coach.sessions_completed,
        cancellation_window_hours: coach.cancellation_window_hours,
        min_advance_hours: coach.min_advance_hours,
        max_advance_days: coach.max_advance_days,
        sports,
        qualifications,
        photos,
        availability,
        reviews,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/coaches/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
