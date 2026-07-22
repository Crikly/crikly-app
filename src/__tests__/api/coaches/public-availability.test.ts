// Fix-51 regression: GET /api/coaches/[id]/availability uses .eq('id', id) directly.
// A non-UUID string (slug) cannot match a UUID primary key, so the coach is not found.
// The route must return 404 when called with a slug instead of a UUID.

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

// BUG-19 Phase 1 (BUG-14): the route reads live booked slots via the admin
// client (bookings has no public SELECT policy — Lasith-approved exception).
// BUG-32: blocked_dates is read the same way (coach-only SELECT policy meant
// the anon client silently returned [] and blocked days kept showing slots).
// Admin call order in the route: blocked_dates FIRST, then bookings.
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeChain() {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'upsert', 'insert', 'update', 'filter', 'returns']) {
    c[m] = jest.fn(() => c)
  }
  c.single = jest.fn()
  c.maybeSingle = jest.fn()
  return c
}

// The admin-client reads (blocked_dates: .select().eq() [+ .or()/.lte()];
// bookings: .select().eq().gte().lte().is().not()) are awaited directly, so
// the chain must be thenable.
function makeThenableChain(result: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'not', 'gte', 'lte', 'or', 'order', 'limit']) {
    c[m] = jest.fn(() => c)
  }
  c.then = (resolve: (r: unknown) => void) => resolve(result)
  return c
}

const mockFrom = jest.fn()
const mockSupabase = { from: mockFrom }
const mockAdminFrom = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
  ;(createAdminClient as jest.Mock).mockReturnValue({ from: mockAdminFrom })
  // Default: no blocked dates, no live bookings. Tests override with their own
  // rows via mockImplementationOnce — remember blocked_dates is consumed first.
  mockAdminFrom.mockImplementation(() => makeThenableChain({ data: [], error: null }))
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COACH_UUID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'

function makeRequest(id: string, query = '') {
  const url = `http://localhost/api/coaches/${id}/availability${query}`
  const req = new Request(url) as Request & { nextUrl: URL }
  req.nextUrl = new URL(url)
  return req
}

async function callGet(id: string, query = '') {
  const { GET } = await import('@/app/api/coaches/[id]/availability/route')
  return GET(makeRequest(id, query) as Parameters<typeof GET>[0], { params: Promise.resolve({ id }) })
}

// ─── Fix-51 regression ────────────────────────────────────────────────────────

describe('Fix-51 regression: slug passed to availability API returns 404', () => {
  it('returns 404 when called with a slug instead of UUID', async () => {
    // Route queries .eq('id', id) directly — a slug cannot match a UUID column
    const c = makeChain()
    c.maybeSingle.mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue(c)

    const res = await callGet('john-doe')
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('not found')
  })
})

// ─── Query param validation ───────────────────────────────────────────────────

describe('GET /api/coaches/[id]/availability — query param validation', () => {
  it('returns 400 when from_date has invalid format', async () => {
    const res = await callGet(COACH_UUID, '?from_date=01-06-2026')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('from_date')]))
  })

  it('returns 400 when from_date is after to_date', async () => {
    const res = await callGet(COACH_UUID, '?from_date=2026-06-10&to_date=2026-06-01')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.details).toEqual(expect.arrayContaining([expect.stringContaining('from_date')]))
  })
})

// ─── Success case ─────────────────────────────────────────────────────────────

describe('GET /api/coaches/[id]/availability — success', () => {
  it('returns 200 with availability data when called with a valid UUID', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        // coach_profiles — verify coach is live
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        // availability_templates — .select().eq('coach_profile_id').eq('is_active') then awaited
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true, price_override_pence: 7500, venue_name: null, coach_venue_id: null, is_recurring: true, specific_date: null }],
              error: null,
            })
          }
          return c
        })
        return c
      })
    // blocked_dates is read via the admin client (BUG-32) — beforeEach default
    // returns no rows.

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveProperty('availability')
    expect(data).toHaveProperty('blocked_dates')
    expect(data).toHaveProperty('booked_slots')
    expect(data).toHaveProperty('booking_policy')
    expect(data.booking_policy.cancellation_window_hours).toBe(24)
    // BUG-08: the per-block price override must be surfaced so the time picker
    // can price each slot rather than always using the sport default.
    expect(data.availability[0].price_override_pence).toBe(7500)
  })

  // BUG-04: the public response previously dropped is_recurring + specific_date,
  // so the frontend had no way to tell an ad-hoc slot from a weekly one and could
  // not render the teal ad-hoc dot. Both must now surface on every slot.
  it('surfaces is_recurring and specific_date for an ad-hoc slot', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        // availability_templates — an ad-hoc one-off slot (is_recurring=false)
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true, price_override_pence: null, venue_name: null, coach_venue_id: null, is_recurring: false, specific_date: '2026-07-04' }],
              error: null,
            })
          }
          return c
        })
        return c
      })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.availability[0].is_recurring).toBe(false)
    expect(data.availability[0].specific_date).toBe('2026-07-04')
  })
})

// ─── Venue resolution (UX-09) ───────────────────────────────────────────────

describe('GET /api/coaches/[id]/availability — venue resolution (UX-09)', () => {
  it('resolves coach_venue_id to the coach_venues name when venue_name is null', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        // coach_profiles — verify coach is live
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        // availability_templates — block carries only a coach_venue_id (picker path)
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true, price_override_pence: null, venue_name: null, coach_venue_id: 'venue-1' }],
              error: null,
            })
          }
          return c
        })
        return c
      })
      .mockImplementationOnce(() => {
        // coach_venues — .select('id, name').in('id', [...]) then awaited
        const c = makeChain()
        c.in = jest.fn(() => Promise.resolve({ data: [{ id: 'venue-1', name: 'Kingston Hospital' }], error: null }))
        return c
      })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.availability[0].venue_name).toBe('Kingston Hospital')
    expect(mockFrom).toHaveBeenCalledWith('coach_venues')
  })

  it('uses the free-text venue_name and does not query coach_venues', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        // availability_templates — block carries a free-text venue_name
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true, price_override_pence: null, venue_name: 'Lords Nets', coach_venue_id: null }],
              error: null,
            })
          }
          return c
        })
        return c
      })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.availability[0].venue_name).toBe('Lords Nets')
    expect(mockFrom).not.toHaveBeenCalledWith('coach_venues')
  })

  it('returns venue_name null and skips coach_venues when a block has neither', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true, price_override_pence: null, venue_name: null, coach_venue_id: null }],
              error: null,
            })
          }
          return c
        })
        return c
      })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.availability[0].venue_name).toBeNull()
    expect(mockFrom).not.toHaveBeenCalledWith('coach_venues')
  })

  it('returns 500 when the coach_venues resolution query errors', async () => {
    mockFrom
      .mockImplementationOnce(() => {
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) {
            return Promise.resolve({
              data: [{ id: 'slot-uuid', sport_id: null, day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00', is_active: true, price_override_pence: null, venue_name: null, coach_venue_id: 'venue-1' }],
              error: null,
            })
          }
          return c
        })
        return c
      })
      .mockImplementationOnce(() => {
        // coach_venues — the resolution query itself errors
        const c = makeChain()
        c.in = jest.fn(() => Promise.resolve({ data: null, error: { message: 'db error' } }))
        return c
      })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(500)
  })
})

// ─── Booked slots (BUG-14 / BUG-19 Phase 1) ───────────────────────────────────
//
// Live bookings must surface as busy intervals so the public calendar stops
// rendering booked slots as bookable. Privacy: intervals ONLY — no booking ids,
// participant data, or status may leave the server.

describe('GET /api/coaches/[id]/availability — booked_slots (BUG-14)', () => {
  // Queues the two RLS-client reads (coach → templates). blocked_dates moved to
  // the admin client under BUG-32 and is queued there (before bookings).
  function mockBaseReads() {
    mockFrom
      .mockImplementationOnce(() => {
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) return Promise.resolve({ data: [], error: null })
          return c
        })
        return c
      })
  }

  // BUG-32: the admin client serves blocked_dates first, then bookings — a
  // single mockImplementationOnce would feed the bookings rows to the blocked
  // read. Queue both in route order.
  function mockAdminBlockedThenBookings(bookings: { data: unknown; error: unknown }) {
    mockAdminFrom
      .mockImplementationOnce(() => makeThenableChain({ data: [], error: null }))
      .mockImplementationOnce(() => makeThenableChain(bookings))
  }

  it('returns booked slots as HH:MM intervals with ONLY date/start/end fields', async () => {
    mockBaseReads()
    mockAdminBlockedThenBookings({
      data: [
        { session_date: '2026-07-20', session_start_time: '10:00:00', session_end_time: '11:00:00' },
      ],
      error: null,
    })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.booked_slots).toEqual([
      { date: '2026-07-20', start_time: '10:00', end_time: '11:00' },
    ])
    // Privacy shape: exactly these three keys, nothing else (no id, no
    // participant_name, no status).
    expect(Object.keys(data.booked_slots[0]).sort()).toEqual(['date', 'end_time', 'start_time'])
    // The read went through the admin client, against bookings.
    expect(mockAdminFrom).toHaveBeenCalledWith('bookings')
  })

  it('applies the migration-034 slot-holding predicate (soft-deletes and cancellations excluded)', async () => {
    mockBaseReads()
    const chain = makeThenableChain({ data: [], error: null })
    mockAdminFrom
      .mockImplementationOnce(() => makeThenableChain({ data: [], error: null }))
      .mockImplementationOnce(() => chain)

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.not).toHaveBeenCalledWith('status', 'in', '(cancelled_parent,cancelled_coach,no_show)')
  })

  it('returns 500 when the booked-slots query errors', async () => {
    mockBaseReads()
    mockAdminBlockedThenBookings({ data: null, error: { message: 'db error' } })

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(500)
  })
})

// ─── Blocked dates via admin client (BUG-32) ──────────────────────────────────
//
// blocked_dates has a coach-only SELECT policy. The route used to read it with
// the anon client, which silently returned [] for guests — blocked days kept
// rendering bookable slots and parents only hit the 409 date_blocked backstop
// at checkout. The read must go through the admin client, shaped to bare
// YYYY-MM-DD strings (no label/reason).

describe('GET /api/coaches/[id]/availability — blocked_dates (BUG-32)', () => {
  function mockBaseReads() {
    mockFrom
      .mockImplementationOnce(() => {
        const c = makeChain()
        c.maybeSingle.mockResolvedValue({
          data: { cancellation_window_hours: 24, min_advance_hours: 12, max_advance_days: 60 },
          error: null,
        })
        return c
      })
      .mockImplementationOnce(() => {
        const c = makeChain()
        let eqCount = 0
        c.eq = jest.fn(() => {
          eqCount++
          if (eqCount >= 2) return Promise.resolve({ data: [], error: null })
          return c
        })
        return c
      })
  }

  it('surfaces blocked dates from the ADMIN client — anon RLS no longer empties them', async () => {
    mockBaseReads()
    mockAdminFrom
      .mockImplementationOnce(() =>
        makeThenableChain({
          data: [
            { blocked_date: '2026-07-25', blocked_date_end: null },
            { blocked_date: '2026-08-01', blocked_date_end: '2026-08-03' },
          ],
          error: null,
        }),
      )
      .mockImplementationOnce(() => makeThenableChain({ data: [], error: null }))

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(200)
    const data = await res.json()
    // Single day + expanded range, bare date strings only.
    expect(data.blocked_dates).toEqual(['2026-07-25', '2026-08-01', '2026-08-02', '2026-08-03'])
    expect(data.blocked_dates.every((d: unknown) => typeof d === 'string')).toBe(true)
    // The read went through the admin client — and never through the anon one.
    expect(mockAdminFrom).toHaveBeenCalledWith('blocked_dates')
    expect(mockFrom).not.toHaveBeenCalledWith('blocked_dates')
  })

  it('returns 500 when the blocked_dates query errors', async () => {
    mockBaseReads()
    mockAdminFrom.mockImplementationOnce(() =>
      makeThenableChain({ data: null, error: { message: 'db error' } }),
    )

    const res = await callGet(COACH_UUID)
    expect(res.status).toBe(500)
  })
})
