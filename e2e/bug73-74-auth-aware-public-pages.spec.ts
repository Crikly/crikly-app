// BUG-73/74/75 — auth-aware public pages smoke coverage.
//   T73.1: logged-out /coaches shows the public header (Log in / Get started)
//          and coach cards link to the public profile route.
//   T73.2: a signed-in parent sees the parent AppShell on /coaches (My
//          bookings link) and coach cards deep-link to /availability.
//   T75.1: logged-out coach profile — desktop BookingCard CTA keeps the
//          guest checkout href (/book/...).
//   T75.2: signed-in parent on a coach profile — the CTA routes to
//          /coaches/[slug]/availability.
// (BUG-74's confirmation CTA needs a completed payment — covered by Jest
// unit tests on ConfirmationAccountCta instead.)
//
// The parent user is provisioned by e2e/fixtures/seed.ts when
// TEST_PARENT_EMAIL/TEST_PARENT_PASSWORD are set (same guard as p13/p14).

import { test, expect, type Page } from '@playwright/test'

async function firstCoachProfilePath(page: Page): Promise<string> {
  // Grab the first live coach's profile path from the listing grid.
  await page.goto('/coaches?sport=cricket')
  const card = page
    .locator('a[href^="/coaches/"]')
    .filter({ has: page.getByRole('img', { name: /Cricket coach/ }) })
    .first()
  await card.waitFor({ timeout: 15000 })
  const href = (await card.getAttribute('href')) ?? ''
  // BUG-73: an authed parent's card href already points at /availability —
  // strip it back to the profile path.
  return href.replace(/\/availability$/, '')
}

test.describe('BUG-73 — auth-aware /coaches listing', () => {
  test('T73.1: logged out — public header and profile card links', async ({
    page,
  }) => {
    await page.goto('/coaches?sport=cricket')
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'My bookings' })).toHaveCount(0)

    // Wait for the live grid, then assert the first card's href shape.
    const card = page
      .locator('a[href^="/coaches/"]')
      .filter({ hasNot: page.getByRole('navigation') })
      .first()
    await card.waitFor({ timeout: 15000 })
    const href = await card.getAttribute('href')
    expect(href).not.toContain('/availability')
  })

  test('T73.2: signed-in parent — AppShell nav and availability card links', async ({
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

    await page.goto('/coaches?sport=cricket')
    // Parent AppShell replaces the public header.
    await expect(page.getByRole('link', { name: 'My bookings' })).toBeVisible({
      timeout: 10000,
    })
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Get started' })).toHaveCount(0)

    // Coach cards (grid links carrying a photo alt "…, Cricket coach")
    // deep-link to the auth-aware booking flow.
    const cardImage = page.getByRole('img', { name: /Cricket coach/ }).first()
    await cardImage.waitFor({ timeout: 15000 })
    const card = page
      .locator('a[href^="/coaches/"]')
      .filter({ has: page.getByRole('img', { name: /Cricket coach/ }) })
      .first()
    const href = await card.getAttribute('href')
    expect(href).toMatch(/^\/coaches\/[^/]+\/availability$/)
  })
})

test.describe('BUG-75 — auth-aware coach profile BookingCard', () => {
  test('T75.1: logged out — desktop CTA keeps the guest checkout href', async ({
    page,
  }) => {
    const profilePath = await firstCoachProfilePath(page)
    await page.goto(profilePath)
    const cta = page.getByTestId('desktop-book-cta')
    await cta.waitFor({ state: 'attached', timeout: 15000 })
    const href = await cta.getAttribute('href')
    expect(href).toMatch(/^\/book\//)
  })

  test('T75.2: signed-in parent — desktop CTA routes to /availability', async ({
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

    const profilePath = await firstCoachProfilePath(page)
    await page.goto(profilePath)
    const cta = page.getByTestId('desktop-book-cta')
    await cta.waitFor({ state: 'attached', timeout: 15000 })
    const href = await cta.getAttribute('href')
    expect(href).toMatch(/^\/coaches\/[^/]+\/availability$/)
  })
})
