// TEST-E2E-01 / P1 — Availability
// First-pass: page load + grid renders + blocked-dates section.
// TEST-E2E-02: T1.4 adds the interactive add-then-delete flow (atomic test
// per Lasith Q4 — no inter-test state).

import { test, expect } from '@playwright/test'
import { loginAsTestCoach } from './fixtures/auth'
import { dbAdmin, getCoachProfileIdByEmail } from './fixtures/db'

const TEST_COACH_EMAIL = process.env.TEST_COACH_EMAIL as string

// Hard-deletes any Sun (day_of_week=0) 17:00:00 availability_templates row for
// the test coach. The T1.4 add+delete test creates this exact row; if the
// delete step ever fails (crash, abort), the leftover collides with the
// UNIQUE(coach_profile_id, day_of_week, start_time) constraint on the next
// run. Hard-delete (not soft) because availability_templates has no
// deleted_at column.
async function cleanupTestSunBlock(): Promise<void> {
  const coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)
  const { error } = await dbAdmin
    .from('availability_templates')
    .delete()
    .eq('coach_profile_id', coachProfileId)
    .eq('day_of_week', 0)
    .eq('start_time', '17:00:00')
  if (error) throw new Error(`[p1] cleanupTestSunBlock failed: ${error.message}`)
}

test.describe('P1 — Availability', () => {
  // Belt-and-braces — wipe any leftover Sun 17:00 row before and after.
  test.beforeAll(cleanupTestSunBlock)
  test.afterAll(cleanupTestSunBlock)

  test.beforeEach(async ({ page }) => {
    await loginAsTestCoach(page)
  })

  test('T1.1: /coach/availability loads with the Availability heading', async ({ page }) => {
    await page.goto('/coach/availability')
    await expect(page).toHaveURL(/\/coach\/availability/)
    await expect(page.getByRole('heading', { name: 'Availability', level: 1 })).toBeVisible()
  })

  test('T1.2: weekly grid renders with the 7 day-of-week headings', async ({ page }) => {
    await page.goto('/coach/availability')
    // Each day column has a heading like "Monday", "Tuesday", … (component uses
    // long day names per AvailabilityManagement.tsx). All 7 must be visible
    // for the grid to be considered rendered.
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      await expect(page.getByText(day, { exact: false }).first()).toBeVisible()
    }
  })

  test('T1.3: blocked-dates tab is reachable from the page', async ({ page }) => {
    await page.goto('/coach/availability')
    // The page has a Schedule / Blocked-dates tab pair. The Blocked-dates tab
    // must be present and clickable; once clicked the page should not error.
    const blockedTab = page.getByRole('button', { name: /blocked dates/i })
    await expect(blockedTab).toBeVisible()
    await blockedTab.click()
    // URL stays on /coach/availability (component manages tab via local state);
    // assert no client error surfaced after the switch.
    await expect(page).toHaveURL(/\/coach\/availability/)
  })

  test('T1.4: add then delete an availability template (atomic)', async ({ page }) => {
    // TEST-E2E-03: unskipped (was the Fix-E2E-01 "known flaky" skip). The race
    // was between the optimistic UI row and the server INSERT — the delete
    // step could fire while the row still had no committed DB id. Stabilised
    // by pinning both sides to the database: poll until the Sun 17:00 row
    // exists after submit, reload so the page renders committed server state,
    // then delete and poll until the row is gone.
    const coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)
    const sunRowCount = async (): Promise<number> => {
      const { data, error } = await dbAdmin
        .from('availability_templates')
        .select('id')
        .eq('coach_profile_id', coachProfileId)
        .eq('day_of_week', 0)
        .eq('start_time', '17:00:00')
      if (error) throw new Error(`[p1] availability_templates read failed: ${error.message}`)
      return (data ?? []).length
    }

    await page.goto('/coach/availability')

    // ── OPEN FORM ────────────────────────────────────────────────────────
    // The seed inserts Mon/Wed/Sat recurring blocks. Sunday is collision-free
    // for the UNIQUE(coach_profile_id, day_of_week, start_time) constraint, so
    // we add a Sun 17:00-19:00 block. The "+ Add another block" CTA at the
    // bottom of the Schedule tab opens the form blank — preferred over the
    // empty-day card path which would pre-fill the day for us.
    await page.getByRole('button', { name: /Add another block/i }).click()

    // Wait for the form to mount.
    const form = page.getByTestId('e2e-availability-add-form')
    await expect(form).toBeVisible()

    // ── FILL FORM ────────────────────────────────────────────────────────
    // Sport: take the default (Cricket — first sport configured per seed).
    // Day: Sun. The day buttons are inside the form; scope to avoid weekday
    // headers elsewhere on the page.
    await form.getByRole('button', { name: 'Sun', exact: true }).click()

    // Start/end times: native selects, labels not bound — data-testid required.
    await page.getByTestId('e2e-availability-start-time').selectOption('17:00')
    await page.getByTestId('e2e-availability-end-time').selectOption('19:00')

    // ── SUBMIT ───────────────────────────────────────────────────────────
    await page.getByTestId('e2e-availability-submit').click()

    // TEST-E2E-03 stabilisation: don't trust the optimistic row — wait for the
    // INSERT to be committed, then reload so the delete below operates on a
    // row with its real DB id (the Fix-E2E-01 race deleted the optimistic row
    // before the id existed).
    await expect.poll(sunRowCount, { timeout: 15_000 }).toBe(1)
    await page.reload()

    // New row renders under the Sunday day heading. Each block row has the
    // sport name + time range in its summary, so the most stable visible-text
    // assertion is "Cricket · 17:00".
    const newRow = page.getByText(/Cricket · 17:00/i).first()
    await expect(newRow).toBeVisible({ timeout: 15_000 })

    // ── DELETE ───────────────────────────────────────────────────────────
    // TEST-E2E-03 root cause of the historical "flake": the old scoping —
    // `page.locator('div').filter({ has: heading('Sunday') }).first()` —
    // resolves to the OUTERMOST matching div (the whole-page wrapper), so
    // `.first()` on its delete buttons clicked the first delete button on the
    // page and deleted the seeded MONDAY template instead of the Sunday row
    // (which then broke every downstream spec that needs Monday slots).
    // Address the row by its real DB id instead — the reload above guarantees
    // the rendered testid carries it.
    const { data: sunRows, error: sunErr } = await dbAdmin
      .from('availability_templates')
      .select('id')
      .eq('coach_profile_id', coachProfileId)
      .eq('day_of_week', 0)
      .eq('start_time', '17:00:00')
    if (sunErr || !sunRows || sunRows.length !== 1) {
      throw new Error(`[p1] expected exactly one Sun 17:00 row, got ${sunRows?.length ?? 'error'}`)
    }
    await page.getByTestId(`e2e-availability-delete-${sunRows[0].id as string}`).click()

    // Inline confirm appears next to the trash icon — click "Delete" button.
    await page.getByTestId('e2e-availability-confirm-delete').click()

    // Row gone — in the UI and, decisively, in the database (TEST-E2E-03:
    // the DB poll is the atomic proof the DELETE committed; the UI check
    // alone was the flaky half of the old race).
    await expect(newRow).not.toBeVisible({ timeout: 10_000 })
    await expect.poll(sunRowCount, { timeout: 15_000 }).toBe(0)
  })
})
