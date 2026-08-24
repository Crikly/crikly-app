import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireParentRole } from '@/lib/auth/require-parent'
import { findGuestBookings } from '@/lib/auth/guest-linking'

// P-06: parent To-Do badge source. One endpoint serves both surfaces —
// the AppShell badge reads `count`, the dropdown/sheet reads `items`.
// Every condition is decided HERE, server-side (REQ-P-009 / GAP-P-01
// derived-query approach — no dedicated table); the client never guesses.
//
// Three conditions for now. Condition 4 (completed session awaiting a
// review, 14-day window) is deliberately excluded until the review flow
// ships (P-14/P-20) — a badge item pointing at a dead end is worse than
// an accurate badge (Lasith, P-06 Step 0 decision 3).
//
// Failure policy (guest-bookings precedent): the badge is advisory
// chrome. A failed check drops ONLY its own item — the endpoint never
// 500s because Stripe or one query is down. Auth failures still 4xx.

export type ParentTodoType = 'add_child' | 'complete_booking' | 'link_bookings'

export interface ParentTodoItem {
  type: ParentTodoType
  href: string
}

export interface ParentTodoResponse {
  count: number
  items: ParentTodoItem[]
}

export async function GET(): Promise<NextResponse<ParentTodoResponse | { error: string }>> {
  const supabase = await createClient()

  // requireParentRole (not Context): a parent with no parent_profiles row
  // yet is exactly the "add a child" audience — never 404 them here.
  const { context, error } = await requireParentRole(supabase)
  if (error) return error

  const items: ParentTodoItem[] = []

  // ── 1. No child profile yet → "Add a child" ────────────────────────────
  try {
    const { data: parentProfile, error: ppError } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', context.userProfile.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (ppError) throw ppError

    let childCount = 0
    if (parentProfile) {
      const { count, error: childError } = await supabase
        .from('child_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('parent_profile_id', parentProfile.id)
        .is('deleted_at', null)
      if (childError) throw childError
      childCount = count ?? 0
    }
    if (childCount === 0) {
      items.push({ type: 'add_child', href: '/parent/children/new' })
    }
  } catch (checkError) {
    console.error('[GET /api/parent/todo] add_child check failed:', checkError)
  }

  // ── 2. Incomplete checkout → "Complete booking" ────────────────────────
  // pending_payment rows are live held slots (the release-expired-bookings
  // cron reaps abandoned ones), so a surviving row is genuinely resumable.
  // The resume surface is the coach booking page (Step 0 decision 2).
  try {
    const { data: pendingBooking, error: pbError } = await supabase
      .from('bookings')
      .select('id, coach_profile_id')
      .eq('booked_by_user_id', context.userProfile.id)
      .eq('status', 'pending_payment')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pbError) throw pbError

    if (pendingBooking) {
      items.push({
        type: 'complete_booking',
        href: `/book/${pendingBooking.coach_profile_id}`,
      })
    }
  } catch (checkError) {
    console.error('[GET /api/parent/todo] complete_booking check failed:', checkError)
  }

  // ── 3. Unclaimed guest bookings → "Link bookings" ──────────────────────
  // Email is ALWAYS the verified session email (P-04-B security contract).
  if (context.user.email) {
    try {
      const scan = await findGuestBookings(context.user.email)
      if (scan.matches.length > 0) {
        items.push({ type: 'link_bookings', href: '/parent/link-bookings' })
      }
    } catch (checkError) {
      console.error('[GET /api/parent/todo] link_bookings check failed:', checkError)
    }
  }

  // Badge must never be cached — resolving an action must clear it on the
  // next load, not after a CDN TTL.
  return NextResponse.json(
    { count: items.length, items },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
