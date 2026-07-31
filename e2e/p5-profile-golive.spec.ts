// TEST-E2E-01 / P5 — Profile + Go Live
// First-pass: profile edit page loads + Go Live button visible.
// TEST-E2E-02: T5.3 clicked Go live on /coach/profile/edit — permanently
// skipped because the gate contradiction made that path unreachable.
//
// TEST-E2E-03: T5.2/T5.3 REWRITTEN against the real go-live path. The old
// tests targeted the "Go live" button on /coach/profile/edit — dead-by-design:
// CoachLayoutClient redirects draft coaches (is_profile_live=false) away from
// every non-onboarding /coach/* page, and ProfileEdit's button only renders in
// draft state. The product go-live path is the onboarding "Get paid" step
// (GetPaidStep.tsx): "Skip for now" (or the Stripe-return success param) calls
// handleGoLive → is_profile_live=true → /coach/dashboard?celebrated=true with
// the Fix-36 celebration modal. That is what T5.2/T5.3 now pin. This closes
// the Fix-E2E-02 TODO — the gate logic is correct; the old tests were not.
// (The unreachable ProfileEdit button itself is flagged separately as a
// production dead-code observation — not a test concern.)
//
// P-02 session fix: T5.3 rewritten again — C-PAY-03 removed go-live from
// "Skip for now" (draft until Stripe payout destination exists) and PILOT-01
// made go-live a submit-for-review. T5.3 now pins the draft-preserving skip.

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'
import { getCoachIsProfileLive, resetCoachIsProfileLive } from './fixtures/db'

const TEST_COACH_EMAIL = process.env.TEST_COACH_EMAIL as string

test.describe('P5 — Profile + Go Live', () => {
  // BUG-QA-04 defensive: if a prior P5 run left is_profile_live=true (afterAll
  // skipped on crash, etc.), the go-live tests would start from the wrong
  // state. Reset before each run.
  test.beforeAll(async () => {
    await resetCoachIsProfileLive(TEST_COACH_EMAIL)
  })

  // Reset to false after P5 completes so the flag is in a known state for the
  // next run. Specs that need a live coach (P8–P11) set it themselves in their
  // own beforeAll (BUG-QA-04 pattern), so execution order does not matter.
  test.afterAll(async () => {
    await resetCoachIsProfileLive(TEST_COACH_EMAIL)
  })

  test.beforeEach(async ({ page }) => {
    await loginAsTestCoach(page)
  })

  test('T5.1: /coach/profile/edit is gated for a draft coach (no /login bounce)', async ({ page }) => {
    await page.goto('/coach/profile/edit')
    // A draft coach is redirected by the CoachLayoutClient gate to the
    // onboarding flow — never to /login (that would be an auth failure).
    await expect(page).not.toHaveURL(/\/login/)
    await page.waitForURL(/\/coach\//, { timeout: 10_000 })
  })

  test('T5.2: draft coach reaches the Get Paid step with the go-live affordance', async ({ page }) => {
    // The onboarding surfaces are exempt from the draft-coach gate, so this is
    // the reachable go-live path (GetPaidStep — Fix-STRIPE-01 Path B).
    await page.goto('/coach/onboarding/get-paid')
    await expect(page.getByRole('heading', { name: 'Get paid' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Connect with Stripe/i }).first()).toBeVisible()
  })

  test('T5.3: Skip for now stays draft — dashboard, no celebration, is_profile_live=false (UI + DB)', async ({ page }) => {
    // C-PAY-03 Path B: "Skip for now" no longer attempts go-live — a profile
    // cannot be live without a payout destination, and go-live itself is now
    // a submit-for-review (PILOT-01). handleSkip just routes to the dashboard
    // with the coach still in draft.
    await page.goto('/coach/onboarding/get-paid')
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Skip for now' }).click()
    await page.waitForURL(/\/coach\/dashboard/, { timeout: 20_000 })

    // No celebration modal — that congratulates a live profile (Fix-36), and
    // this coach is still draft.
    await expect(page.getByRole('heading', { name: /You're live!/i })).not.toBeVisible()

    // ── DB ASSERT ─────────────────────────────────────────────────────
    const isLive = await getCoachIsProfileLive(TEST_COACH_EMAIL)
    expect(isLive).toBe(false)
  })
})
