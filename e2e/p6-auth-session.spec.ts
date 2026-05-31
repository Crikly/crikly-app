// TEST-E2E-01 / P6 — Auth + session persistence
// First-pass coverage: email/password login → /coach landing, then session
// survives a hard reload.
//
// NO beforeEach login here — this spec tests the login flow itself, so it
// can't depend on the helper that performs the same action.

import { test, expect } from '@playwright/test'

test.describe('P6 — Auth + session persistence', () => {
  test('T6.1: email/password login redirects to /dashboard (role-switcher landing)', async ({ page }) => {
    const email = process.env.TEST_COACH_EMAIL
    const password = process.env.TEST_COACH_PASSWORD
    test.skip(!email || !password, 'TEST_COACH_EMAIL / TEST_COACH_PASSWORD must be set')

    await page.goto('/login')
    await page.getByLabel('Email address').fill(email as string)
    await page.getByLabel('Password', { exact: true }).fill(password as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()

    // Successful login lands on /coach/dashboard (or another /coach/* route
    // depending on profile state). The loose match catches all valid landings.
    // Login redirects to /dashboard (role-switcher) — not /coach/* directly.
    await page.waitForURL(/\/dashboard$/, { timeout: 15000 })
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('T6.2: session persists across a hard reload (no redirect to /login)', async ({ page }) => {
    const email = process.env.TEST_COACH_EMAIL
    const password = process.env.TEST_COACH_PASSWORD
    test.skip(!email || !password, 'TEST_COACH_EMAIL / TEST_COACH_PASSWORD must be set')

    // Establish session (same as T6.1).
    await page.goto('/login')
    await page.getByLabel('Email address').fill(email as string)
    await page.getByLabel('Password', { exact: true }).fill(password as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.waitForURL(/\/dashboard$/, { timeout: 15000 })

    // Navigate to a coach surface so the reload exercises the authed /coach/* path.
    await page.goto('/coach/dashboard')
    await page.waitForURL(/\/coach\//, { timeout: 10000 })

    // Hard-reload. Supabase auth cookies must still be present and valid for
    // the reload to land back on /coach/* instead of bouncing to /login.
    await page.reload({ waitUntil: 'load' })
    await expect(page).toHaveURL(/\/coach\//)
    await expect(page).not.toHaveURL(/\/login/)
  })
})
