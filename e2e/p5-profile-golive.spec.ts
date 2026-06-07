// TEST-E2E-01 / P5 — Profile + Go Live
// First-pass: profile edit page loads + Go Live button visible.
// TEST-E2E-02: T5.3 clicks Go live, asserts the celebration modal appears,
// reads is_profile_live=true from the DB, then closes the modal. beforeAll
// + afterAll defensively reset is_profile_live=false so re-runs start clean
// regardless of prior crashes.

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'
import { getCoachIsProfileLive, resetCoachIsProfileLive } from './fixtures/db'

const TEST_COACH_EMAIL = process.env.TEST_COACH_EMAIL as string

test.describe('P5 — Profile + Go Live', () => {
  // BUG-QA-04 defensive: if a prior P5 run left is_profile_live=true (afterAll
  // skipped on crash, etc.), T5.2's "Go live button visible" would fail because
  // the button is hidden when the profile is already live. Reset before each
  // run.
  test.beforeAll(async () => {
    await resetCoachIsProfileLive(TEST_COACH_EMAIL)
  })

  // Restore the seeded state so the next E2E run starts in the same state and
  // the seed assumption (is_profile_live=false) holds.
  test.afterAll(async () => {
    await resetCoachIsProfileLive(TEST_COACH_EMAIL)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsTestCoach(page)
  })

  test('T5.1: /coach/profile/edit loads (page is reachable from an authed session)', async ({ page }) => {
    await page.goto('/coach/profile/edit')
    await expect(page).toHaveURL(/\/coach\/profile\/edit/)
    // Profile edit chrome is intricate; assert the page settled without
    // redirecting to /login (which would indicate auth failure) and without
    // erroring (a non-coach role would redirect to a role-picker).
    await expect(page).not.toHaveURL(/\/login/)
  })

  test('T5.2: Go live button is visible on the profile edit page', async ({ page }) => {
    await page.goto('/coach/profile/edit')
    // ProfileEdit.tsx renders the button labelled "Go live" (lowercase l)
    // or "Going live…" while the action is in-flight. The seed leaves the
    // coach with is_profile_live=false so the resting label is "Go live".
    const goLiveBtn = page.getByRole('button', { name: /Go live$/i })
    await expect(goLiveBtn).toBeVisible()
  })

  test('T5.3: clicking Go live flips is_profile_live to true (UI + DB)', async ({ page }) => {
    await page.goto('/coach/profile/edit')

    // Click Go live.
    const goLiveBtn = page.getByRole('button', { name: /Go live$/i })
    await expect(goLiveBtn).toBeVisible()
    await goLiveBtn.click()

    // BUG-GO-LIVE-PATH success modal opens with the h2 "You're live! 🎉".
    // Waiting for it confirms the server-side state flip completed.
    await expect(page.getByRole('heading', { name: /You're live/i })).toBeVisible({ timeout: 15_000 })

    // ── DB ASSERT ─────────────────────────────────────────────────────
    const isLive = await getCoachIsProfileLive(TEST_COACH_EMAIL)
    expect(isLive).toBe(true)

    // ── TEARDOWN: close the modal cleanly so subsequent tests in this
    //    describe wouldn't inherit a stuck overlay (defensive — Playwright
    //    spins up a fresh page per test, but the close also tests that the
    //    Done button works end-to-end).
    await page.getByRole('button', { name: 'Done', exact: true }).click()
  })
})
