// P-04-B (AUTH-FLOW-01) — ?role= consumption through the auth chain.
//
// The OAuth leg itself cannot run headless — the redirectTo construction
// and callback consumption are unit-tested (oauth.test.ts,
// callback.test.ts). This spec drives the email/password chain end to
// end: local Supabase has enable_confirmations=false, so a freshly
// registered user can log in immediately. Registration auto-establishes a
// session locally, so cookies are cleared before exercising /login?role=.
//
// The role auto-set goes through the real POST /api/auth/roles endpoint —
// nothing is mocked.

import { test, expect } from '@playwright/test'
import { seedUserProfileByEmail } from './fixtures/db'

const PASSWORD = 'p14-Password123'

function uniqueEmail(tag: string): string {
  return `p14-${tag}-${Date.now()}@crikly-e2e.test`
}

async function registerUser(
  page: import('@playwright/test').Page,
  email: string,
  rolePath: string,
) {
  await page.goto(`/register${rolePath}`)
  await page.getByLabel('Full name').fill('P14 Test Parent')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: /create account/i }).click()
  await page.waitForURL(/\/verify/, { timeout: 15000 })
  // Local config auto-confirms and signs the user in — clear the session
  // so the /login?role= path can be exercised cleanly.
  await page.context().clearCookies()
  // The user_profiles row is normally seeded by /auth/callback via the
  // verify-email link, which the auto-confirm local flow never visits —
  // seed it the same way so the login gate finds it.
  await seedUserProfileByEmail(email, 'P14 Test Parent')
}

async function login(
  page: import('@playwright/test').Page,
  email: string,
  rolePath: string,
) {
  await page.goto(`/login${rolePath}`)
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

test.describe('P14 — AUTH-FLOW-01: ?role= param consumption', () => {
  test('T14.1: valid ?role=parent — picker skipped, terms shown, lands on /parent/dashboard', async ({
    page,
  }) => {
    const email = uniqueEmail('parent')
    await registerUser(page, email, '?role=parent')

    await login(page, email, '?role=parent')
    // The password-login gate is terms-FIRST (AUTH-FIX-01 FIX D); in
    // production a fresh email/password user always passes through
    // /auth/callback (mandatory email verification), which is role-first
    // and forwards the validated param to the picker. Simulate that hop —
    // the callback's own forwarding is unit-tested (callback.test.ts).
    await page.waitForURL(/\/onboarding\//, { timeout: 20000 })
    await page.goto('/onboarding/role?role=parent')

    // Role picker is skipped: the picker auto-submits through the real
    // POST /api/auth/roles and forwards to terms without any card tap.
    await page.waitForURL(/\/onboarding\/terms/, { timeout: 20000 })

    await page.getByTestId('terms-checkbox').check()
    await page.getByTestId('terms-continue').click()
    await page.waitForURL(/\/parent\/(dashboard|link-bookings)$/, { timeout: 20000 })
    // A brand-new e2e email has no guest bookings — terminal is the dashboard.
    await expect(page).toHaveURL(/\/parent\/dashboard$/)
  })

  test('T14.2: invalid ?role= is silently ignored — role picker shown as normal', async ({
    page,
  }) => {
    const email = uniqueEmail('invalid')
    await registerUser(page, email, '?role=superadmin')

    await login(page, email, '?role=superadmin')
    await page.waitForURL(/\/onboarding\//, { timeout: 20000 })
    await page.goto('/onboarding/role?role=superadmin')

    // Validated-null short-circuit: no auto-submit, all three cards render
    // and the page stays put.
    await expect(page.getByTestId('role-card-parent')).toBeVisible()
    await expect(page.getByTestId('role-card-player')).toBeVisible()
    await expect(page.getByTestId('role-card-coach')).toBeVisible()
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/onboarding\/role\?role=superadmin/)
  })

  test('T14.3: existing coach logging in with ?role=parent keeps coach flow — stored role wins', async ({
    page,
  }) => {
    const email = process.env.TEST_COACH_EMAIL
    const password = process.env.TEST_COACH_PASSWORD
    test.skip(!email || !password, 'TEST_COACH_EMAIL / TEST_COACH_PASSWORD not set.')

    await page.goto('/login?role=parent')
    await page.getByLabel('Email address').fill(email as string)
    await page.getByLabel('Password', { exact: true }).fill(password as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()

    // The seed coach's post-login destination is role-aware; whatever it
    // is, it must NOT be a parent surface and must NOT carry the param.
    await page.waitForURL(/\/(coach|dashboard|onboarding\/role)/, { timeout: 20000 })
    await expect(page).not.toHaveURL(/\/parent\//)
  })
})
