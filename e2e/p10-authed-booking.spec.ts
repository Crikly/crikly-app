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

import { test, expect } from '@playwright/test'
import { dbAdmin, getCoachProfileIdByEmail } from './fixtures/db'

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

  test('T10.1: logged out — guest name/age inputs render, no authed picker', async ({
    page,
  }) => {
    await page.goto(`/coaches/${coachProfileId}/availability`)
    await expect(page.getByTestId('availability-calendar')).toBeVisible()
    await expect(page.locator('#participant-name')).toBeVisible()
    await expect(page.getByTestId('authed-player-picker')).toHaveCount(0)
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
    await expect(page.getByTestId('authed-player-picker')).toBeVisible()
    await expect(page.locator('#participant-name')).toHaveCount(0)
    // ChildSelector renders (the seeded parent has no children — the picker
    // shows its "Add a child" tile) and the CTA is disabled with no primary.
    await expect(page.getByTestId('child-selector')).toBeVisible()
    await expect(page.getByTestId('book-cta')).toBeDisabled()
  })
})
