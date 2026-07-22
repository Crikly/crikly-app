// BUG-19 Phase 1 / P8 — BUG-14: booked slots must not render as bookable.
//
// Proves the read-side success criteria end-to-end against the real stack:
//   1. A confirmed booking's slot disappears from the public availability
//      calendar (and an adjacent unbooked slot in the same block survives).
//   2. Cancelling the booking frees the slot on the next page load — the
//      migration-034 slot-holding predicate (pending_payment/confirmed/
//      completed hold; cancelled/no-show/soft-deleted free) drives both sides.
//
// Atomic (T1.4 pattern): the booking row is created directly via the service
// role, mutated mid-test, and soft-deleted in afterAll so re-runs start clean.
// Target slot: the seeded coach's Monday 09:00–11:00 recurring template
// (e2e/fixtures/seed.ts) → 60-min slots at 09:00 and 10:00. The chosen Monday
// is ≥3 days out (clears min_advance_hours=24) and ≤10 days out (inside
// max_advance_days=56).

import { test, expect, type Page } from '@playwright/test'
import { dbAdmin, getCoachProfileIdByEmail } from './fixtures/db'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[P8] missing required env: ${key} (loaded from .env.local by playwright.config.ts)`)
  return v
}
const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')

const REF_PREFIX = 'E2E-BUG14-'

/** Local-timezone YYYY-MM-DD (mirrors src/lib/availability/slots.ts). */
function localISODate(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

/** The next Monday at least 3 days from now — clears the 24h min-advance
 *  window with margin and stays far inside the 56-day max-advance horizon. */
function nextBookableMonday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  return d
}

/** Opens the coach's public availability page and selects the target date,
 *  paging the calendar forward if the date falls in a later month. */
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

test.describe('P8 — BUG-14: booked slot suppression on the public calendar', () => {
  let coachProfileId: string
  let bookedByUserId: string
  let sportId: string
  let bookingId: string
  const monday = nextBookableMonday()
  const mondayISO = localISODate(monday)
  const bookingReference = `${REF_PREFIX}${Date.now()}`

  test.beforeAll(async () => {
    coachProfileId = await getCoachProfileIdByEmail(TEST_COACH_EMAIL)

    // The public availability page 404s for a non-live coach, and P5 (which
    // runs earlier in the suite) deliberately leaves is_profile_live=false.
    // Own the state we need, exactly as P5 does for itself (BUG-QA-04 pattern);
    // true is also the seed baseline, so nothing downstream is disturbed and
    // P5 defensively resets in its own beforeAll.
    const { error: liveErr } = await dbAdmin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coachProfileId)
    if (liveErr) throw new Error(`[P8] is_profile_live setup failed: ${liveErr.message}`)

    // The seeded coach's own user_profile doubles as the booker (FK-valid; the
    // public calendar never surfaces booker identity).
    const { data: coachRow, error: coachErr } = await dbAdmin
      .from('coach_profiles')
      .select('user_profile_id')
      .eq('id', coachProfileId)
      .single()
    if (coachErr || !coachRow) throw new Error(`[P8] coach_profiles read failed: ${coachErr?.message}`)
    bookedByUserId = coachRow.user_profile_id as string

    const { data: sportRow, error: sportErr } = await dbAdmin
      .from('coach_sports')
      .select('sport_id')
      .eq('coach_profile_id', coachProfileId)
      .limit(1)
      .single()
    if (sportErr || !sportRow) throw new Error(`[P8] coach_sports read failed: ${sportErr?.message}`)
    sportId = sportRow.sport_id as string

    // Idempotency: soft-delete any leftover P8 bookings from a crashed run so
    // the 09:00 slot starts free (deleted_at frees the slot per migration 034).
    await dbAdmin
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('coach_profile_id', coachProfileId)
      .like('booking_reference', `${REF_PREFIX}%`)
      .is('deleted_at', null)

    // The booking under test: confirmed, Monday 09:00–10:00.
    const { data: inserted, error: insertErr } = await dbAdmin
      .from('bookings')
      .insert({
        booking_reference: bookingReference,
        coach_profile_id: coachProfileId,
        sport_id: sportId,
        booked_by_user_id: bookedByUserId,
        session_type: 'individual',
        session_date: mondayISO,
        session_start_time: '09:00:00',
        session_end_time: '10:00:00',
        coach_price_pence: 6000,
        commission_rate: 0.1,
        commission_pence: 600,
        parent_total_pence: 6600,
        currency: 'GBP',
        status: 'confirmed',
        messaging_unlocked: false,
        cancellation_window_hours: 24,
        participant_name: 'P8 Test Participant',
      })
      .select('id')
      .single()
    if (insertErr || !inserted) throw new Error(`[P8] booking insert failed: ${insertErr?.message}`)
    bookingId = inserted.id as string
  })

  test.afterAll(async () => {
    // Soft delete only — never hard DELETE (CLAUDE.md). Frees the slot for
    // re-runs regardless of which test step the run died in.
    if (bookingId) {
      await dbAdmin
        .from('bookings')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', bookingId)
    }
  })

  test('T8.1: a confirmed booking hides its slot; the adjacent slot survives', async ({ page }) => {
    await openCalendarOn(page, coachProfileId, monday)

    // The unbooked 10:00 slot proves the day itself rendered slots — so the
    // 09:00 absence below is suppression, not an empty/broken day.
    await expect(page.getByTestId('slot-10:00')).toBeVisible()
    await expect(page.getByTestId('slot-09:00')).toHaveCount(0)
  })

  test('T8.2: cancelling the booking frees the slot on the next load', async ({ page }) => {
    const { error } = await dbAdmin
      .from('bookings')
      .update({ status: 'cancelled_parent', cancelled_by: 'parent' })
      .eq('id', bookingId)
    if (error) throw new Error(`[P8] cancel update failed: ${error.message}`)

    await openCalendarOn(page, coachProfileId, monday)

    await expect(page.getByTestId('slot-09:00')).toBeVisible()
    await expect(page.getByTestId('slot-10:00')).toBeVisible()
  })
})
