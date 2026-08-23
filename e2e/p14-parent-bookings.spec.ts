// P-14 — parent bookings management smoke coverage.
//   T14b.1: unauthenticated access is bounced to /login (middleware).
//   T14b.2: a parent lands on /parent/bookings and sees the page title with
//           Upcoming / Past sessions tabs (Upcoming active by default).
//   T14b.3: switching to Past sessions renders that tab's content (cards or
//           its empty state).
//
// ("T14b" — plain T14 is taken by p14-auth-role-param.spec.ts.)
// The parent user is provisioned by e2e/fixtures/seed.ts when
// TEST_PARENT_EMAIL/TEST_PARENT_PASSWORD are set (same guard as p13).

import { test, expect, type Page } from '@playwright/test'

async function loginAsParent(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.waitForURL(/\/(parent\/dashboard|dashboard|onboarding)/, {
    timeout: 15000,
  })
}

test.describe('P14 — Parent bookings', () => {
  test('T14b.1: unauthenticated GET /parent/bookings redirects to /login', async ({
    page,
  }) => {
    await page.goto('/parent/bookings')
    await page.waitForURL(/\/login/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('T14b.2: parent sees the Bookings page with both tabs', async ({ page }) => {
    const email = process.env.TEST_PARENT_EMAIL
    const password = process.env.TEST_PARENT_PASSWORD
    test.skip(
      !email || !password,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set — seed.ts skips parent provisioning without them (see .env.example).',
    )

    await loginAsParent(page, email as string, password as string)
    await page.goto('/parent/bookings')
    await page.waitForURL(/\/parent\/bookings$/, { timeout: 10000 })

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bookings')
    const upcomingTab = page.getByRole('tab', { name: 'Upcoming' })
    await expect(upcomingTab).toBeVisible()
    await expect(upcomingTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Past sessions' })).toBeVisible()
  })

  test('T14b.3: Past sessions tab activates and renders its content', async ({
    page,
  }) => {
    const email = process.env.TEST_PARENT_EMAIL
    const password = process.env.TEST_PARENT_PASSWORD
    test.skip(
      !email || !password,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set — seed.ts skips parent provisioning without them (see .env.example).',
    )

    await loginAsParent(page, email as string, password as string)
    await page.goto('/parent/bookings')
    await page.waitForURL(/\/parent\/bookings$/, { timeout: 10000 })

    const pastTab = page.getByRole('tab', { name: 'Past sessions' })
    await pastTab.click()
    await expect(pastTab).toHaveAttribute('aria-selected', 'true')
    // Seed data may or may not include past bookings — accept either the
    // populated list or the tab's empty state.
    await expect(
      page
        .getByText('No past sessions yet')
        .or(page.getByText('paid').first()),
    ).toBeVisible({ timeout: 10000 })
  })
})
