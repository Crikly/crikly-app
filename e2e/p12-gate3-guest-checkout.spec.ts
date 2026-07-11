// TEST-E2E-03 / P12 — Gate 3: guest 1-on-1 checkout against the real stack.
//
// Automates two Gate 3 checklist items end-to-end (approved Step 0 gap
// decision 1 — real Stripe test mode via the Payment Element, never mocked):
//   T12.1 — double-booking a taken slot surfaces the UX-18 slot_taken banner
//           ("This time slot was just booked by someone else."), NOT the
//           generic "check your card details" copy. The 409 fires on the
//           booking POST before any charge — but elements.submit() validates
//           the card first, so the element must hold a valid test card.
//   T12.2 — happy path: free slot → details → pay with 4242… → confirmation
//           screen with booking reference + a bookings row in the DB. The
//           status flip to 'confirmed' rides the Stripe webhook (CLI listener
//           must be forwarding) — the DB assert accepts pending_payment OR
//           confirmed and the Gate 3 report records which was observed.
//
// Fixture (P8 pattern): a service-role 'confirmed' blocker booking at Monday
// 09:00 drives T12.1; T12.2 books the free 10:00 slot. coach_sports
// price_individual_pence is pinned to £60 so the page's price param matches
// the server's re-derived price (price_mismatch 409 checks run BEFORE the
// slot checks in /api/guest/bookings).

import { test, expect, type Page } from '@playwright/test'
import { dbAdmin, getCoachProfileIdByEmail } from './fixtures/db'
import { fillPaymentElementCard, clickPayResilient } from './fixtures/stripe'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[P12] missing required env: ${key} (loaded from .env.local by playwright.config.ts)`)
  return v
}
const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')

const REF_PREFIX = 'E2E-G3-'
const GUEST_NAME = 'E2E G3 Guest'
const PARTICIPANT = 'E2E G3 Player'
const PRICE_PENCE = 6000 // £60 — pinned onto coach_sports in beforeAll

/** Local-timezone YYYY-MM-DD (mirrors src/lib/availability/slots.ts). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** Next Monday ≥3 days out (P8 — clears min-advance, inside max-advance). */
function nextBookableMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return d
}

test.describe('P12 — Gate 3: guest 1-on-1 checkout', () => {
  let coachProfileId: string
  let sportId: string
  let bookedByUserId: string
  const monday = nextBookableMonday()
  const mondayISO = localISODate(monday)

  function checkoutUrl(startTime: string): string {
    const q = new URLSearchParams({
      date: mondayISO,
      startTime,
      sessionType: 'individual',
      price: String(PRICE_PENCE),
      participant: PARTICIPANT,
    })
    return `/book/${coachProfileId}?${q.toString()}`
  }

  /** Fills ONLY the required guest details and the Stripe card element.
   *
   *  BUG-29 regression: phone and address are deliberately left EMPTY. The
   *  pre-fix code passed `phone: form.phone || undefined` to confirmPayment
   *  while the Payment Element declares fields.billing_details.phone:
   *  'never' — Stripe rejected with an unhandled IntegrationError and the
   *  checkout froze on "Processing…" forever. T12.2 completing a real
   *  payment with these fields blank IS the regression test for that fix. */
  async function fillCheckout(page: Page): Promise<void> {
    await page.getByPlaceholder('Your full name').fill(GUEST_NAME)
    await page.getByPlaceholder('you@example.com').fill('e2e-g3-guest@crikly.app')
    await fillPaymentElementCard(page)
    // Blur out of the Stripe iframe before the pay click (see clickPayResilient).
    await page.getByRole('heading', { name: 'Payment' }).click()
  }

  test.beforeAll(async () => {
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    // Public checkout 404s/mis-prices for a non-live coach (P8 pattern).
    const { error: liveErr } = await dbAdmin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coachProfileId)
    if (liveErr) throw new Error(`[P12] is_profile_live setup failed: ${liveErr.message}`)

    const { data: coachRow, error: coachErr } = await dbAdmin
      .from('coach_profiles')
      .select('user_profile_id')
      .eq('id', coachProfileId)
      .single()
    if (coachErr || !coachRow) throw new Error(`[P12] coach_profiles read failed: ${coachErr?.message}`)
    bookedByUserId = coachRow.user_profile_id as string

    const { data: sportRow, error: sportErr } = await dbAdmin
      .from('coach_sports')
      .select('sport_id')
      .eq('coach_profile_id', coachProfileId)
      .limit(1)
      .single()
    if (sportErr || !sportRow) throw new Error(`[P12] coach_sports read failed: ${sportErr?.message}`)
    sportId = sportRow.sport_id as string

    // Pin the 1-on-1 price the server re-derives — price_mismatch fires before
    // any slot check, so an unset price would mask the behaviour under test.
    const { error: priceErr } = await dbAdmin
      .from('coach_sports')
      .update({ price_individual_pence: PRICE_PENCE, updated_at: new Date().toISOString() })
      .eq('coach_profile_id', coachProfileId)
      .eq('sport_id', sportId)
    if (priceErr) throw new Error(`[P12] price pin failed: ${priceErr.message}`)

    // Idempotency: free both slots from prior/crashed runs — the blocker (by
    // reference prefix) and any prior happy-path booking (by participant).
    await dbAdmin
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('coach_profile_id', coachProfileId)
      .like('booking_reference', `${REF_PREFIX}%`)
      .is('deleted_at', null)
    await dbAdmin
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('coach_profile_id', coachProfileId)
      .eq('participant_name', PARTICIPANT)
      .is('deleted_at', null)

    // T12.1's blocker: Monday 09:00 is already confirmed for someone else.
    const { error: insertErr } = await dbAdmin.from('bookings').insert({
      booking_reference: `${REF_PREFIX}BLOCK-${Date.now()}`,
      coach_profile_id: coachProfileId,
      sport_id: sportId,
      booked_by_user_id: bookedByUserId,
      session_type: 'individual',
      session_date: mondayISO,
      session_start_time: '09:00:00',
      session_end_time: '10:00:00',
      coach_price_pence: PRICE_PENCE,
      commission_rate: 0.1,
      commission_pence: 600,
      parent_total_pence: 6600,
      currency: 'GBP',
      status: 'confirmed',
      messaging_unlocked: false,
      cancellation_window_hours: 24,
      participant_name: 'P12 Blocker',
    })
    if (insertErr) throw new Error(`[P12] blocker booking insert failed: ${insertErr.message}`)
  })

  test.afterAll(async () => {
    // Soft delete only (CLAUDE.md) — frees both slots for re-runs.
    await dbAdmin
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('coach_profile_id', coachProfileId)
      .like('booking_reference', `${REF_PREFIX}%`)
      .is('deleted_at', null)
    await dbAdmin
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('coach_profile_id', coachProfileId)
      .eq('participant_name', PARTICIPANT)
      .is('deleted_at', null)
  })

  test('T12.1: booking a taken slot shows the slot_taken banner — not card-details copy', async ({ page }) => {
    // Stripe JS + Payment Element iframe mount + the real payment roundtrips
    // don't fit the suite's 60s dev-server budget — give the paying tests 2×.
    test.setTimeout(120_000)
    await page.goto(checkoutUrl('09:00'))
    await fillCheckout(page)
    await clickPayResilient(page, 'pay-button')

    // UX-18: the availability-shaped 409 gets honest copy. The generic payment
    // fallback ("check your card details") here would be the regression.
    // :not() excludes Next's empty route-announcer, which also carries
    // role="alert" and trips strict mode.
    const banner = page.locator('div[role="alert"]:not([id="__next-route-announcer__"])')
    await expect(banner).toContainText('This time slot was just booked by someone else.', {
      timeout: 20_000,
    })
    await expect(banner).not.toContainText('check your card details')
    // No charge happened — the guest can pick another time from the banner.
    await expect(banner.getByRole('link', { name: 'Choose another time' })).toBeVisible()
  })

  test('T12.2: happy path — free slot, real test-mode payment, confirmation + DB row', async ({ page }) => {
    // Timing probes (TEST-E2E-03) showed headless Playwright calls stall in
    // ~30s quanta on this Stripe-Elements-heavy page when it isn't the first
    // checkout of the browser session — yet the payment itself completes
    // (~130s worst observed). So: a large budget and a patient poll that
    // re-clicks Pay while the button sits untouched (the click-swallow from
    // clickPayResilient's doc comment), passing the moment the confirmation
    // renders.
    test.setTimeout(240_000)
    await page.goto(checkoutUrl('10:00'))
    await fillCheckout(page)

    const pay = page.getByTestId('pay-button')
    const confirmedBtn = page.getByTestId('copy-reference-button')
    await pay.click()
    await expect
      .poll(
        async () => {
          if (await confirmedBtn.isVisible().catch(() => false)) return 'confirmed'
          const label = ((await pay.textContent().catch(() => '')) ?? '').trim()
          if (label.startsWith('Pay £')) await pay.click().catch(() => undefined)
          return 'waiting'
        },
        { timeout: 180_000, intervals: [4_000] },
      )
      .toBe('confirmed')

    // ── DB ASSERT ─────────────────────────────────────────────────────
    // The row exists immediately as pending_payment; the webhook (Stripe CLI
    // listener) flips it to confirmed. Accept either here — the Gate 3 report
    // records the observed status so the webhook item stays honest.
    await expect
      .poll(
        async () => {
          const { data, error } = await dbAdmin
            .from('bookings')
            .select('status')
            .eq('coach_profile_id', coachProfileId)
            .eq('session_date', mondayISO)
            .eq('session_start_time', '10:00:00')
            .eq('participant_name', PARTICIPANT)
            .is('deleted_at', null)
          if (error) throw new Error(`[P12] booking read failed: ${error.message}`)
          return data?.[0]?.status ?? null
        },
        { timeout: 20_000 },
      )
      .toMatch(/^(pending_payment|confirmed)$/)
  })
})
