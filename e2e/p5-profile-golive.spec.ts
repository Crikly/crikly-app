// TEST-E2E-01 / P5 — Profile + Go Live
// First-pass coverage: profile edit page loads + Go Live button visible.
//
// Clicking Go Live + DB assertion deferred to TEST-E2E-02 — the click flow
// touches the modal celebration (BUG-GO-LIVE-PATH) and downstream profile
// state, both of which need paired UI verification. The `dbAdmin` helper
// in e2e/fixtures/db.ts is ready for that follow-up.

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'

test.describe('P5 — Profile + Go Live', () => {
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
})
