// Integration tests for POST /api/parent/bookings/[id]/cancel (P-14 Phase 2).
//
// Scope: the platform's first programmatic Stripe refund. Covered here:
// auth gating, ownership-as-404, the status state machine, the BUG-27
// "0 = no cancellations" policy, BUG-66-safe window maths (refund iff
// cancelling earlier than window_hours before the London start instant),
// full-refund semantics (no amount param — BR-04), the refunds audit row,
// Stripe idempotency key, and the approved failure ordering (refund fails →
// booking untouched; refund first, booking update second).

jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/stripe/client', () => ({ getStripe: jest.fn() }))
jest.mock('@/lib/auth/require-parent', () => ({ requireParentContext: jest.fn() }))

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { requireParentContext } from '@/lib/auth/require-parent'
import { POST } from '@/app/api/parent/bookings/[id]/cancel/route'

type MockFn = jest.Mock

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BOOKING_ID = '55555555-5555-4555-8555-555555555555'
const USER_PROFILE_ID = 'user-profile-uuid-001'

const PARENT_CONTEXT = {
  context: {
    user: { id: 'auth-user-1', email: 'parent@example.com' },
    userProfile: { id: USER_PROFILE_ID },
    parentProfile: { id: 'parent-profile-uuid-001' },
  },
  error: null,
}

/** London calendar date + HH:MM for an epoch — mirrors how the route's
 *  londonSessionToMs will re-derive (approximately) the same instant. */
function londonParts(ms: number): { date: string; time: string } {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms))
  return { date, time }
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  // Default: session ~72h out with a 24h window → refund-eligible.
  const { date, time } = londonParts(Date.now() + 72 * 3_600_000)
  return {
    id: BOOKING_ID,
    booked_by_user_id: USER_PROFILE_ID,
    status: 'confirmed',
    session_date: date,
    session_start_time: time,
    cancellation_window_hours: 24,
    parent_total_pence: 5500,
    currency: 'GBP',
    ...overrides,
  }
}

const PI_ROW = {
  id: 'pi-row-uuid-001',
  stripe_payment_intent_id: 'pi_stripe_001',
  amount_pence: 5500,
  currency: 'GBP',
}

// ─── Supabase admin mock — dispatch by table + call order ────────────────────

interface AdminWiring {
  booking?: unknown
  bookingError?: unknown
  pi?: unknown
  piError?: unknown
  refundInsertError?: unknown
  bookingUpdateError?: unknown
  /** Simulate the optimistic-concurrency race: update matches zero rows. */
  bookingUpdateNoRow?: boolean
  piUpdateError?: unknown
}

function wireAdmin(w: AdminWiring = {}) {
  // bookings select chain: .select().eq().is().maybeSingle()
  const bookingSelect: Record<string, MockFn> = {}
  for (const m of ['select', 'eq', 'is']) bookingSelect[m] = jest.fn(() => bookingSelect)
  bookingSelect.maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: w.booking ?? null, error: w.bookingError ?? null })

  // bookings update chain: .update().eq().eq().select().maybeSingle()
  const bookingUpdate: Record<string, MockFn> = {}
  for (const m of ['update', 'eq', 'select']) bookingUpdate[m] = jest.fn(() => bookingUpdate)
  bookingUpdate.maybeSingle = jest.fn().mockResolvedValue({
    data: w.bookingUpdateNoRow ? null : { id: BOOKING_ID },
    error: w.bookingUpdateError ?? null,
  })

  // payment_intents select chain: .select().eq().eq().maybeSingle()
  const piSelect: Record<string, MockFn> = {}
  for (const m of ['select', 'eq']) piSelect[m] = jest.fn(() => piSelect)
  piSelect.maybeSingle = jest
    .fn()
    .mockResolvedValue({ data: w.pi ?? null, error: w.piError ?? null })

  // payment_intents update chain: .update().eq() → thenable {error}
  const piUpdate: Record<string, MockFn> & { then?: unknown } = {}
  for (const m of ['update', 'eq']) piUpdate[m] = jest.fn(() => piUpdate)
  piUpdate.then = (resolve: (v: unknown) => unknown) =>
    resolve({ error: w.piUpdateError ?? null })

  const refundsInsert = jest.fn().mockResolvedValue({ error: w.refundInsertError ?? null })

  let bookingCalls = 0
  let piCalls = 0
  const from = jest.fn((table: string) => {
    if (table === 'bookings') {
      bookingCalls += 1
      return bookingCalls === 1 ? bookingSelect : bookingUpdate
    }
    if (table === 'payment_intents') {
      piCalls += 1
      return piCalls === 1 ? piSelect : piUpdate
    }
    if (table === 'refunds') return { insert: refundsInsert }
    throw new Error(`unexpected table ${table}`)
  })

  ;(createAdminClient as MockFn).mockReturnValue({ from })
  return { from, bookingSelect, bookingUpdate, piSelect, piUpdate, refundsInsert }
}

function makeStripeMock(refund: Record<string, unknown> | Error = {}) {
  const create =
    refund instanceof Error
      ? jest.fn().mockRejectedValue(refund)
      : jest.fn().mockResolvedValue({
          id: 're_test_001',
          amount: 5500,
          currency: 'gbp',
          status: 'succeeded',
          ...refund,
        })
  ;(getStripe as MockFn).mockReturnValue({ refunds: { create } })
  return { create }
}

function callCancel(id: string, body: unknown = {}) {
  const req = new Request(`http://localhost/api/parent/bookings/${id}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(req as never, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireParentContext as MockFn).mockResolvedValue(PARENT_CONTEXT)
  ;(createClient as MockFn).mockResolvedValue({})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  ;(console.error as unknown as MockFn).mockRestore()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/parent/bookings/[id]/cancel — gating', () => {
  it('404s a non-UUID id without touching the DB', async () => {
    const { from } = wireAdmin()
    const res = await callCancel('not-a-uuid')
    expect(res.status).toBe(404)
    expect(from).not.toHaveBeenCalled()
  })

  it('propagates the auth gate error', async () => {
    ;(requireParentContext as MockFn).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'unauthorised' }, { status: 401 }),
    })
    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(401)
  })

  it("404s another user's booking (no ownership oracle)", async () => {
    wireAdmin({ booking: bookingRow({ booked_by_user_id: 'someone-else' }) })
    makeStripeMock()
    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(404)
  })

  it('409s an already-cancelled booking', async () => {
    wireAdmin({ booking: bookingRow({ status: 'cancelled_parent' }) })
    makeStripeMock()
    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('already_cancelled')
  })

  it('403s when the coach allows no cancellations (window 0 — BUG-27)', async () => {
    wireAdmin({ booking: bookingRow({ cancellation_window_hours: 0 }) })
    makeStripeMock()
    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('cancellations_not_allowed')
  })

  it('409s once the session has started', async () => {
    const { date, time } = londonParts(Date.now() - 3_600_000)
    wireAdmin({ booking: bookingRow({ session_date: date, session_start_time: time }) })
    makeStripeMock()
    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('session_started')
  })

  it('400s an unknown reason key', async () => {
    wireAdmin({ booking: bookingRow() })
    makeStripeMock()
    const res = await callCancel(BOOKING_ID, { reason: 'because' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/parent/bookings/[id]/cancel — refund path (before window)', () => {
  it('refunds in full, writes the audit row, and cancels the booking', async () => {
    const wiring = wireAdmin({ booking: bookingRow(), pi: PI_ROW })
    const stripe = makeStripeMock()

    const res = await callCancel(BOOKING_ID, { reason: 'unwell' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      status: 'cancelled',
      refunded: true,
      refundAmountPence: 5500,
      refundStatus: 'succeeded',
    })

    // Full refund: no amount param (BR-04), pinned by the idempotency key.
    expect(stripe.create).toHaveBeenCalledWith(
      { payment_intent: 'pi_stripe_001' },
      { idempotencyKey: `refund-booking-${BOOKING_ID}` },
    )

    // Audit row (integer pence, constrained reason, parent-initiated).
    expect(wiring.refundsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: BOOKING_ID,
        payment_intent_id: PI_ROW.id,
        stripe_refund_id: 're_test_001',
        amount_pence: 5500,
        currency: 'GBP',
        reason: 'parent_cancelled_before_window',
        status: 'succeeded',
        initiated_by: 'parent',
      }),
    )

    // Booking flip carries the human-readable reason label.
    expect(wiring.bookingUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled_parent',
        cancelled_by: 'parent',
        cancellation_reason: 'Child is unwell',
      }),
    )

    // Intent reflects the refund.
    expect(wiring.piUpdate.update).toHaveBeenCalledWith({ status: 'refunded' })
  })

  it('fails closed (502, booking untouched) when the Stripe refund fails', async () => {
    const wiring = wireAdmin({ booking: bookingRow(), pi: PI_ROW })
    makeStripeMock(new Error('stripe down'))

    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('refund_failed')
    expect(wiring.bookingUpdate.update).not.toHaveBeenCalled()
    expect(wiring.refundsInsert).not.toHaveBeenCalled()
  })

  it('500s (booking untouched) when a confirmed booking has no succeeded intent', async () => {
    const wiring = wireAdmin({ booking: bookingRow(), pi: null })
    const stripe = makeStripeMock()

    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(500)
    expect(stripe.create).not.toHaveBeenCalled()
    expect(wiring.bookingUpdate.update).not.toHaveBeenCalled()
  })

  it('still cancels (refund already real) when the audit insert fails, logging loudly', async () => {
    const wiring = wireAdmin({
      booking: bookingRow(),
      pi: PI_ROW,
      refundInsertError: { message: 'insert failed' },
    })
    makeStripeMock()

    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(200)
    expect((await res.json()).refunded).toBe(true)
    expect(wiring.bookingUpdate.update).toHaveBeenCalled()
    expect(
      (console.error as unknown as MockFn).mock.calls.some((call) =>
        String(call[0]).includes('MANUAL ATTENTION'),
      ),
    ).toBe(true)
  })

  it('maps a pending Stripe refund status onto the audit row and response', async () => {
    const wiring = wireAdmin({ booking: bookingRow(), pi: PI_ROW })
    makeStripeMock({ status: 'pending' })

    const res = await callCancel(BOOKING_ID)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.refundStatus).toBe('pending')
    expect(wiring.refundsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    )
    // processed_at only stamps on succeeded.
    expect(wiring.refundsInsert.mock.calls[0][0]).not.toHaveProperty('processed_at')
    // payment_intents is only marked 'refunded' once Stripe confirms.
    expect(wiring.piUpdate.update).not.toHaveBeenCalled()
  })

  it("fails closed on a refund that RESOLVES with status 'failed' — audit row kept, booking untouched", async () => {
    const wiring = wireAdmin({ booking: bookingRow(), pi: PI_ROW })
    makeStripeMock({ status: 'failed' })

    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('refund_failed')
    // The failed attempt is still recorded for reconciliation…
    expect(wiring.refundsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    )
    // …but nothing else moves: no intent flip, no cancellation.
    expect(wiring.piUpdate.update).not.toHaveBeenCalled()
    expect(wiring.bookingUpdate.update).not.toHaveBeenCalled()
    expect(
      (console.error as unknown as MockFn).mock.calls.some((call) =>
        String(call[0]).includes('MANUAL ATTENTION'),
      ),
    ).toBe(true)
  })

  it('500s with MANUAL ATTENTION when the booking update fails after a successful refund', async () => {
    wireAdmin({
      booking: bookingRow(),
      pi: PI_ROW,
      bookingUpdateError: { message: 'update failed' },
    })
    const stripe = makeStripeMock()

    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(500)
    expect(stripe.create).toHaveBeenCalled()
    expect(
      (console.error as unknown as MockFn).mock.calls.some(
        (call) =>
          String(call[0]).includes('MANUAL ATTENTION') &&
          String(call[0]).includes('refunded but status update failed'),
      ),
    ).toBe(true)
  })

  it('409s the loser of a concurrent double-submit (update matches zero rows)', async () => {
    wireAdmin({ booking: bookingRow(), pi: PI_ROW, bookingUpdateNoRow: true })
    makeStripeMock()

    const res = await callCancel(BOOKING_ID)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('already_cancelled')
  })

  it('logs MANUAL ATTENTION when the payment_intents flip fails after a successful refund', async () => {
    wireAdmin({
      booking: bookingRow(),
      pi: PI_ROW,
      piUpdateError: { message: 'pi update failed' },
    })
    makeStripeMock()

    const res = await callCancel(BOOKING_ID)
    // The refund is real and the cancellation proceeds — the inconsistency is
    // an ops concern, not a parent-facing failure.
    expect(res.status).toBe(200)
    expect(
      (console.error as unknown as MockFn).mock.calls.some(
        (call) =>
          String(call[0]).includes('MANUAL ATTENTION') &&
          String(call[0]).includes('payment_intents status update failed'),
      ),
    ).toBe(true)
  })
})

describe('POST /api/parent/bookings/[id]/cancel — no-refund path (inside window)', () => {
  it('cancels without any Stripe call when inside the final window', async () => {
    // Session ~2h out, 24h window → cancellable, not refund-eligible.
    const { date, time } = londonParts(Date.now() + 2 * 3_600_000)
    const wiring = wireAdmin({
      booking: bookingRow({ session_date: date, session_start_time: time }),
    })
    const stripe = makeStripeMock()

    const res = await callCancel(BOOKING_ID, { reason: 'plans' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      status: 'cancelled',
      refunded: false,
      refundAmountPence: 0,
      refundStatus: null,
    })
    expect(stripe.create).not.toHaveBeenCalled()
    expect(wiring.refundsInsert).not.toHaveBeenCalled()
    expect(wiring.bookingUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled_parent',
        cancellation_reason: 'Change of plans',
      }),
    )
  })

  it('allows a null reason (stored as null)', async () => {
    const { date, time } = londonParts(Date.now() + 2 * 3_600_000)
    const wiring = wireAdmin({
      booking: bookingRow({ session_date: date, session_start_time: time }),
    })
    makeStripeMock()

    const res = await callCancel(BOOKING_ID, {})
    expect(res.status).toBe(200)
    expect(wiring.bookingUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ cancellation_reason: null }),
    )
  })
})
