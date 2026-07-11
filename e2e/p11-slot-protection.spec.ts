// TEST-E2E-03 / P11 — BUG-19 P2: camp blocks suppress colliding 1-on-1 slots.
//
// Pins the P2.6 regression fix: EVERY time block of a camp session — not just
// the first — feeds the public calendar's busy intervals, so a camp's
// afternoon block kills the 1-on-1 slots it overlaps
// (AvailabilityClient programmeIntervalsFor → bookableSlots drop at
// src/lib/availability/slots.ts:215).
//
// Fixture (P8/P1 patterns): a Tuesday 13:00–17:00 1-on-1 template (the seed
// has no Tuesday rows, so this is additive and hard-deleted in afterAll —
// availability_templates has no deleted_at) plus a camp whose Tuesday session
// has blocks 09:00–12:00 and 13:00–15:00. The afternoon block must suppress
// the 13:00/14:00 slots while 15:00/16:00 survive — the survivors prove the
// day rendered and the suppression is surgical, not an empty page.

import { test, expect, type Page } from '@playwright/test'
import {
  dbAdmin,
  getCoachProfileIdByEmail,
  createTestProgramme,
  softDeleteProgramme,
  deleteProgrammeByTitle,
} from './fixtures/db'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[P11] missing required env: ${key} (loaded from .env.local by playwright.config.ts)`)
  return v
}
const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')

const TITLE = 'E2E Camp BUG-19P2'

/** Local-timezone YYYY-MM-DD (mirrors src/lib/availability/slots.ts). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** Next Tuesday ≥3 days out — clears min-advance, inside max-advance (P8). */
function nextBookableTuesday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3)
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
  return d
}

/** Opens the public availability page and selects the target date (P8 helper). */
async function openCalendarOn(page: Page, coachId: string, target: Date): Promise<void> {
  await page.goto(`/coaches/${coachId}/availability`)
  await expect(page.getByTestId('availability-calendar')).toBeVisible()
  const now = new Date()
  const monthsAhead =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  for (let i = 0; i < monthsAhead; i++) {
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  await page.getByTestId(`cal-day-${localISODate(target)}`).click()
}

/** Hard-deletes the P11 Tuesday template (no deleted_at column — P1 pattern). */
async function cleanupTuesdayTemplate(coachProfileId: string): Promise<void> {
  const { error } = await dbAdmin
    .from('availability_templates')
    .delete()
    .eq('coach_profile_id', coachProfileId)
    .eq('day_of_week', 2)
    .eq('start_time', '13:00:00')
  if (error) throw new Error(`[P11] template cleanup failed: ${error.message}`)
}

test.describe('P11 — BUG-19 P2: camp afternoon block suppresses 1-on-1 slots', () => {
  let coachProfileId: string
  let programmeId: string
  const tuesday = nextBookableTuesday()

  test.beforeAll(async () => {
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    // Public pages 404 for a non-live coach (P8 pattern — own the state).
    const { error: liveErr } = await dbAdmin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coachProfileId)
    if (liveErr) throw new Error(`[P11] is_profile_live setup failed: ${liveErr.message}`)

    const { data: sportRow, error: sportErr } = await dbAdmin
      .from('coach_sports')
      .select('sport_id')
      .eq('coach_profile_id', coachProfileId)
      .limit(1)
      .single()
    if (sportErr || !sportRow) throw new Error(`[P11] coach_sports read failed: ${sportErr?.message}`)

    // Idempotent pre-clean (crashed prior runs), then fixture state.
    await cleanupTuesdayTemplate(coachProfileId)
    await deleteProgrammeByTitle(TEST_COACH_EMAIL, TITLE)

    // Afternoon 1-on-1 availability: Tue 13:00–17:00 → 60-min slots at
    // 13:00 / 14:00 / 15:00 / 16:00 (same expansion the seeded 09:00–11:00
    // templates get).
    const { error: tplErr } = await dbAdmin.from('availability_templates').insert({
      coach_profile_id: coachProfileId,
      sport_id: null,
      day_of_week: 2,
      start_time: '13:00',
      end_time: '17:00',
      is_active: true,
      is_recurring: true,
      specific_date: null,
      updated_at: new Date().toISOString(),
    })
    if (tplErr) throw new Error(`[P11] template insert failed: ${tplErr.message}`)

    // The camp: morning block + a 13:00–15:00 afternoon block on the target
    // Tuesday. Only the afternoon block collides with the 1-on-1 template.
    const created = await createTestProgramme({
      coachProfileId,
      sportId: sportRow.sport_id as string,
      title: TITLE,
      campMode: true,
      maxSpots: 8,
      pricePerSessionPence: 4000,
      sessions: [
        {
          dateISO: localISODate(tuesday),
          startTime: '09:00',
          endTime: '15:00',
          slots: [
            { startTime: '09:00', endTime: '12:00' },
            { startTime: '13:00', endTime: '15:00' },
          ],
        },
      ],
    })
    programmeId = created.programmeId
  })

  test.afterAll(async () => {
    await cleanupTuesdayTemplate(coachProfileId)
    if (programmeId) await softDeleteProgramme(programmeId)
  })

  test('T11.1: the camp afternoon block hides its 1-on-1 slots; adjacent slots survive', async ({ page }) => {
    await openCalendarOn(page, coachProfileId, tuesday)

    // Survivors first — they prove the day rendered slots at all, so the
    // absences below are suppression, not an empty/broken day.
    await expect(page.getByTestId('slot-15:00')).toBeVisible()
    await expect(page.getByTestId('slot-16:00')).toBeVisible()

    // BUG-19 P2: the 13:00–15:00 camp block must kill exactly these two.
    await expect(page.getByTestId('slot-13:00')).toHaveCount(0)
    await expect(page.getByTestId('slot-14:00')).toHaveCount(0)
  })
})
