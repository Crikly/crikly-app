// TEST-E2E-01: shared login helper for the Playwright suite.
//
// Performs UI-based login (visits /login, fills inputs, clicks submit, waits
// for the dashboard redirect). Used by every spec except P6 — which tests the
// login flow itself and shouldn't share this helper.

import type { Page } from '@playwright/test'

export async function loginAsTestCoach(page: Page): Promise<void> {
  const email = process.env.TEST_COACH_EMAIL
  const password = process.env.TEST_COACH_PASSWORD
  if (!email || !password) {
    throw new Error(
      'TEST_COACH_EMAIL and TEST_COACH_PASSWORD must be set in the environment.',
    )
  }

  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  // exact: true required — the form has a "Show password" toggle button whose
  // aria-label contains "password" and would otherwise resolve in strict mode.
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  // Seed test coach has no primary_role so the server's role-aware redirect
  // sends them to /onboarding/role instead of /dashboard. Both are valid
  // post-login destinations. Follow-up: update the test coach's
  // user_metadata.primary_role to 'coach' so this widens back to strict
  // /dashboard only.
  await page.waitForURL(/\/(dashboard|coach|onboarding\/role)/, { timeout: 15000 })
  await page.goto('/coach/dashboard')
  await page.waitForURL(/\/coach\//, { timeout: 10000 })
}
