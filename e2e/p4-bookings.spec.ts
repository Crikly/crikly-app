// TEST-E2E-01 / P4 — Bookings
// First-pass coverage: page load + tab switching + empty state.
//
// Tab names are sourced from BookingsManagement.tsx line 12:
//   type Tab = 'Upcoming' | 'Pending approval' | 'Past'
// The original task brief mentioned "Today / Past / Pending" — that's not what
// the UI ships. Tests assert the real tabs (Lasith confirmed in STEP 2 scoping).

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'

test.describe('P4 — Bookings', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestCoach(page)
  })

  test('T4.1: /coach/bookings loads with the Bookings heading', async ({ page }) => {
    await page.goto('/coach/bookings')
    await expect(page).toHaveURL(/\/coach\/bookings/)
    await expect(page.getByRole('heading', { name: 'Bookings', level: 1 })).toBeVisible()
  })

  test('T4.2: tab row shows Upcoming / Pending approval / Past and tabs are clickable', async ({ page }) => {
    await page.goto('/coach/bookings')
    // All three tab buttons must be present on first paint.
    const upcomingTab = page.getByRole('button', { name: 'Upcoming', exact: true })
    const pendingTab = page.getByRole('button', { name: /Pending approval/i })
    const pastTab = page.getByRole('button', { name: 'Past', exact: true })
    await expect(upcomingTab).toBeVisible()
    await expect(pendingTab).toBeVisible()
    await expect(pastTab).toBeVisible()
    // Click each; route stays on /coach/bookings (tabs are local state).
    await pendingTab.click()
    await expect(page).toHaveURL(/\/coach\/bookings/)
    await pastTab.click()
    await expect(page).toHaveURL(/\/coach\/bookings/)
    await upcomingTab.click()
    await expect(page).toHaveURL(/\/coach\/bookings/)
  })

  test('T4.3: empty state renders cleanly for the seeded coach (no bookings)', async ({ page }) => {
    await page.goto('/coach/bookings')
    // Seeded coach has no bookings → the Upcoming tab shows an empty state.
    // The current empty-state copy includes "No upcoming bookings" or similar;
    // exact wording is verified against the live UI in the local run. For
    // first-pass we assert that the page is in a non-error stable state —
    // heading still visible after the data fetch settles.
    await expect(page.getByRole('heading', { name: 'Bookings', level: 1 })).toBeVisible()
    // Negative assertion: no booking-row card should be visible when the
    // seeded coach has none. Asserting on the collection locator (no .first())
    // — .first() would narrow to a single element, making the count check
    // vacuous and unable to catch a regression where rows actually appear.
    await expect(page.locator('[data-testid="booking-row"]')).toHaveCount(0)
  })
})
