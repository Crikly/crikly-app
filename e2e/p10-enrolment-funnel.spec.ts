// TEST-E2E-03 / P10 — BUG-24: the programme enrolment funnel.
//
// Pins the two BUG-24 fixes on the public availability page:
//   1. "Enrol" on a group programme routes to the programme DETAIL page —
//      never the 1-on-1 checkout (the old /book/[coachId]?programme=…
//      destination silently dropped the enrolment).
//   2. The participant name typed on the availability panel travels to the
//      enrolment checkout's "Who is this for?" section via the read-once
//      sessionStorage handoff (participant-handoff.ts — never the URL: a
//      child's name must not land in a shareable link, docs/06).
//
// The handoff is same-tab and read-once, so each test drives one continuous
// page journey. Fixture: a non-camp per-session programme with one session on
// the next bookable Monday — the seeded coach's Monday 1-on-1 template makes
// that calendar day reliably selectable (P8 pattern).

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
  if (!v) throw new Error(`[P10] missing required env: ${key} (loaded from .env.local by playwright.config.ts)`)
  return v
}
const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')

const TITLE = 'E2E Funnel BUG-24'
const PARTICIPANT = 'E2E Funnel Kid'

/** Local-timezone YYYY-MM-DD (mirrors src/lib/availability/slots.ts). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** Next Monday ≥3 days out — clears min-advance, inside the calendar window (P8). */
function nextBookableMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
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

test.describe('P10 — BUG-24: programme enrolment funnel', () => {
  let coachProfileId: string
  let programmeId: string
  const monday = nextBookableMonday()

  /** Availability page → Groups tab → programme card → name → Enrol CTA. */
  async function enrolFromAvailability(page: Page): Promise<void> {
    await openCalendarOn(page, coachProfileId, monday)
    await page.getByRole('button', { name: 'Groups' }).click()
    await page.getByTestId(`programme-${programmeId}`).click()
    await page.locator('#participant-name').fill(PARTICIPANT)
    const cta = page.getByTestId('book-cta')
    await expect(cta).toHaveText('Enrol') // programme selected → CTA relabels
    await cta.click()
  }

  test.beforeAll(async () => {
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    // Public pages 404 for a non-live coach (P8 pattern — own the state).
    const { error: liveErr } = await dbAdmin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coachProfileId)
    if (liveErr) throw new Error(`[P10] is_profile_live setup failed: ${liveErr.message}`)

    const { data: sportRow, error: sportErr } = await dbAdmin
      .from('coach_sports')
      .select('sport_id')
      .eq('coach_profile_id', coachProfileId)
      .limit(1)
      .single()
    if (sportErr || !sportRow) throw new Error(`[P10] coach_sports read failed: ${sportErr?.message}`)

    await deleteProgrammeByTitle(TEST_COACH_EMAIL, TITLE)

    // 12:00–13:00 sits outside the seeded 09:00–11:00 templates, so this
    // programme suppresses no 1-on-1 slots other specs assert on.
    const created = await createTestProgramme({
      coachProfileId,
      sportId: sportRow.sport_id as string,
      title: TITLE,
      campMode: false,
      maxSpots: 8,
      pricePerSessionPence: 4000,
      sessions: [{ dateISO: localISODate(monday), startTime: '12:00', endTime: '13:00' }],
    })
    programmeId = created.programmeId
  })

  test.afterAll(async () => {
    if (programmeId) await softDeleteProgramme(programmeId)
  })

  test('T10.1: Enrol lands on the programme detail page — not the 1-on-1 checkout', async ({ page }) => {
    await enrolFromAvailability(page)

    // BUG-24: destination is the detail page. A /book/… URL here would be the
    // regression (1-on-1 checkout swallowing the enrolment).
    await page.waitForURL(new RegExp(`/coaches/${coachProfileId}/programmes/${programmeId}$`), {
      timeout: 15_000,
    })
    expect(page.url()).not.toContain('/book/')
    await expect(page.getByTestId('programme-hero')).toBeVisible()
    await expect(page.getByTestId('session-picker')).toBeVisible()
  })

  test('T10.2: participant name from the availability panel pre-fills the enrolment checkout', async ({ page }) => {
    await enrolFromAvailability(page)
    await page.waitForURL(new RegExp(`/coaches/${coachProfileId}/programmes/${programmeId}$`), {
      timeout: 15_000,
    })

    // Continue the funnel: pick the session and head to checkout — same tab,
    // so the sessionStorage handoff survives to the GuestEnrolmentFlow mount.
    await page.getByTestId('session-row').first().click()
    await page.getByTestId('pay-cta-desktop').click()
    await page.waitForURL(/\/book\/.+\/programmes\/.+\?sessions=/, { timeout: 15_000 })

    // "Who is this for?" is pre-filled from the panel (BUG-24 fix 2). The
    // field stays editable — prefill, not a lock.
    await expect(page.getByTestId('participant-name-input')).toHaveValue(PARTICIPANT)
  })
})
