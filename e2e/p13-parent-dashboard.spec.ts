// P-04-A — parent dashboard smoke coverage.
//   T13.1: unauthenticated access is bounced to /login (middleware).
//   T13.2: a parent lands on /parent/dashboard after login and sees the
//          hero greeting, nav avatar and search CTA.
//   T13.3: the nav avatar opens the ProfilePopover with Sign out.
//
// The parent user is provisioned by e2e/fixtures/seed.ts when
// TEST_PARENT_EMAIL/TEST_PARENT_PASSWORD are set (same guard as p7-rbac).

import { test, expect } from '@playwright/test'

test.describe('P13 — Parent dashboard', () => {
  test('T13.1: unauthenticated GET /parent/dashboard redirects to /login', async ({
    page,
  }) => {
    await page.goto('/parent/dashboard')
    await page.waitForURL(/\/login/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('T13.2: parent login lands on the dashboard with hero + search CTA', async ({
    page,
  }) => {
    const email = process.env.TEST_PARENT_EMAIL
    const password = process.env.TEST_PARENT_PASSWORD
    test.skip(
      !email || !password,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set — seed.ts skips parent provisioning without them (see .env.example).',
    )

    await page.goto('/login')
    await page.getByLabel('Email address').fill(email as string)
    await page.getByLabel('Password', { exact: true }).fill(password as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()

    // Post-login the router may pass through /dashboard or /onboarding/terms
    // first depending on the seed user's terms state; the terminal parent
    // surface is what we assert on directly.
    await page.waitForURL(/\/(parent\/dashboard|dashboard|onboarding)/, {
      timeout: 15000,
    })
    await page.goto('/parent/dashboard')
    await page.waitForURL(/\/parent\/dashboard$/, { timeout: 10000 })

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hi ')
    await expect(page.getByTestId('parent-search-bar')).toBeVisible()
    await expect(page.getByTestId('search-cta')).toContainText(
      'Find a cricket coach',
    )
    await expect(page.getByTestId('upcoming-sessions')).toBeVisible()
  })

  test('T13.3: nav avatar opens the profile popover with Sign out', async ({
    page,
  }) => {
    const email = process.env.TEST_PARENT_EMAIL
    const password = process.env.TEST_PARENT_PASSWORD
    test.skip(
      !email || !password,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set — seed.ts skips parent provisioning without them (see .env.example).',
    )

    await page.goto('/login')
    await page.getByLabel('Email address').fill(email as string)
    await page.getByLabel('Password', { exact: true }).fill(password as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.waitForURL(/\/(parent\/dashboard|dashboard|onboarding)/, {
      timeout: 15000,
    })
    await page.goto('/parent/dashboard')
    await page.waitForURL(/\/parent\/dashboard$/, { timeout: 10000 })

    await page.getByTestId('parent-nav-avatar').click()
    const popover = page.getByTestId('profile-popover')
    await expect(popover).toBeVisible()
    await expect(popover.getByText('Sign out')).toBeVisible()
    await expect(popover.getByText('Settings')).toBeVisible()

    // Close on outside click.
    await page.mouse.click(10, 300)
    await expect(popover).toHaveAttribute('aria-hidden', 'true')
  })
})
