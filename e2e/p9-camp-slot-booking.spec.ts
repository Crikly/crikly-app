// TEST-E2E-03 / P9 — BUG-23 camp per-slot booking + UX-21 itemised summary.
//
// Pins the public camp picker (/coaches/[id]/programmes/[programmeId]) rules:
//   1. Each camp time block is one session at the per-session price — morning
//      only = 1×, morning + afternoon = 2× (the pre-BUG-23 bug sold full days
//      at 1×).
//   2. UX-21: the sticky summary itemises "N sessions × £X = £Y.YY" +
//      "Service fee £Z" + total, with the 10% commission ON TOP (BR-01/BR-02).
//   3. A full slot closes only its own row — sibling slots stay selectable
//      (capacity is per (session, slot_index), migration 040).
//
// Fixture (P8 pattern — service-role setup in beforeAll, soft-delete in
// afterAll): a 2-day camp, £40/session, max_spots=2. Day 2's MORNING slot is
// filled to capacity via succeeded enrolments (fillCampSlot), so the picker
// renders exactly 3 selectable rows (day1 Morning, day1 Afternoon, day2
// Afternoon) and 1 closed "Full" row (day2 Morning) — assertions key off that
// deterministic shape rather than fragile day-group scoping.

import { test, expect } from '@playwright/test'
import {
  dbAdmin,
  getCoachProfileIdByEmail,
  createTestProgramme,
  softDeleteProgramme,
  fillCampSlot,
  deleteCampSlotFillers,
  deleteProgrammeByTitle,
} from './fixtures/db'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[P9] missing required env: ${key} (loaded from .env.local by playwright.config.ts)`)
  return v
}
const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')

const TITLE = 'E2E Camp BUG-23'
const PRICE_PENCE = 4000 // £40 — matches the SessionPicker Jest fixtures

/** Local-timezone YYYY-MM-DD (mirrors src/lib/availability/slots.ts). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** Next Thursday ≥3 days out; the camp's day 2 is the Friday after it.
 *  Weekday choice is load-bearing: the fixture programmes write real
 *  coach_time_claims rows guarded by the no_overlapping_active_claims
 *  exclusion constraint, so P9 must stay off P10/P12's Monday and P11's
 *  Tuesday or same-day overlapping camps would 23P01 whichever spec seeds
 *  second (crikly-code-reviewer, TEST-E2E-03). */
function nextBookableThursday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3)
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1)
  return d
}

function plusDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

test.describe('P9 — BUG-23: camp per-slot booking', () => {
  let coachProfileId: string
  let programmeId: string
  let sessionIds: string[] = []
  const thursday = nextBookableThursday()
  const day1 = localISODate(thursday)
  const day2 = localISODate(plusDays(thursday, 1))
  const campSlots = [
    { startTime: '09:00', endTime: '12:00' }, // slot 0 — Morning
    { startTime: '13:00', endTime: '16:00' }, // slot 1 — Afternoon
  ]

  test.beforeAll(async () => {
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    // Public pages 404 for a non-live coach (P8 pattern — own the state).
    const { error: liveErr } = await dbAdmin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coachProfileId)
    if (liveErr) throw new Error(`[P9] is_profile_live setup failed: ${liveErr.message}`)

    const { data: coachRow, error: coachErr } = await dbAdmin
      .from('coach_profiles')
      .select('user_profile_id')
      .eq('id', coachProfileId)
      .single()
    if (coachErr || !coachRow) throw new Error(`[P9] coach_profiles read failed: ${coachErr?.message}`)
    const bookedByUserId = coachRow.user_profile_id as string

    const { data: sportRow, error: sportErr } = await dbAdmin
      .from('coach_sports')
      .select('sport_id')
      .eq('coach_profile_id', coachProfileId)
      .limit(1)
      .single()
    if (sportErr || !sportRow) throw new Error(`[P9] coach_sports read failed: ${sportErr?.message}`)

    // Idempotency: clean filler enrolments from ANY prior P9 programme
    // (afterAll may have been skipped by a crash), then soft-delete the
    // leftover programme itself.
    const { data: oldProgs } = await dbAdmin
      .from('group_programmes')
      .select('id')
      .eq('coach_profile_id', coachProfileId)
      .eq('title', TITLE)
    for (const p of oldProgs ?? []) {
      await deleteCampSlotFillers(p.id as string)
    }
    await deleteProgrammeByTitle(TEST_COACH_EMAIL, TITLE)

    const created = await createTestProgramme({
      coachProfileId,
      sportId: sportRow.sport_id as string,
      title: TITLE,
      campMode: true,
      maxSpots: 2,
      pricePerSessionPence: PRICE_PENCE,
      sessions: [
        { dateISO: day1, startTime: '09:00', endTime: '16:00', slots: campSlots },
        { dateISO: day2, startTime: '09:00', endTime: '16:00', slots: campSlots },
      ],
    })
    programmeId = created.programmeId
    sessionIds = created.sessionIds

    // Fill day 2's MORNING slot (slot_index 0) to max_spots — only that row
    // must close.
    await fillCampSlot({
      programmeId,
      sessionId: sessionIds[1],
      slotIndex: 0,
      count: 2,
      bookedByUserId,
      pricePence: PRICE_PENCE,
    })
  })

  test.afterAll(async () => {
    if (programmeId) {
      // Filler enrolments have no deleted_at column — hard-delete them so
      // re-runs and the shared dev DB don't accumulate orphan rows.
      await deleteCampSlotFillers(programmeId)
      await softDeleteProgramme(programmeId)
    }
  })

  test('T9.1: morning slot only prices at 1× + 10% fee (UX-21 itemised)', async ({ page }) => {
    await page.goto(`/coaches/${coachProfileId}/programmes/${programmeId}`)
    await expect(page.getByTestId('session-picker')).toBeVisible()

    const rows = page.getByTestId('session-row')
    await expect(rows).toHaveCount(3) // day1 Morning+Afternoon, day2 Afternoon

    await rows.nth(0).click() // day 1 Morning
    await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true')

    // UX-21: three itemised lines. £40 unit price renders whole-pound; the
    // computed values render 2-dp (SessionPicker formatPence/formatTotal).
    await expect(page.getByTestId('subtotal-line-desktop')).toHaveText('1 session × £40 = £40.00')
    await expect(page.getByTestId('fee-line-desktop')).toHaveText('Service fee £4.00')
    await expect(page.getByTestId('pay-cta-desktop')).toHaveText('Pay for 1 session — £44.00')
  })

  test('T9.2: both slots of a camp day price at 2× + 10% fee, wire format carries slot indices', async ({ page }) => {
    await page.goto(`/coaches/${coachProfileId}/programmes/${programmeId}`)
    const rows = page.getByTestId('session-row')
    await expect(rows).toHaveCount(3)

    await rows.nth(0).click() // day 1 Morning
    await rows.nth(1).click() // day 1 Afternoon

    await expect(page.getByTestId('subtotal-line-desktop')).toHaveText('2 sessions × £40 = £80.00')
    await expect(page.getByTestId('fee-line-desktop')).toHaveText('Service fee £8.00')
    await expect(page.getByTestId('pay-cta-desktop')).toHaveText('Pay for 2 sessions — £88.00')

    // BUG-23 wire format: two selections of the SAME session — bare uuid for
    // slot 0, uuid.1 for the afternoon block (slot-selection.ts encoding).
    await page.getByTestId('pay-cta-desktop').click()
    await page.waitForURL(/\/book\/.+\/programmes\/.+\?sessions=/, { timeout: 15_000 })
    const url = new URL(page.url())
    const entries = (url.searchParams.get('sessions') ?? '').split(',')
    expect(entries).toHaveLength(2)
    expect(entries).toContain(sessionIds[0])
    expect(entries).toContain(`${sessionIds[0]}.1`)
  })

  test('T9.3: a full slot closes only its own row — the sibling slot stays selectable', async ({ page }) => {
    await page.goto(`/coaches/${coachProfileId}/programmes/${programmeId}`)
    await expect(page.getByTestId('session-picker')).toBeVisible()

    // Exactly one closed row: day 2's Morning, pilled "Full" (not "Closed" —
    // that would mean past/cancelled, a different state).
    const closed = page.getByTestId('session-row-closed')
    await expect(closed).toHaveCount(1)
    await expect(closed).toContainText('Morning')
    await expect(closed).toContainText('Full')

    // Day 2's Afternoon (3rd selectable row) is alive and toggleable.
    const day2Afternoon = page.getByTestId('session-row').nth(2)
    await expect(day2Afternoon).toContainText('Afternoon')
    await day2Afternoon.click()
    await expect(day2Afternoon).toHaveAttribute('aria-pressed', 'true')
  })
})
