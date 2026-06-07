// ──────────────────────────────────────────────────────────────────────────────
// GET /api/coaches/profile-completeness — server-side checks the right panel
// cannot evaluate from the cached profile.
//
// Auth: requireCoachContext.
//
// Returns:
//   - sports             : boolean (coach_sports count > 0)
//   - qualifications     : boolean (coach_qualifications count > 0)
//   - availability       : boolean (availability_templates count > 0)
//   - unanswered_reviews : number  (visible reviews without a coach_reply)
//
// The 3 booleans mirror the dashboard's existing inline count queries
// (dashboard/page.tsx ~L167-177). Exposing them via this endpoint lets the
// right panel stop guessing — it previously assumed all 3 passed (`+= 3
// STUB`) which over-reported completion for any coach who hadn't finished
// onboarding sports/quals/availability.
//
// `unanswered_reviews` is computed via a left-joined ID-only fetch — cheap
// even for coaches with many reviews. Mirrors the count semantics of
// /api/coaches/reviews's `unanswered_count` field.
//
// NOTE on response shape: deliberately omits a `completed_count`/`total`
// rollup. The panel evaluates 3 OTHER checks (basic_profile, booking_policy,
// stripe) from its cached profile + Stripe cache; combining the rollup
// server-side would either be of an inconsistent subset (3 of 6) or require
// the server to fetch Stripe status (~800ms call). The panel computes the
// full 0-6 rollup itself.
//
// Cache: private, max-age=60. Completeness changes rarely (coach adds a
// sport / qualification / availability slot). Short TTL keeps the UI fresh
// without explicit invalidation.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface ProfileCompletenessResponse {
  sports: boolean
  qualifications: boolean
  availability: boolean
  unanswered_reviews: number
}

export async function GET() {
  const supabase = await createClient()

  const { context, error: authError } = await requireCoachContext(supabase)
  if (authError) return authError
  const { coachProfile } = context

  const [sportsResult, qualsResult, availResult, reviewsResult] = await Promise.all([
    supabase
      .from('coach_sports')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id),
    supabase
      .from('coach_qualifications')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id),
    supabase
      .from('availability_templates')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id),
    // Visible reviews with left-joined reply IDs. coach_replies is one-to-one
    // via UNIQUE(review_id), so PostgREST returns either an object or null —
    // null means "no reply yet" = unanswered. ID-only select keeps payload
    // small (~24 bytes per row, no large text fields).
    supabase
      .from('reviews')
      .select('id, coach_replies(id)')
      .eq('coach_profile_id', coachProfile.id)
      .eq('is_visible', true),
  ])

  if (sportsResult.error) {
    console.error('[GET /api/coaches/profile-completeness] sports count error:', sportsResult.error)
    return NextResponse.json({ error: 'Failed to load completeness' }, { status: 500 })
  }
  if (qualsResult.error) {
    console.error('[GET /api/coaches/profile-completeness] quals count error:', qualsResult.error)
    return NextResponse.json({ error: 'Failed to load completeness' }, { status: 500 })
  }
  if (availResult.error) {
    console.error('[GET /api/coaches/profile-completeness] availability count error:', availResult.error)
    return NextResponse.json({ error: 'Failed to load completeness' }, { status: 500 })
  }
  if (reviewsResult.error) {
    console.error('[GET /api/coaches/profile-completeness] reviews lookup error:', reviewsResult.error)
    return NextResponse.json({ error: 'Failed to load completeness' }, { status: 500 })
  }

  const unansweredReviews = (reviewsResult.data ?? []).filter((r) => r.coach_replies === null).length

  const body: ProfileCompletenessResponse = {
    sports: (sportsResult.count ?? 0) > 0,
    qualifications: (qualsResult.count ?? 0) > 0,
    availability: (availResult.count ?? 0) > 0,
    unanswered_reviews: unansweredReviews,
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
