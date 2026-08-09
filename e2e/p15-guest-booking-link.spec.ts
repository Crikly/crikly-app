// P-04-B / P15 — guest booking → account linking (Screen 04), real stack.
//
// The guest CHECKOUT UI is p12's job. This spec starts where checkout
// ends: a succeeded Stripe test-mode PaymentIntent carrying guest_email
// metadata (created directly via the Stripe API — instant, no Payment
// Element, no webhook dependency) plus the matching provisional profile,
// booking and payment_intents audit row. It then drives the REAL linking
// path end to end:
//   register → (auto-confirm, seed profile like the callback would) →
//   login → role auto-set → terms accept → guest scan finds the booking →
//   Screen 04 → "Yes, link my bookings" → RPC transfer → dashboard →
//   DB asserts ownership moved + provisional profile soft-deleted.
//
// Stripe Search has indexing lag on new PIs (seconds to ~1 min). The spec
// polls Stripe Search directly until the PI is indexed BEFORE starting
// the UI flow, so the app's single scan call sees it (approved Step 0
// decision: polling is the correct mitigation).

import { test, expect } from '@playwright/test'
import Stripe from 'stripe'
import { dbAdmin, getCoachProfileIdByEmail, seedUserProfileByEmail } from './fixtures/db'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[P15] missing required env: ${key}`)
  return v
}

const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')
const RUN_TAG = Date.now()
const GUEST_EMAIL = `p15-guest-${RUN_TAG}@crikly-e2e.test`
const PASSWORD = 'p15-Password123'
const REF = `E2E-P15-${RUN_TAG}`
const PRICE_PENCE = 6000
const TOTAL_PENCE = 6600

test.describe('P15 — guest booking linking (Screen 04)', () => {
  let stripe: Stripe
  let coachProfileId: string
  let sportId: string
  let provisionalProfileId: string
  let bookingId: string
  let paymentIntentId: string

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'))
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    const { data: sportRow, error: sportErr } = await dbAdmin
      .from('coach_sports')
      .select('sport_id')
      .eq('coach_profile_id', coachProfileId)
      .limit(1)
      .single()
    if (sportErr || !sportRow) throw new Error(`[P15] coach_sports read failed: ${sportErr?.message}`)
    sportId = sportRow.sport_id as string

    // 1. Provisional guest profile — exactly what /api/guest/bookings creates.
    const provisionalUntil = new Date()
    provisionalUntil.setMonth(provisionalUntil.getMonth() + 6)
    const { data: profile, error: profileErr } = await dbAdmin
      .from('user_profiles')
      .insert({
        auth_user_id: null,
        full_name: 'P15 Guest Parent',
        is_provisional: true,
        provisional_until: provisionalUntil.toISOString(),
        active_role: 'parent',
      })
      .select('id')
      .single()
    if (profileErr || !profile) throw new Error(`[P15] provisional profile insert failed: ${profileErr?.message}`)
    provisionalProfileId = profile.id as string

    // 2. The guest's booking, owned by the provisional profile.
    const { data: booking, error: bookingErr } = await dbAdmin
      .from('bookings')
      .insert({
        booking_reference: REF,
        coach_profile_id: coachProfileId,
        sport_id: sportId,
        booked_by_user_id: provisionalProfileId,
        session_type: 'individual',
        session_date: '2026-07-20',
        session_start_time: '10:00:00',
        session_end_time: '11:00:00',
        coach_price_pence: PRICE_PENCE,
        commission_rate: 0.1,
        commission_pence: 600,
        parent_total_pence: TOTAL_PENCE,
        currency: 'GBP',
        status: 'confirmed',
        messaging_unlocked: false,
        cancellation_window_hours: 24,
        participant_name: 'P15 Player',
        venue_name: 'P15 Test Ground',
      })
      .select('id')
      .single()
    if (bookingErr || !booking) throw new Error(`[P15] booking insert failed: ${bookingErr?.message}`)
    bookingId = booking.id as string

    // 3. Real succeeded test-mode PI with the guest metadata the scan
    // matches on (same keys the guest route stashes).
    const intent = await stripe.paymentIntents.create({
      amount: TOTAL_PENCE,
      currency: 'gbp',
      confirm: true,
      payment_method: 'pm_card_visa',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        booking_id: bookingId,
        booking_reference: REF,
        guest_email: GUEST_EMAIL,
        guest_name: 'P15 Guest Parent',
      },
    })
    if (intent.status !== 'succeeded') {
      throw new Error(`[P15] test PI did not succeed: ${intent.status}`)
    }
    paymentIntentId = intent.id

    // 4. Our payment_intents audit row — the scan's cross-check source.
    const { error: auditErr } = await dbAdmin.from('payment_intents').insert({
      stripe_payment_intent_id: paymentIntentId,
      booking_id: bookingId,
      amount_pence: TOTAL_PENCE,
      application_fee_pence: 600,
      coach_transfer_amount_pence: PRICE_PENCE,
      currency: 'GBP',
      idempotency_key: `p15-${RUN_TAG}`,
      status: 'succeeded',
    })
    if (auditErr) throw new Error(`[P15] payment_intents insert failed: ${auditErr.message}`)

    // 5. Wait for Stripe Search to index the new PI so the app's scan
    // calls during the UI flow see it. Search is eventually consistent
    // and freshly-indexed documents FLICKER (a hit followed by a miss
    // seconds later was observed across replicas) — so require several
    // consecutive hits, then a settle pause, before starting the UI flow.
    // Production never races the index like this: guests register days
    // after booking.
    let consecutiveHits = 0
    await expect
      .poll(
        async () => {
          const res = await stripe.paymentIntents.search({
            query: `metadata['guest_email']:'${GUEST_EMAIL}' AND status:'succeeded'`,
          })
          consecutiveHits = res.data.length > 0 ? consecutiveHits + 1 : 0
          return consecutiveHits
        },
        { timeout: 150_000, intervals: [5_000] },
      )
      .toBeGreaterThanOrEqual(3)
    await new Promise((resolve) => setTimeout(resolve, 10_000))
  })

  test.afterAll(async () => {
    // Soft delete only — idempotent cleanup for re-runs.
    const now = new Date().toISOString()
    if (bookingId) {
      await dbAdmin.from('bookings').update({ deleted_at: now }).eq('id', bookingId)
    }
    if (provisionalProfileId) {
      await dbAdmin
        .from('user_profiles')
        .update({ deleted_at: now })
        .eq('id', provisionalProfileId)
        .is('deleted_at', null)
    }
  })

  test('T15.1: new registration with a matching guest booking → Screen 04 → link → ownership transferred', async ({
    page,
  }) => {
    test.setTimeout(120_000)

    // Register with the guest's email, seed the profile row the callback
    // would create (local auto-confirm skips the verify link), log in.
    await page.goto('/register?role=parent')
    await page.getByLabel('Full name').fill('P15 Guest Parent')
    await page.getByLabel('Email address').fill(GUEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: /create account/i }).click()
    await page.waitForURL(/\/verify/, { timeout: 15000 })
    await page.context().clearCookies()
    await seedUserProfileByEmail(GUEST_EMAIL, 'P15 Guest Parent')

    await page.goto('/login')
    await page.getByLabel('Email address').fill(GUEST_EMAIL)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.waitForURL(/\/onboarding\//, { timeout: 20000 })

    // Role via the auto-submit path (production callback ordering).
    await page.goto('/onboarding/role?role=parent')
    await page.waitForURL(/\/onboarding\/terms/, { timeout: 20000 })

    // Terms accept fires the guest scan — count ≥ 1 → Screen 04.
    await page.getByTestId('terms-checkbox').check()
    await page.getByTestId('terms-continue').click()
    await page.waitForURL(/\/parent\/link-bookings$/, { timeout: 30000 })

    // Screen 04 shows the booking with coach avatar row + amount.
    await expect(page.getByTestId('guest-booking-list')).toBeVisible()
    await expect(page.getByTestId('guest-booking-row')).toContainText('£66')
    await expect(
      page.getByText('Matched on the email address you just registered with', {
        exact: false,
      }),
    ).toBeVisible()

    // "Yes, link my bookings" → RPC transfer → dashboard.
    await page.getByTestId('link-bookings-yes').click()
    await page.waitForURL(/\/parent\/dashboard$/, { timeout: 30000 })

    // ── DB ASSERTS ────────────────────────────────────────────────────
    // Ownership moved to the new account's (real, non-provisional) profile…
    const { data: bookingRow, error: bookingReadErr } = await dbAdmin
      .from('bookings')
      .select('booked_by_user_id')
      .eq('id', bookingId)
      .single()
    if (bookingReadErr || !bookingRow) {
      throw new Error(`[P15] post-link booking read failed: ${bookingReadErr?.message}`)
    }
    expect(bookingRow.booked_by_user_id).not.toBe(provisionalProfileId)
    const { data: newOwner } = await dbAdmin
      .from('user_profiles')
      .select('id, is_provisional, auth_user_id')
      .eq('id', bookingRow.booked_by_user_id)
      .single()
    expect(newOwner?.is_provisional).toBe(false)
    expect(newOwner?.auth_user_id).not.toBeNull()

    // …and the emptied provisional profile is soft-deleted.
    const { data: provRow } = await dbAdmin
      .from('user_profiles')
      .select('deleted_at, is_provisional')
      .eq('id', provisionalProfileId)
      .single()
    expect(provRow?.deleted_at).not.toBeNull()
  })
})
