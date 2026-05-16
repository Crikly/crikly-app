// ──────────────────────────────────────────────────────────────────────────────
// GET /api/coaches/reviews — list a coach's own visible reviews + their replies.
//
// Auth: requireCoachContext — must be authenticated as a coach with a profile.
// Query: nested select via reviews → coach_replies. Coach_replies is 0-or-1
//        per review (UNIQUE(review_id)) but PostgREST returns it as an array.
// Sort:  newest-first server-side; the page does additional client-side sort
//        across all 4 SortKey values (newest / oldest / highest / lowest).
//
// rating_avg + rating_count are read from the denormalised cache columns on
// coach_profiles rather than computed inline, so the coach's own view stays
// consistent with the public profile + search results.
//
// Out-of-scope (filed as follow-ups):
//   - API-COACH-REVIEWS-RATING-TREND — compute rating_change_30d via a
//     30-day window aggregation. Hardcoded to 0 here.
//   - API-COACH-REVIEWS-PAGINATION — page/cursor params; today returns all.
//   - BUG-REVIEWS-REPLY-PERSIST — POST endpoint for creating/editing replies.
//   - OPP-REVIEW-COMMENT-NULLABLE — broaden Review.comment to string | null
//     so we don't have to coerce null → '' in the mapper.
// ──────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'

interface Review {
  id: string
  rating: number
  comment: string
  created_at: string
  reviewer_name: string
  sport_name: string
  coach_reply: string | null
}

interface ReviewsResponse {
  reviews: Review[]
  rating_avg: number
  rating_count: number
  rating_change_30d: number
  positive_share: { positive: number; total: number }
}

export async function GET() {
  const supabase = await createClient()

  const { context, error } = await requireCoachContext(supabase)
  if (error) return error
  const { coachProfile } = context

  // Parallel — the reviews+replies join and the coach_profiles aggregate read
  // are independent. RLS via the "Coaches can view own reviews" policy
  // (migration 029) authorises the reviews read; coach_profiles is the
  // coach's own row.
  const [reviewsResult, coachResult] = await Promise.all([
    supabase
      .from('reviews')
      .select(
        'id, rating, comment, created_at, reviewer_name, sport_name, coach_replies(reply_text)'
      )
      .eq('coach_profile_id', coachProfile.id)
      .eq('is_visible', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('coach_profiles')
      .select('rating_avg, rating_count')
      .eq('id', coachProfile.id)
      .single(),
  ])

  if (reviewsResult.error) {
    console.error('[GET /api/coaches/reviews] reviews query error:', reviewsResult.error)
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 })
  }
  if (coachResult.error) {
    console.error(
      '[GET /api/coaches/reviews] coach_profiles query error:',
      coachResult.error,
    )
    return NextResponse.json({ error: 'Failed to load coach stats' }, { status: 500 })
  }

  const rows = reviewsResult.data ?? []

  const reviews: Review[] = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    // DB column is nullable; coerce to '' so the page (which expects string)
    // doesn't have to handle null. Follow-up: OPP-REVIEW-COMMENT-NULLABLE.
    comment: r.comment ?? '',
    created_at: r.created_at,
    reviewer_name: r.reviewer_name,
    sport_name: r.sport_name,
    // coach_replies is one-to-one (UNIQUE(review_id) on coach_replies), so
    // PostgREST returns it as a single object (or null when no reply exists).
    coach_reply: r.coach_replies?.reply_text ?? null,
  }))

  const positive = reviews.filter((r) => r.rating >= 4).length

  const body: ReviewsResponse = {
    reviews,
    // coach_profiles.rating_avg is nullable for coaches with no reviews yet;
    // coerce to 0 so the page's toFixed(1) call doesn't crash.
    rating_avg: coachResult.data.rating_avg ?? 0,
    rating_count: coachResult.data.rating_count,
    rating_change_30d: 0,
    positive_share: { positive, total: reviews.length },
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
  })
}
