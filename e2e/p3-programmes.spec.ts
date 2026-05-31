// TEST-E2E-01 / P3 — Programmes
// First-pass coverage: page load + reach Step 1 of the create flow.
// Full multi-step create-and-cancel flow deferred to TEST-E2E-02 — too many
// selectors to verify reliably without paired browser inspection.

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'

test.describe('P3 — Programmes', () => {
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
    // CreateProgramme.tsx Step 1 carries a "What's it about?" sub-heading (or
    // similar — the Step 1 layout is the title+sport step). Assert the page
    // rendered without error by checking the URL settled.
    // Heading-level assertion deferred to TEST-E2E-02 once Step 1 wording is
    // verified against the live UI.
  })
})
