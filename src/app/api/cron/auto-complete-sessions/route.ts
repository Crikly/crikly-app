// C-PAY-01 — GET /api/cron/auto-complete-sessions
//
// Session auto-completion: flips confirmed bookings to 'completed' once the
// session has been over for platform_config.default_autocomplete_delay_hours,
// stamping completed_at and payout_eligible_at (BR-03: completed_at +
// platform_config.default_payout_delay_hours). This transition is what the
// C-PAY-02 payout transfer job acts on — nothing pays out without it.
//
// Invocation: Vercel cron (vercel.json, hourly) sends GET with
// `Authorization: Bearer ${CRON_SECRET}` automatically when the CRON_SECRET
// env var is set — same pattern as release-expired-bookings. Locally: curl
// with the same header. Inert until CRON_SECRET is set and deployed.
//
// All logic lives in the SQL function auto_complete_due_bookings()
// (migration 044): one set-based UPDATE, UK wall-clock handled via
// AT TIME ZONE 'Europe/London', both delays read from platform_config inside
// the function (never hardcoded, no route/function config drift). Idempotent
// by construction — the status='confirmed' filter makes a re-run a no-op, so
// overlapping or duplicate cron fires are harmless.
//
// Admin client: cron has no user session, so RLS cannot apply — and the
// function's EXECUTE is revoked from anon/authenticated, service role only.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[AutoComplete] CRON_SECRET is not set')
    return NextResponse.json({ error: 'Cron not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('auto_complete_due_bookings')

  if (error) {
    console.error('[AutoComplete] auto_complete_due_bookings failed:', error)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const completed = typeof data === 'number' ? data : 0
  console.info(`[AutoComplete] run complete: completed=${completed}`)
  return NextResponse.json({ completed })
}
