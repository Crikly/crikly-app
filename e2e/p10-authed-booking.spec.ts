// P-10 single-flow: the public availability page is auth-aware.
//   - Logged out (and any non-parent account): the guest "Who is this for?"
//     free-text inputs render — byte-identical pre-P-10 behaviour.
//   - Signed in as a PARENT: the AuthedPlayerPicker (ChildSelector + group
//     pool) replaces the free-text inputs; the CTA stays disabled until a
//     primary player is chosen.
//
// The parent test user is provisioned by e2e/fixtures/seed.ts step 7
// (user_profiles + user_roles only) — the parent_profiles row the authed
// mode keys on is owned HERE (BUG-QA-04 "own the state you need" pattern,
// same as P8 owning is_profile_live).

import { test, expect, type Page } from '@playwright/test'
import { dbAdmin, getCoachProfileIdByEmail } from './fixtures/db'

/** Local-timezone YYYY-MM-DD (mirrors src/lib/availability/slots.ts). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** The next Monday at least 3 days out — clears min-advance, inside
 *  max-advance (P8 pattern; the seeded coach has a Monday 09:00–11:00
 *  recurring template). */
function nextBookableMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return d
}

/** Opens the availability page and selects the target date + the 09:00 slot
 *  (P-10 fix 1: player selection only appears after a slot is tapped). */
async function selectMondaySlot(page: Page): Promise<void> {
  const target = nextBookableMonday()
  const now = new Date()
  const monthsAhead =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  for (let i = 0; i < monthsAhead; i++) {
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  await page.getByTestId(`cal-day-${localISODate(target)}`).click()
  await page.getByTestId('slot-09:00').click()
}

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`[p10] missing required env var ${key}`)
  return value
}

const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')
const PARENT_EMAIL = process.env.TEST_PARENT_EMAIL
const PARENT_PASSWORD = process.env.TEST_PARENT_PASSWORD

/** auth.users.id for an email via the Admin API (mirrors fixtures/db.ts). */
async function getAuthUserIdByEmail(email: string): Promise<string> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await dbAdmin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`[p10] listUsers failed: ${error.message}`)
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) return match.id
    if (data.users.length < 100) break
  }
  throw new Error(`[p10] no auth.users row for ${email}`)
}

test.describe('P10 — auth-aware availability page', () => {
  let coachProfileId: string

  test.beforeAll(async () => {
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    // The public availability page 404s for a non-live coach; P5 deliberately
    // leaves is_profile_live=false. Own the state we need (P8 pattern).
    const { error: liveErr } = await dbAdmin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coachProfileId)
    if (liveErr) throw new Error(`[p10] is_profile_live setup failed: ${liveErr.message}`)

    // P-10 Phase 3: the seed provisions session_types ['individual'] only —
    // own group pricing here so the guest chips render (T10.3). Restored in
    // afterAll; the seed also resets it on every run.
    const { error: tiersErr } = await dbAdmin
      .from('coach_sports')
      .update({
        session_types: ['individual', 'group'],
        group_price_tiers: { '2': 9000, '3': 12000 },
        updated_at: new Date().toISOString(),
      })
      .eq('coach_profile_id', coachProfileId)
    if (tiersErr) throw new Error(`[p10] group tiers setup failed: ${tiersErr.message}`)

    // Authed mode keys on a parent_profiles row (loadChildSelectorOptions
    // returns null without one). Seed step 7 doesn't create it — own it here,
    // idempotently.
    if (PARENT_EMAIL && PARENT_PASSWORD) {
      const parentAuthId = await getAuthUserIdByEmail(PARENT_EMAIL)
      const { data: upRow, error: upErr } = await dbAdmin
        .from('user_profiles')
        .select('id')
        .eq('auth_user_id', parentAuthId)
        .single()
      if (upErr || !upRow) {
        throw new Error(`[p10] parent user_profiles missing: ${upErr?.message ?? 'no row'}`)
      }
      const { data: existing, error: ppReadErr } = await dbAdmin
        .from('parent_profiles')
        .select('id')
        .eq('user_profile_id', upRow.id as string)
        .is('deleted_at', null)
        .maybeSingle()
      if (ppReadErr) throw new Error(`[p10] parent_profiles read failed: ${ppReadErr.message}`)
      if (!existing) {
        const { error: ppErr } = await dbAdmin
          .from('parent_profiles')
          .insert({ user_profile_id: upRow.id as string })
        if (ppErr) throw new Error(`[p10] parent_profiles insert failed: ${ppErr.message}`)
      }
    }
  })

  test.afterAll(async () => {
    // Restore the seed baseline so later suites see the pre-P10 sport shape.
    await dbAdmin
      .from('coach_sports')
      .update({
        session_types: ['individual'],
        group_price_tiers: null,
        updated_at: new Date().toISOString(),
      })
      .eq('coach_profile_id', coachProfileId)
  })

  test('T10.1: logged out — player inputs appear only after a slot is tapped (fix 1)', async ({
    page,
  }) => {
    await page.goto(`/coaches/${coachProfileId}/availability`)
    await expect(page.getByTestId('availability-calendar')).toBeVisible()

    // P-10 fix 1: nothing player-related before a slot is tapped.
    await expect(page.locator('#participant-name')).toHaveCount(0)
    await expect(page.getByTestId('guest-player-count-2')).toHaveCount(0)
    await expect(page.getByTestId('authed-player-picker')).toHaveCount(0)

    await selectMondaySlot(page)
    await expect(page.locator('#participant-name')).toBeVisible()
    await expect(page.getByTestId('authed-player-picker')).toHaveCount(0)
  })

  test('T10.3: logged out + group tiers — chips render after slot tap, rows are compact', async ({
    page,
  }) => {
    await page.goto(`/coaches/${coachProfileId}/availability`)
    await expect(page.getByTestId('availability-calendar')).toBeVisible()
    await selectMondaySlot(page)

    // Chips render for guests once a slot is held; Player 1 inputs are the
    // unchanged guest fields.
    await expect(page.getByTestId('guest-player-count-2')).toBeVisible()
    await expect(page.locator('#participant-name')).toBeVisible()
    await expect(page.getByTestId('guest-extra-row-2')).toHaveCount(0)

    // Selecting 3 players appends two compact rows; back to 1 removes them.
    await page.getByTestId('guest-player-count-3').click()
    await expect(page.getByTestId('guest-extra-row-2')).toBeVisible()
    await expect(page.getByTestId('guest-extra-row-3')).toBeVisible()
    await expect(page.getByTestId('guest-extra-name-2')).toBeVisible()
    await page.getByTestId('guest-player-count-1').click()
    await expect(page.getByTestId('guest-extra-row-2')).toHaveCount(0)
  })

  test('T10.2: signed-in parent — AuthedPlayerPicker replaces the guest inputs', async ({
    page,
  }) => {
    test.skip(
      !PARENT_EMAIL || !PARENT_PASSWORD,
      'TEST_PARENT_EMAIL / TEST_PARENT_PASSWORD not set — seed.ts skips parent provisioning without them (see .env.example).',
    )

    await page.goto('/login')
    await page.getByLabel('Email address').fill(PARENT_EMAIL as string)
    await page.getByLabel('Password', { exact: true }).fill(PARENT_PASSWORD as string)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await page.waitForURL(/\/(dashboard|onboarding|parent)/, { timeout: 15000 })

    await page.goto(`/coaches/${coachProfileId}/availability`)
    await expect(page.getByTestId('availability-calendar')).toBeVisible()

    // P-10 fix 1: no picker (and no guest inputs) before a slot is tapped.
    await expect(page.getByTestId('authed-player-picker')).toHaveCount(0)
    await expect(page.locator('#participant-name')).toHaveCount(0)

    await selectMondaySlot(page)
    await expect(page.getByTestId('authed-player-picker')).toBeVisible()
    await expect(page.locator('#participant-name')).toHaveCount(0)
    // ChildSelector renders (the seeded parent has no children — the picker
    // shows its "Add a child" tile) and the CTA is disabled until every
    // player slot is filled (fix 4).
    await expect(page.getByTestId('child-selector')).toBeVisible()
    await expect(page.getByTestId('book-cta')).toBeDisabled()
  })
})
