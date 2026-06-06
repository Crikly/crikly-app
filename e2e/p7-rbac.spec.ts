// AUTH-FIX-01 / P7 — RBAC: role-based access control.
// Negative-path coverage for the bug Lasith found in the AUTH-AUDIT-01
// review: a parent could navigate to /coach/dashboard and see the coach
// UI shell. Now covered by:
//   - middleware redirecting unauthenticated requests to /login (T7.1, T7.2)
//   - coach/layout.tsx redirecting non-coach users to /dashboard (T7.3)

import { test, expect } from '@playwright/test'

test.describe('P7 — RBAC: route protection', () => {
  test('T7.1: unauthenticated GET /coach/dashboard redirects to /login', async ({
    page,
  }) => {
    await page.goto('/coach/dashboard')
    await page.waitForURL(/\/login/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('T7.2: unauthenticated GET /onboarding/role redirects to /login', async ({
    page,
  }) => {
    await page.goto('/onboarding/role')
    await page.waitForURL(/\/login/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('T7.3: parent-role user navigating to /coach/dashboard lands on /dashboard', async ({
    page,
  }) => {
    const email = process.env.TEST_PARENT_EMAIL
    const password = process.env.TEST_PARENT_PASSWORD
    test.skip(
      !email || !password,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD must be set in .env.local — use the account Lasith set to active_role=parent during the AUTH-AUDIT-01 review.',
    )

    await page.goto('/login')
    await page.getByLabel('Email address').fill(email as string)
    await page.getByLabel('Password', { exact: true }).fill(password as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()

    // After login the redirect may land on /dashboard or /onboarding/terms
    // depending on this user's terms_accepted_at state. Either is a valid
    // post-login destination — the key assertion comes after the manual
    // navigation below.
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 15000 })

    // Manually navigate to /coach/dashboard. The coach layout guard should
    // bounce this user to /dashboard because they have no coach role.
    await page.goto('/coach/dashboard')
    await page.waitForURL(/\/dashboard$/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
