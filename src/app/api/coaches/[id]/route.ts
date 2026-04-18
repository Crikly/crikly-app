import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QualificationRow {
  id: string
  qualification_type_id: string | null
  custom_name: string | null
  issuing_body: string | null
  issued_date: string | null
  expiry_date: string | null
  notes: string | null
  qualification_types: { name: string; issuing_body: string } | null
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
  sports: { id: string; name: string; slug: string } | null
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
  user_profiles:
    | { full_name: string; location_city: string | null; location_lat: number | null; location_lng: number | null }
    | { full_name: string; location_city: string | null; location_lat: number | null; location_lng: number | null }[]
  coach_sports: CoachSportRow[]
  coach_qualifications: QualificationRow[]
  coach_photos: PhotoRow[]
  availability_templates: AvailabilityTemplateRow[]
}

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

    const { data: row, error: dbError } = await supabase
      .from('coach_profiles')
      .select(`
        id,
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
          max_group_size,
          session_duration_minutes,
          currency,
          is_active,
          sports ( id, name, slug )
        ),
        coach_qualifications (
          id,
          qualification_type_id,
          custom_name,
          issuing_body,
          issued_date,
          expiry_date,
          notes,
          qualification_types ( name, issuing_body )
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
      .eq('id', id)
      .eq('is_profile_live', true)
      .eq('is_suspended', false)
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

    // ── Flatten user_profiles ─────────────────────────────────────────────────

    const profile = Array.isArray(coach.user_profiles)
      ? coach.user_profiles[0]
      : coach.user_profiles

    // ── Sports ───────────────────────────────────────────────────────────────

    const sports = (coach.coach_sports ?? [])
      .filter((s: CoachSportRow) => s.is_active && s.sports !== null)
      .map((s: CoachSportRow) => ({
        sport_id: s.sport_id,
        sport_name: s.sports!.name,
        sport_slug: s.sports!.slug,
        session_types: s.session_types ?? [],
        skill_levels: s.skill_levels ?? [],
        price_individual_pence: s.price_individual_pence,
        price_group_pence: s.price_group_pence,
        max_group_size: s.max_group_size,
        session_duration_minutes: s.session_duration_minutes,
        currency: s.currency,
      }))

    // ── Qualifications ────────────────────────────────────────────────────────

    const today = new Date().toISOString().slice(0, 10)

    const qualifications = (coach.coach_qualifications ?? []).map((q: QualificationRow) => {
      const name = q.qualification_types?.name ?? q.custom_name ?? 'Unknown'
      const issuing_body = q.qualification_types?.issuing_body ?? q.issuing_body ?? null

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

    const photos = [...(coach.coach_photos ?? [])]
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
        full_name: profile.full_name,
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
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('[GET /api/coaches/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
