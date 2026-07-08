import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const GET_PAID_PATH = '/coach/get-paid'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachProfileRow {
  id: string
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
}

// ─── GET /api/payments/connect/login-link ────────────────────────────────────
// BUG-25: the "Manage Stripe account" control on /coach/get-paid was a dead
// button. This route generates a one-time Stripe Express dashboard login link
// and 303-redirects the coach straight to it — the link URL only ever lives in
// the redirect Location header (server → browser), never in client JS and never
// cached. GetPaid.tsx opens this in a new tab via <a target="_blank">.
//
// The link is generated ONLY for a coach with a valid stripe_account_id AND
// stripe_onboarding_complete = true. Any other state (missing account, not
// onboarded, stale flag) redirects back to /coach/get-paid rather than erroring.

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: userProfile, error: userProfileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (userProfileError || !userProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: coach, error: coachError } = await supabase
      .from('coach_profiles')
      .select('id, stripe_account_id, stripe_onboarding_complete')
      .eq('user_profile_id', userProfile.id)
      .maybeSingle()

    if (coachError) {
      console.error('[GET /api/payments/connect/login-link] coach lookup error:', coachError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!coach) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
    }

    const { stripe_account_id, stripe_onboarding_complete } = coach as CoachProfileRow

    // Defensive gate: only mint a login link for a fully-onboarded account.
    // The UI already hides the link unless fully connected; this backstops it.
    if (!stripe_account_id || !stripe_onboarding_complete) {
      return NextResponse.redirect(new URL(GET_PAID_PATH, APP_URL))
    }

    const stripe = getStripe()
    const loginLink = await stripe.accounts.createLoginLink(stripe_account_id)

    // 303: force the new-tab navigation to follow with GET. The one-time URL is
    // only in this Location header — never exposed to client JS, never cached.
    return NextResponse.redirect(loginLink.url, 303)
  } catch (error) {
    // A stale stripe_onboarding_complete flag (or an account Stripe no longer
    // considers eligible) surfaces as StripeInvalidRequestError — send the coach
    // back to Get Paid rather than showing an error page.
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      console.error('[GET /api/payments/connect/login-link] Stripe invalid request:', error.message)
      return NextResponse.redirect(new URL(GET_PAID_PATH, APP_URL))
    }
    console.error('[GET /api/payments/connect/login-link]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
