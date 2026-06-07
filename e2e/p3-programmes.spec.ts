// TEST-E2E-01 / P3 — Programmes
// First-pass: page load + reach Step 1 of the create flow.
// TEST-E2E-02: T3.3 covers the full Step 1 → Step 2 → cancel flow with a
// DB assertion that the auto-saved draft has status='draft' (not 'active').
// Interpretation (a) per Lasith: handleContinue() persists a draft on Step 1
// advance — "no programme was created" isn't possible, but "no ACTIVE
// programme was created" is the meaningful cancel-correctness assertion.

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'
import { dbAdmin, getCoachProfileIdByEmail, deleteProgrammeByTitle } from './fixtures/db'

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
})
