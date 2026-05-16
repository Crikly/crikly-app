// ──────────────────────────────────────────────────────────────────────────────
// STUB endpoint — CF-REVIEWS-01
//
// Returns hardcoded dummy reviews so the /coach/reviews page can render the
// full design without a real backing schema. Auth is enforced (coach context
// required) but the hardcoded payload is identical for every coach.
//
// Follow-up tasks (filed during CF-REVIEWS-01 planning):
//   - API-COACH-REVIEWS-REAL-WIRING — join bookings + reviews + coach_replies
//   - API-COACH-REVIEWS-PAGINATION — page/cursor params, today returns ≤8 rows
//   - BUG-REVIEWS-REPLY-PERSIST — POST endpoint + coach_replies storage
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

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// 7 reviews spanning today → ~8 months ago, mostly 4/5★, one 3★ with a reply.
const STUB_REVIEWS: Review[] = [
  {
    id: 'rev-001',
    rating: 5,
    comment:
      'My son has improved so much after just 8 sessions. He went from being nervous about facing fast bowling to actually asking for extra practice at home — that’s a huge shift. Patient, clear, and always on time.',
    created_at: daysAgoIso(2),
    reviewer_name: 'Sarah Johnson',
    sport_name: 'Cricket',
    coach_reply: null,
  },
  {
    id: 'rev-002',
    rating: 5,
    comment:
      'Fantastic coach. Patient and great with young players. My daughter is 9 and was hesitant to join because she didn’t know anyone — by the second week she was leading the warm-ups.',
    created_at: daysAgoIso(7),
    reviewer_name: 'Marcus Khan',
    sport_name: 'Cricket',
    coach_reply:
      'Thank you! It’s been a pleasure working with your daughter — she has real focus for her age. See you Saturday.',
  },
  {
    id: 'rev-003',
    rating: 4,
    comment:
      'Really good sessions overall. Would’ve given five stars but a couple of sessions started 5–10 minutes late. Coaching itself was excellent.',
    created_at: daysAgoIso(14),
    reviewer_name: 'Rachel Patel',
    sport_name: 'Cricket',
    coach_reply: null,
  },
  {
    id: 'rev-004',
    rating: 5,
    comment:
      'Brilliant with my son who has ADHD — keeps him engaged and makes the drills feel like games. Worth every penny.',
    created_at: daysAgoIso(28),
    reviewer_name: 'Daniel Foster',
    sport_name: 'Cricket',
    coach_reply: null,
  },
  {
    id: 'rev-005',
    rating: 3,
    comment:
      'Coaching was fine but communication outside sessions was slow. Took two days to reply about rescheduling. Sessions themselves were good.',
    created_at: daysAgoIso(56),
    reviewer_name: 'Priya Ramanathan',
    sport_name: 'Tennis',
    coach_reply: null,
  },
  {
    id: 'rev-006',
    rating: 5,
    comment:
      'Couldn’t recommend more highly. My twins both want to come back next term — even the one who normally hates sport.',
    created_at: daysAgoIso(98),
    reviewer_name: 'Tom Bennett',
    sport_name: 'Cricket',
    coach_reply: null,
  },
  {
    id: 'rev-007',
    rating: 4,
    comment:
      'Solid foundations work. Daughter’s grip and footwork have improved a lot since starting. Sessions are well-structured.',
    created_at: daysAgoIso(240),
    reviewer_name: 'Helen Williams',
    sport_name: 'Football',
    coach_reply: null,
  },
]

export async function GET() {
  const supabase = await createClient()

  const { error } = await requireCoachContext(supabase)
  if (error) return error

  const ratingCount = STUB_REVIEWS.length
  const ratingAvg =
    Math.round((STUB_REVIEWS.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10
  const positive = STUB_REVIEWS.filter((r) => r.rating >= 4).length

  const body: ReviewsResponse = {
    reviews: STUB_REVIEWS,
    rating_avg: ratingAvg,
    rating_count: ratingCount,
    rating_change_30d: 0.2,
    positive_share: { positive, total: ratingCount },
  }

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' },
  })
}
