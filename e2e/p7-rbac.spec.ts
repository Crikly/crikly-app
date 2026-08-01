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

  test('T7.3: parent-role user navigating to /coach/dashboard lands on /coaches', async ({
    page,
  }) => {
    const email = process.env.TEST_PARENT_EMAIL
    const password = process.env.TEST_PARENT_PASSWORD
    // TEST-E2E-03: the parent user is now provisioned by e2e/fixtures/seed.ts
    // (step 7) whenever TEST_PARENT_EMAIL/TEST_PARENT_PASSWORD are set — they
    // are in .env.local locally and documented in .env.example. This guard now
    // only fires on an environment missing the vars (e.g. CI until the two
    // secrets are added), with this recorded reason.
    test.skip(
      !email || !password,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set — seed.ts skips parent provisioning without them (see .env.example). Add both to run this RBAC negative path.',
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

    // Manually navigate to /coach/dashboard. The coach layout guard bounces a
    // user with no coach role to /dashboard (coach/layout.tsx), and /dashboard
    // routes a parent/player active_role to the public /coaches browse page —
    // the P-04-PREP-01 placeholder until the parent dashboard ships
    // ((dashboard)/dashboard/page.tsx).
    //
    // The invariant under test is unchanged — a parent must never land on a
    // /coach/* surface. Revisit the terminal URL when P-04 ships the real
    // parent dashboard.
    await page.goto('/coach/dashboard')
    await page.waitForURL(/\/coaches$/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/coaches$/)
    await expect(page).not.toHaveURL(/\/coach\//)
  })
})
