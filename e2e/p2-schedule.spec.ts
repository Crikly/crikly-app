// TEST-E2E-01 / P2 — Schedule
// First-pass coverage: page load + week-view header + Today button.
// Prev/Next week navigation deferred to TEST-E2E-02 — clicking ChevronLeft/
// Right buttons (no accessible name) requires a more involved selector
// strategy that's better paired with paired manual verification.

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'

test.describe('P2 — Schedule', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestCoach(page)
  })

  test('T2.1: /coach/schedule loads with the Schedule heading', async ({ page }) => {
    await page.goto('/coach/schedule')
    await expect(page).toHaveURL(/\/coach\/schedule/)
    await expect(page.getByRole('heading', { name: 'Schedule', level: 1 })).toBeVisible()
  })

  test('T2.2: week view shows abbreviated weekday headers Mon–Sun', async ({ page }) => {
    await page.goto('/coach/schedule')
    // Schedule.tsx renders abbreviated day headings (Mon/Tue/.../Sun) per the
    // grid loop. All 7 must be visible for the week view to be rendered.
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      // .first() guards against the same abbreviation appearing twice (rare,
      // e.g. month-boundary edge cases in mini-calendars).
      await expect(page.getByText(day, { exact: true }).first()).toBeVisible()
    }
  })

  test('T2.3: Today button is visible and clickable without error', async ({ page }) => {
    await page.goto('/coach/schedule')
    const todayBtn = page.getByRole('button', { name: 'Today', exact: true })
    await expect(todayBtn).toBeVisible()
    await todayBtn.click()
    // Today button resets weekOffset → 0 (managed via local state, no URL change).
    // Asserting we stay on the schedule route and the heading still renders is
    // enough to catch any client error from the state update.
    await expect(page).toHaveURL(/\/coach\/schedule/)
    await expect(page.getByRole('heading', { name: 'Schedule', level: 1 })).toBeVisible()
  })
})
