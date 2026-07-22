import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// Fix-STRIPE-01: where Stripe sends the coach after the hosted onboarding flow.
// Allow-listed to prevent an open redirect — the body value is attacker-influenceable,
// so only these exact app paths may be used; anything else falls back to the default
// dashboard route. The dashboard flow (GetPaid.tsx) sends no body → DEFAULT_RETURN_PATH.
const DEFAULT_RETURN_PATH = '/coach/get-paid'
const ALLOWED_RETURN_PATHS = new Set<string>([
  '/coach/get-paid',
  '/coach/onboarding/get-paid',
])

function resolveReturnPath(value: unknown): string {
  return typeof value === 'string' && ALLOWED_RETURN_PATHS.has(value)
    ? value
    : DEFAULT_RETURN_PATH
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachProfileRow {
  id: string
  stripe_account_id: string | null
}

interface UserProfileRow {
  full_name: string
}

// ─── GET /api/payments/connect/onboard ───────────────────────────────────────
// Returns the coach's current Stripe Connect status.
// { connected: false } if no account linked.
// { connected: true, charges_enabled, payouts_enabled, details_submitted } otherwise.

export async function GET(_request: NextRequest): Promise<NextResponse> {
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
      .select('id, stripe_account_id')
      .eq('user_profile_id', userProfile.id)
      .maybeSingle()

    if (coachError) {
      console.error('[GET /api/payments/connect/onboard] coach lookup error:', coachError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!coach) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
    }

    const { stripe_account_id } = coach as CoachProfileRow

    if (!stripe_account_id) {
      return NextResponse.json({ connected: false })
    }

    const stripe = getStripe()
    const account = await stripe.accounts.retrieve(stripe_account_id)

    // BUG-45: surface the coach's real payout destination so the Get Paid page
    // never shows placeholder bank details. accounts.retrieve embeds the first
    // page of external_accounts; the payout destination is the default bank
    // account for the currency (fall back to the first bank account). Only
    // bank_name + last4 leave this route — never full account numbers.
    const bankAccounts = (account.external_accounts?.data ?? []).filter(
      (ea): ea is Stripe.BankAccount => ea.object === 'bank_account',
    )
    const payoutBank = bankAccounts.find((ba) => ba.default_for_currency) ?? bankAccounts[0] ?? null

    return NextResponse.json({
      connected: true,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      bank_name: payoutBank?.bank_name ?? null,
      bank_last4: payoutBank?.last4 ?? null,
    })
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      console.error('[GET /api/payments/connect/onboard] Stripe invalid request:', error.message)
      return NextResponse.json({ error: 'Stripe account not found' }, { status: 404 })
    }
    console.error('[GET /api/payments/connect/onboard]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── POST /api/payments/connect/onboard ──────────────────────────────────────
// Creates a Stripe Express account if the coach doesn't have one,
// then returns an account link URL to redirect the coach to Stripe onboarding.

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Fix-STRIPE-01: optional { return_path } body chooses where Stripe returns
    // the coach (onboarding vs dashboard). Body may be empty — request.json()
    // throws on no body, so default safely. Always run through the allowlist.
    let returnPath = DEFAULT_RETURN_PATH
    try {
      const body = await request.json()
      returnPath = resolveReturnPath((body as { return_path?: unknown })?.return_path)
    } catch {
      returnPath = DEFAULT_RETURN_PATH
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const { data: userProfile, error: userProfileError } = await supabase
      .from('user_profiles')
      .select('id, full_name')
      .eq('auth_user_id', user.id)
      .single()

    if (userProfileError || !userProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: coach, error: coachError } = await supabase
      .from('coach_profiles')
      .select('id, stripe_account_id')
      .eq('user_profile_id', userProfile.id)
      .maybeSingle()

    if (coachError) {
      console.error('[POST /api/payments/connect/onboard] coach lookup error:', coachError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!coach) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
    }

    const coachRow = coach as CoachProfileRow
    const profileRow = userProfile as unknown as UserProfileRow & { id: string }

    const stripe = getStripe()
    let stripeAccountId = coachRow.stripe_account_id

    // Create a new Stripe Express account if the coach doesn't have one yet
    if (!stripeAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB',
        email: user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        individual: {
          email: user.email,
        },
      })

      stripeAccountId = account.id

      const { error: updateError } = await supabase
        .from('coach_profiles')
        .update({ stripe_account_id: stripeAccountId })
        .eq('id', coachRow.id)

      if (updateError) {
        console.error('[POST /api/payments/connect/onboard] failed to save stripe_account_id:', updateError)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
      }
    }

    // Create a new account link (these expire after a short time — always generate fresh)
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${APP_URL}${returnPath}?refresh=true`,
      return_url: `${APP_URL}${returnPath}?success=true`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ onboarding_url: accountLink.url })
  } catch (error) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      console.error('[POST /api/payments/connect/onboard] Stripe invalid request:', error.message)
      return NextResponse.json({ error: 'Payment configuration error' }, { status: 500 })
    }
    console.error('[POST /api/payments/connect/onboard]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
