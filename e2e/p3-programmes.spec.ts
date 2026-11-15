// TEST-E2E-01 / P3 — Programmes
// First-pass: page load + reach Step 1 of the create flow.
// TEST-E2E-02: T3.3 covers the full Step 1 → Step 2 → cancel flow with a
// DB assertion that the auto-saved draft has status='draft' (not 'active').
// Interpretation (a) per Lasith: handleContinue() persists a draft on Step 1
// advance — "no programme was created" isn't possible, but "no ACTIVE
// programme was created" is the meaningful cancel-correctness assertion.

import { test, expect, type Page } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'
import {
  dbAdmin,
  getCoachProfileIdByEmail,
  deleteProgrammeByTitle,
  createTestProgramme,
  softDeleteProgramme,
} from './fixtures/db'

const TEST_COACH_EMAIL = process.env.TEST_COACH_EMAIL as string
const TEST_PROGRAMME_TITLE = 'E2E Test Programme'

test.describe('P3 — Programmes', () => {
  // Belt-and-braces cleanup — if a prior run crashed before afterAll, this
  // soft-deletes the leftover draft so T3.3's .single() assertion can match
  // exactly one active row.
  test.beforeAll(async () => {
    await deleteProgrammeByTitle(TEST_COACH_EMAIL, TEST_PROGRAMME_TITLE)
  })

  test.afterAll(async () => {
    await deleteProgrammeByTitle(TEST_COACH_EMAIL, TEST_PROGRAMME_TITLE)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsTestCoach(page)
  })

  test('T3.1: /coach/programmes loads with the Programmes heading + New Programme CTA', async ({ page }) => {
    await page.goto('/coach/programmes')
    await expect(page).toHaveURL(/\/coach\/programmes/)
    await expect(page.getByRole('heading', { name: 'Programmes', level: 1 })).toBeVisible()
    // The sticky header carries a "New Programme" pill button; the empty state
    // ALSO has a "Create Programme" CTA. Either route to /coach/programmes/create.
    await expect(page.getByRole('button', { name: /New Programme/i })).toBeVisible()
  })

  test('T3.2: clicking New Programme navigates to /coach/programmes/create (Step 1)', async ({ page }) => {
    await page.goto('/coach/programmes')
    await page.getByRole('button', { name: 'New Programme', exact: true }).click()
    await expect(page).toHaveURL(/\/coach\/programmes\/create/)
  })

  test('T3.3: Step 1 fill → advance to Step 2 → cancel → draft persists as status=draft', async ({ page }) => {
    await page.goto('/coach/programmes/create')

    // ── STEP 1 ──────────────────────────────────────────────────────────
    // Title: <input> has no bound label. Stable selector is the placeholder.
    await page.getByPlaceholder('e.g. Saturday Beginner Cricket').fill(TEST_PROGRAMME_TITLE)

    // Sport: PillButton with text "Cricket" (the seed's configured sport).
    // The "Cricket" pill is the only Cricket button on Step 1 — other steps
    // aren't rendered yet so no collision.
    await page.getByRole('button', { name: 'Cricket', exact: true }).click()

    // Skill level: PillButton with text "Beginner".
    await page.getByRole('button', { name: 'Beginner', exact: true }).click()

    // Age groups: must pick at least one (UI enforced). Use 'Under 8'.
    await page.getByRole('button', { name: 'Under 8', exact: true }).click()

    // Continue — this auto-saves the programme as a draft and advances.
    await page.getByRole('button', { name: /Continue/i }).click()

    // ── STEP 2 ──────────────────────────────────────────────────────────
    // Step 2 marker: "Step 2 of 4" pill in the top header.
    await expect(page.getByText('Step 2 of 4')).toBeVisible({ timeout: 15_000 })

    // ── CANCEL ──────────────────────────────────────────────────────────
    // Step 2 top-bar "Back" button decrements step.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByText('Step 1 of 4')).toBeVisible()

    // Step 1 top-bar "Back to programmes" navigates out of the flow.
    await page.getByRole('button', { name: /Back to programmes/i }).click()
    await expect(page).toHaveURL(/\/coach\/programmes$/)

    // ── DB ASSERT (interpretation a per Lasith STEP 1 Q1) ───────────────
    // The auto-save on Continue created a draft. Verify it exists with
    // status='draft' (proves cancel did NOT advance the programme to active).
    const coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)
    const { data, error } = await dbAdmin
      .from('group_programmes')
      .select('status')
      .eq('coach_profile_id', coachProfileId)
      .eq('title', TEST_PROGRAMME_TITLE)
      .is('deleted_at', null)
      .single()
    expect(error).toBeNull()
    expect(data?.status).toBe('draft')
  })

  // STAGE1-CANCEL-OFFLINE (Decision T-21): cancelling a programme parents have
  // paid for must show the direct-refund warning and need an explicit confirm.
  //
  // The programmes API is stubbed at the network layer for these two tests:
  // a paid enrolment needs a real Stripe payment to exist, and the server-side
  // rule (409 without the flag, emails once) is covered by the Jest route
  // tests. What is proven here is the coach-facing behaviour in a real browser.
  test.describe('T-21 — cancel warning for paid programmes', () => {
    const PROGRAMME_ID = '11111111-1111-4111-8111-111111111111'
    const WARNING_TITLE = 'Parents have already paid'
    const WARNING_DUTY =
      'If you cancel, you must refund them directly. Crikly does not refund programme fees.'

    const activeProgramme = {
      id: PROGRAMME_ID,
      sport_id: 'sport-1',
      sport_name: 'Cricket',
      title: 'E2E Paid Programme T-21',
      description: null,
      schedule_type: 'fixed',
      day_of_week: 6,
      day_name: 'Saturday',
      days_of_week: [6],
      start_time: '10:00:00',
      duration_minutes: 60,
      max_spots: 10,
      current_spots: 3,
      spots_remaining: 7,
      payment_type: 'per_session',
      price_per_session_pence: 2000,
      block_price_pence: null,
      block_session_count: null,
      currency: 'GBP',
      status: 'active',
      created_at: '2026-11-01T00:00:00Z',
      venue_name: null,
      venue_address: null,
      min_participants: null,
      cancellation_window_hours: 24,
      image_url: null,
      age_groups: [],
      starts_at: null,
      camp_mode: false,
    }

    /** Stubs the list + PATCH. Returns the PATCH bodies the page sent. */
    async function stubProgrammesApi(page: Page): Promise<Array<Record<string, unknown>>> {
      const patchBodies: Array<Record<string, unknown>> = []
      let cancelled = false

      await page.route('**/api/coaches/programmes', async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        await route.fulfill({ json: { programmes: cancelled ? [] : [activeProgramme] } })
      })

      await page.route(`**/api/coaches/programmes/${PROGRAMME_ID}`, async (route) => {
        if (route.request().method() !== 'PATCH') return route.fallback()
        const body = route.request().postDataJSON() as Record<string, unknown>
        patchBodies.push(body)
        if (body.confirm_direct_refunds === true) {
          cancelled = true
          await route.fulfill({ json: { ...activeProgramme, status: 'cancelled' } })
          return
        }
        await route.fulfill({
          status: 409,
          json: {
            error: 'Parents have already paid for this programme',
            code: 'PAID_ENROLMENTS_CONFIRM_REQUIRED',
            message:
              'Parents have already paid. You must refund them directly. Crikly does not refund programme fees.',
            paid_enrolment_count: 3,
          },
        })
      })

      return patchBodies
    }

    async function openCancelWarning(page: Page): Promise<void> {
      await page.goto('/coach/programmes')
      await expect(page.getByText(activeProgramme.title, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm cancel', exact: true }).click()
      await expect(page.getByTestId('programme-refund-warning')).toBeVisible()
    }

    test('T3.4: the warning appears and "Keep programme" cancels nothing', async ({ page }) => {
      const patchBodies = await stubProgrammesApi(page)
      await openCancelWarning(page)

      const warning = page.getByTestId('programme-refund-warning')
      await expect(warning).toContainText(WARNING_TITLE)
      await expect(warning).toContainText('Parents have paid for 3 places on this programme.')
      await expect(warning).toContainText(WARNING_DUTY)
      // Keyboard focus lands on the safe choice, not the destructive one.
      await expect(page.getByTestId('refund-warning-keep')).toBeFocused()

      // The first request carried no confirmation flag.
      expect(patchBodies).toEqual([{ status: 'cancelled' }])

      await page.getByTestId('refund-warning-keep').click()

      await expect(warning).toHaveCount(0)
      await expect(page.getByText(activeProgramme.title, { exact: true })).toBeVisible()
      // No second request — the programme was not cancelled.
      expect(patchBodies).toHaveLength(1)
    })

    test('T3.5: confirming sends the direct-refund acknowledgement and cancels', async ({ page }) => {
      const patchBodies = await stubProgrammesApi(page)
      await openCancelWarning(page)

      await page.getByTestId('refund-warning-confirm').click()

      await expect(page.getByTestId('programme-refund-warning')).toHaveCount(0)
      await expect(page.getByText(activeProgramme.title, { exact: true })).toHaveCount(0)
      expect(patchBodies).toEqual([
        { status: 'cancelled' },
        { status: 'cancelled', confirm_direct_refunds: true },
      ])
    })
  })

  // STAGE1-CANCEL-OFFLINE-2 (Decision T-21). Real API and real database — no
  // stubs: a programme nobody has paid for cancels without the warning, so no
  // Stripe payment is needed to exercise the whole path.
  test.describe('T-21 — cancelled programmes are a read-only record', () => {
    const TITLE = 'E2E Cancelled Record T-21'
    let coachProfileId: string
    let programmeId: string

    test.beforeAll(async () => {
      coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

      // The public profile 404s for a non-live coach (P10 pattern — own the state).
      const { error: liveErr } = await dbAdmin
        .from('coach_profiles')
        .update({ is_profile_live: true, updated_at: new Date().toISOString() })
        .eq('id', coachProfileId)
      if (liveErr) throw new Error(`[P3] is_profile_live setup failed: ${liveErr.message}`)

      const { data: sportRow, error: sportErr } = await dbAdmin
        .from('coach_sports')
        .select('sport_id')
        .eq('coach_profile_id', coachProfileId)
        .limit(1)
        .single()
      if (sportErr || !sportRow) throw new Error(`[P3] coach_sports read failed: ${sportErr?.message}`)

      await deleteProgrammeByTitle(TEST_COACH_EMAIL, TITLE)
      const created = await createTestProgramme({
        coachProfileId,
        sportId: sportRow.sport_id as string,
        title: TITLE,
        campMode: false,
        maxSpots: 8,
        pricePerSessionPence: 16000,
        sessions: [],
      })
      programmeId = created.programmeId

      // Sold as one block: £160 for 4 sessions (the create form writes the
      // block price into both price columns).
      const { error: blockErr } = await dbAdmin
        .from('group_programmes')
        .update({ payment_type: 'block_upfront', block_price_pence: 16000, block_session_count: 4 })
        .eq('id', programmeId)
      if (blockErr) throw new Error(`[P3] block pricing setup failed: ${blockErr.message}`)
    })

    test.afterAll(async () => {
      if (programmeId) await softDeleteProgramme(programmeId)
    })

    test('T3.6: the public profile states the real price basis and no "payment is held" claim', async ({ page }) => {
      await page.goto(`/coaches/${coachProfileId}`)

      const section = page.locator('#programmes')
      await expect(section).toContainText('Weekly academies and holiday camps. Reserve a spot online.')
      await expect(section).not.toContainText('payment is held')

      // The innermost element holding both this programme's title and its
      // "Reserve a spot" link is that programme's card body.
      const card = section
        .locator('div')
        .filter({ hasText: TITLE })
        .filter({ has: page.locator(`a[href$="/programmes/${programmeId}"]`) })
        .last()
      await expect(card).toContainText(TITLE)
      await expect(card).toContainText('£160')
      await expect(card).toContainText('for 4 sessions')
      await expect(card).not.toContainText('per session')
    })

    test('T3.7: a cancelled programme moves to the Cancelled tab and cannot be re-published', async ({ page }) => {
      await page.goto('/coach/programmes')

      const card = page.locator('div.rounded-2xl', { has: page.getByText(TITLE, { exact: true }) })
      await expect(card).toBeVisible()
      await card.getByRole('button', { name: 'Cancel', exact: true }).click()
      await card.getByRole('button', { name: 'Confirm cancel', exact: true }).click()

      // Nobody had paid, so there is no warning — it cancels straight away.
      await expect(page.getByTestId('programme-refund-warning')).toHaveCount(0)
      await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0)

      // Not in Draft…
      await page.getByRole('button', { name: /^Draft/ }).click()
      await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0)

      // …but kept under Cancelled, read-only, with the approved reminder.
      await page.getByRole('button', { name: /^Cancelled/ }).click()
      await expect(page.getByTestId('cancelled-programmes-reminder')).toHaveText(
        'Cancelled programmes are kept here as a record. If parents had paid, you must refund them directly. Crikly does not refund programme fees.',
      )
      const cancelledCard = page.locator('div.rounded-2xl', { has: page.getByText(TITLE, { exact: true }) })
      await expect(cancelledCard).toBeVisible()
      await expect(cancelledCard.getByTestId('cancelled-view-roster')).toBeVisible()
      for (const name of ['Publish', 'Edit', 'Delete', 'Share', 'Cancel']) {
        await expect(cancelledCard.getByRole('button', { name, exact: true })).toHaveCount(0)
      }

      const { data: row } = await dbAdmin
        .from('group_programmes')
        .select('status')
        .eq('id', programmeId)
        .single()
      expect(row?.status).toBe('cancelled')

      // The server refuses to bring it back, whatever the client sends.
      const republish = await page.request.patch(`/api/coaches/programmes/${programmeId}`, {
        data: { status: 'active' },
      })
      expect(republish.status()).toBe(400)
      const edit = await page.request.patch(`/api/coaches/programmes/${programmeId}`, {
        data: { title: 'Renamed after cancel' },
      })
      expect(edit.status()).toBe(400)

      const { data: after } = await dbAdmin
        .from('group_programmes')
        .select('status, title')
        .eq('id', programmeId)
        .single()
      expect(after).toEqual({ status: 'cancelled', title: TITLE })
    })
  })
})
