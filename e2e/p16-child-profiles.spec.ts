// P-07 — child profiles (Screens 07/08/09).
//   T16.1: unauthenticated /parent/children/new bounces to /login.
//   T16.2: add-child flow — dashboard + bubble → form gates the CTA on
//          name + DOB → create → lands on the child profile card.
//   T16.3: edit flow — pre-filled form, save, card shows the change.
//   T16.4: remove flow — inline two-button confirmation (no browser
//          dialog), child gone from the dashboard.
//
// The parent user comes from e2e/fixtures/seed.ts (TEST_PARENT_EMAIL /
// TEST_PARENT_PASSWORD — same guard as p13). Children created here carry
// an E2EKid- name prefix and are hard-deleted from the local test DB in
// cleanup (fixture hygiene, deleteProgrammeByTitle precedent — the
// soft-delete-only rule governs production code, not test teardown).

import { test, expect, type Page } from '@playwright/test'
import { dbAdmin } from './fixtures/db'

const KID_NAME = 'E2EKidP16'
const KID_DOB = '2017-03-14'

function expectedAge(dob: string): number {
  const [year = 0, month = 0, day = 0] = dob.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - year
  const passed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!passed) age -= 1
  return age
}

async function cleanupKids(): Promise<void> {
  await dbAdmin.from('child_profiles').delete().like('full_name', `${KID_NAME}%`)
}

async function loginAsParent(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.waitForURL(/\/(parent\/dashboard|dashboard|onboarding)/, { timeout: 15000 })
  await page.goto('/parent/dashboard')
  await page.waitForURL(/\/parent\/dashboard$/, { timeout: 10000 })
}

test.describe('P16 — P-07 child profiles', () => {
  const email = process.env.TEST_PARENT_EMAIL
  const password = process.env.TEST_PARENT_PASSWORD

  test.beforeEach(async () => {
    await cleanupKids()
  })

  test.afterAll(async () => {
    await cleanupKids()
  })

  test('T16.1: unauthenticated GET /parent/children/new redirects to /login', async ({
    page,
  }) => {
    await page.goto('/parent/children/new')
    await page.waitForURL(/\/login/, { timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('T16.2: add-child form gates the CTA and creates the profile', async ({
    page,
  }) => {
    test.skip(!email || !password, 'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set.')
    await loginAsParent(page, email as string, password as string)

    await page.getByTestId('add-child-bubble').click()
    await page.waitForURL(/\/parent\/children\/new$/, { timeout: 10000 })

    // CTA disabled until name + DOB are present (gender stays optional).
    const cta = page.getByTestId('child-form-submit')
    await expect(cta).toBeDisabled()
    await expect(cta).toContainText('Add your child to your account')

    await page.getByTestId('child-name-input').fill(KID_NAME)
    await page.getByTestId('child-dob-input').fill(KID_DOB)
    await expect(cta).toBeEnabled()
    await expect(cta).toContainText(`Add ${KID_NAME} to your account`)

    await cta.click()

    // Lands on the Screen 07 player card.
    await page.waitForURL(/\/parent\/children\/[0-9a-f-]{36}$/, { timeout: 15000 })
    await expect(page.getByRole('heading', { level: 1 })).toContainText(KID_NAME)
    await expect(page.getByText(`Age ${expectedAge(KID_DOB)}`)).toBeVisible()
    await expect(page.getByTestId('next-session-row')).toContainText('No sessions yet')
    await expect(page.getByTestId('find-coach-link')).toContainText(
      `Find a coach for ${KID_NAME}`,
    )
  })

  test('T16.3: edit pre-fills and saves; card reflects the change', async ({
    page,
  }) => {
    test.skip(!email || !password, 'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set.')
    await loginAsParent(page, email as string, password as string)

    // Create via the UI so the flow under test owns its own fixture.
    await page.goto('/parent/children/new')
    await page.getByTestId('child-name-input').fill(KID_NAME)
    await page.getByTestId('child-dob-input').fill(KID_DOB)
    await page.getByTestId('child-form-submit').click()
    await page.waitForURL(/\/parent\/children\/[0-9a-f-]{36}$/, { timeout: 15000 })

    await page.getByTestId('child-card-edit').click()
    await page.waitForURL(/\/edit$/, { timeout: 10000 })

    await expect(page.getByTestId('edit-child-hero')).toContainText(`Editing ${KID_NAME}`)
    await expect(page.getByTestId('child-name-input')).toHaveValue(KID_NAME)
    await expect(page.getByTestId('child-dob-input')).toHaveValue(KID_DOB)

    await page.getByTestId('child-safety-note').fill('Mild asthma — inhaler in bag')
    await page.getByTestId('child-form-submit').click()

    await page.waitForURL(/\/parent\/children\/[0-9a-f-]{36}$/, { timeout: 15000 })
    await expect(page.getByTestId('safety-note-tile')).toContainText(
      'Mild asthma — inhaler in bag',
    )
  })

  test('T16.4: remove asks inline (no browser dialog) and returns to the dashboard', async ({
    page,
  }) => {
    test.skip(!email || !password, 'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set.')
    await loginAsParent(page, email as string, password as string)

    await page.goto('/parent/children/new')
    await page.getByTestId('child-name-input').fill(KID_NAME)
    await page.getByTestId('child-dob-input').fill(KID_DOB)
    await page.getByTestId('child-form-submit').click()
    await page.waitForURL(/\/parent\/children\/[0-9a-f-]{36}$/, { timeout: 15000 })
    const cardUrl = page.url()

    // A native dialog would fail the run — the confirmation must be inline.
    page.on('dialog', (dialog) => {
      throw new Error(`Unexpected browser dialog: ${dialog.type()}`)
    })

    await page.goto(`${cardUrl}/edit`)
    await page.getByTestId('remove-child-button').click()
    await expect(page.getByTestId('remove-confirm')).toContainText('This cannot be undone.')

    // Cancel keeps the child.
    await page.getByTestId('remove-confirm-cancel').click()
    await expect(page.getByTestId('remove-confirm')).toHaveCount(0)

    // Confirm removes and lands on the dashboard without the child.
    await page.getByTestId('remove-child-button').click()
    await page.getByTestId('remove-confirm-yes').click()
    await page.waitForURL(/\/parent\/dashboard$/, { timeout: 15000 })
    await expect(page.getByText(KID_NAME)).toHaveCount(0)
  })
})
