// TEST-PROG-DETAIL-LIB: unit tests for the pure transform helpers in
// src/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail.ts
//
// Only the exported + testable pure-function logic is exercised here.
// The Supabase queries and React.cache wrapper (fetchProgrammeDetail,
// fetchCoachLite) are integration concerns that require a live Supabase
// client and are NOT covered in this unit file — see the constraint in
// the P-00c-D1 task brief.
//
// Functions under test (exercised indirectly through the behaviour they
// produce in the returned ProgrammeDetailView):
//   fmt12          — "09:00:00" → "9:00am"
//   fmtRange       — "09:00:00","10:00:00" → "9:00am – 10:00am"
//   fmtRangeShort  — "09:00:00","10:00:00" → "9–10am"
//   parseTime      — NaN-guard: bad input returns {h:0, m:0}
//   fmtDateLabel   — "2026-06-28" → "Sun 28 June"
//   camp grouping  — group_programme_sessions flattened by slots[]
//   paymentType mapping
//   spots / fillPct / scarcity math
//   blockTotalPence = block_price_pence ?? price_per_session_pence * sessionCount
//   ownership guard — returns null when coach_profile_id !== coach.id
//
// Because the helpers are NOT exported we test them through the public
// surface: we mock @/lib/supabase/server and global fetch so that
// fetchProgrammeDetail returns a ProgrammeDetailView we can inspect.
//
// ── Hoisting note ───────────────────────────────────────────────────────────────
// jest.mock() factories are hoisted to the top of the compiled output, so any
// reference to a module-body const/let declared below the call will be in the
// temporal dead zone when the factory runs. We work around this by declaring
// the shared state registry as `var` (hoisted, not TDZ) so the factory closure
// can access it safely.

/* eslint-disable no-var */
// Shared registry used by the Supabase mock factory AND the test helpers.
// `var` is intentional — see hoisting note above.
var _responses: Array<{
  select: jest.Mock
  eq: jest.Mock
  is: jest.Mock
  order: jest.Mock
  maybeSingle: jest.Mock
}> = []
var _callIdx = 0
/* eslint-enable no-var */

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn(() => {
      const chain = _responses[_callIdx++]
      if (!chain) {
        // Fallback: any unconfigured call returns {data:null, error:null}
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      return chain
    }),
  }),
}))

import { fetchProgrammeDetail } from '@/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail'

// ─── global.fetch mock ────────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const COACH_API_RESPONSE = {
  id: 'coach-123',
  full_name: 'James Anderson',
  dbs_status: 'verified',
  rating_avg: 4.8,
  rating_count: 12,
}

const BASE_PROGRAMME = {
  id: 'prog-abc',
  coach_profile_id: 'coach-123',
  sport_id: 'sport-cricket',
  title: 'Junior Cricket Academy',
  age_groups: ['U10', 'U12'],
  schedule_type: 'fixed',
  day_of_week: 6, // Saturday
  days_of_week: null,
  start_time: '09:00:00',
  duration_minutes: 60,
  max_spots: 10,
  current_spots: 3,
  payment_type: 'per_session',
  price_per_session_pence: 2500,
  block_price_pence: null,
  block_session_count: null,
  starts_at: '2026-06-28',
  ends_at: null,
  camp_mode: false,
  currency: 'GBP',
  status: 'active',
}

const FUTURE_DATE = '2099-06-28' // guaranteed future
const PAST_DATE = '2020-01-01'   // guaranteed past

// ─── Chain factory helpers ─────────────────────────────────────────────────────

type MockChain = {
  select: jest.Mock
  eq: jest.Mock
  is: jest.Mock
  order: jest.Mock
  maybeSingle: jest.Mock
}

/** Build a single-call chain that resolves maybeSingle() to the given data. */
function makeChain(data: unknown, error: unknown = null): MockChain {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data, error }),
  }
}

/** Sessions query uses `.order().order()` — first .order() must return an object
 *  with a second .order() that resolves to the rows array. */
function makeSessionChain(rows: unknown[]): MockChain {
  const secondOrder = jest.fn().mockResolvedValue({ data: rows, error: null })
  const firstOrder = jest.fn().mockReturnValue({ order: secondOrder })
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: firstOrder,
    maybeSingle: jest.fn(), // unused for sessions
  }
}

/** Reset the mock state and configure the three responses expected by
 *  fetchProgrammeDetail: group_programmes, sports, group_programme_sessions.
 *  `programme` is typed as `unknown` because individual tests override nullable
 *  fields (block_price_pence, price_per_session_pence) that TypeScript would
 *  otherwise narrow to their literal types from BASE_PROGRAMME. */
function setupFetch({
  programme = BASE_PROGRAMME as unknown,
  sessions = [] as unknown[],
  sportName = 'Cricket',
}: {
  programme?: unknown
  sessions?: unknown[]
  sportName?: string
} = {}) {
  _callIdx = 0
  _responses = []

  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => COACH_API_RESPONSE,
  } as Response)

  _responses[0] = makeChain(programme) // group_programmes
  _responses[1] = makeChain({ name: sportName }) // sports
  _responses[2] = makeSessionChain(sessions) // group_programme_sessions
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchProgrammeDetail — ownership guard', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('returns null when programme.coach_profile_id !== coach.id', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, coach_profile_id: 'different-coach-id' } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result).toBeNull()
  })

  it('returns null when programme is not found (maybeSingle returns null)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => COACH_API_RESPONSE,
    } as Response)
    _responses[0] = makeChain(null)
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result).toBeNull()
  })

  it('returns null when fetchCoachLite returns 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response)
    const result = await fetchProgrammeDetail('unknown-coach', 'prog-abc')
    expect(result).toBeNull()
  })
})

// ─── Time formatting helpers ───────────────────────────────────────────────────

describe('fetchProgrammeDetail — time formatting (fmt12 / fmtRange / fmtRangeShort)', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('formats a whole-hour session as "9:00am – 10:00am" (fmtRange)', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result).not.toBeNull()
    expect(result!.sessions[0].timeLabel).toBe('9:00am – 10:00am')
  })

  it('formats a half-hour range as "9:30am – 10:00am" (fmtRange with minutes)', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:30:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].timeLabel).toBe('9:30am – 10:00am')
  })

  it('formats a pm range as "2:00pm – 3:30pm"', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '14:00:00', end_time: '15:30:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].timeLabel).toBe('2:00pm – 3:30pm')
  })

  it('drops the shared am/pm on start in timeShort when both edges are am', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    // Both am → "9–10am"
    expect(result!.sessions[0].timeShort).toBe('9–10am')
  })

  it('keeps am/pm on start in timeShort when edges cross the meridiem', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '11:00:00', end_time: '13:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    // 11am → 1pm: start differs from end → "11am–1pm"
    expect(result!.sessions[0].timeShort).toBe('11am–1pm')
  })

  it('NaN guard: malformed start_time renders without "NaN" text', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: 'not-a-time', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    // parseTime's isFinite guard clamps to {h:0, m:0} → "12:00am" (h%12===0 → 12)
    expect(result!.sessions[0].timeLabel).not.toMatch(/NaN/)
    expect(result!.sessions[0].timeLabel).toMatch(/12:00am/)
  })
})

// ─── Date label formatting ─────────────────────────────────────────────────────

describe('fetchProgrammeDetail — date label formatting', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('formats "2026-06-28" as "Sun 28 June"', async () => {
    setupFetch({
      sessions: [
        { session_date: '2026-06-28', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].dateLabel).toBe('Sun 28 June')
  })

  it('formats "2026-12-25" as "Fri 25 December"', async () => {
    setupFetch({
      sessions: [
        { session_date: '2026-12-25', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].dateLabel).toBe('Fri 25 December')
  })
})

// ─── Selectable / past / cancelled guard ──────────────────────────────────────

describe('fetchProgrammeDetail — session selectable flag', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('marks a future scheduled session as selectable=true and closedLabel=null', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].selectable).toBe(true)
    expect(result!.sessions[0].closedLabel).toBeNull()
  })

  it('marks a past session as selectable=false and closedLabel="Closed"', async () => {
    setupFetch({
      sessions: [
        { session_date: PAST_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].selectable).toBe(false)
    expect(result!.sessions[0].closedLabel).toBe('Closed')
  })

  it('marks a cancelled session as selectable=false', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'cancelled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].selectable).toBe(false)
  })

  it('marks a completed session as selectable=false', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'completed' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].selectable).toBe(false)
  })
})

// ─── Camp mode grouping ────────────────────────────────────────────────────────

describe('fetchProgrammeDetail — camp mode grouping', () => {
  const CAMP_PROGRAMME = { ...BASE_PROGRAMME, camp_mode: true, payment_type: 'per_session' }

  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  function setupCamp(slots: unknown[]) {
    _callIdx = 0
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => COACH_API_RESPONSE,
    } as Response)
    _responses[0] = makeChain(CAMP_PROGRAMME)
    _responses[1] = makeChain({ name: 'Cricket' })
    _responses[2] = makeSessionChain([
      {
        session_date: FUTURE_DATE,
        start_time: '09:00:00',
        end_time: '17:00:00',
        slots,
        status: 'scheduled',
      },
    ])
  }

  it('groups two slots on the same date into one CampDay', async () => {
    setupCamp([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '14:00', endTime: '15:00' },
    ])
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result).not.toBeNull()
    expect(result!.campDays).toHaveLength(1)
    expect(result!.campDays[0].slots).toHaveLength(2)
  })

  it('expands slots[] into individual SessionView entries in sessions[]', async () => {
    setupCamp([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '16:00' },
    ])
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    // 1 session row with 2 slots → 2 SessionView entries
    expect(result!.sessions).toHaveLength(2)
  })

  it('assigns slotName "Morning" to a 9am slot and "Afternoon" to a 2pm slot', async () => {
    setupCamp([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '17:00' },
    ])
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].slotName).toBe('Morning')
    expect(result!.sessions[1].slotName).toBe('Afternoon')
  })

  it('non-camp programmes have slotName=null on every session', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.sessions[0].slotName).toBeNull()
  })

  it('returns empty campDays[] for a non-camp programme', async () => {
    setupFetch({
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.campDays).toHaveLength(0)
  })
})

// ─── Payment type mapping ──────────────────────────────────────────────────────

describe('fetchProgrammeDetail — paymentType mapping', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('maps payment_type="block_upfront" to paymentType="block_upfront"', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, payment_type: 'block_upfront' } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.paymentType).toBe('block_upfront')
  })

  it('maps payment_type="per_session" to paymentType="per_session"', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, payment_type: 'per_session' } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.paymentType).toBe('per_session')
  })

  it('maps any unknown payment_type to "per_session" as a safe default', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, payment_type: 'unknown_type' } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.paymentType).toBe('per_session')
  })
})

// ─── Spots / scarcity / fillPct math ──────────────────────────────────────────

describe('fetchProgrammeDetail — spots / scarcity / fillPct math', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('calculates spotsLeft = max_spots - current_spots', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 3 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.spotsLeft).toBe(7)
  })

  it('clamps spotsLeft to 0 when current_spots > max_spots (oversold guard)', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 12 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.spotsLeft).toBe(0)
  })

  it('calculates fillPct correctly: 3/10 → 30%', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 3 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.fillPct).toBe(30)
  })

  it('clamps fillPct to 100 when current_spots > max_spots', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 15 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.fillPct).toBe(100)
  })

  it('returns fillPct=0 when max_spots=0 (guards division-by-zero)', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 0, current_spots: 0 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.fillPct).toBe(0)
  })

  it('returns scarcity="Almost full" when spotsLeft <= 2 and > 0', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 9 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.scarcity).toBe('Almost full')
  })

  it('returns scarcity="Filling up" when spotsLeft <= half capacity and > 2', async () => {
    // max=10, current=6 → spotsLeft=4 which is ≤ ceil(10/2)=5
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 6 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.scarcity).toBe('Filling up')
  })

  it('returns scarcity=null when more than half the spots remain', async () => {
    // max=10, current=2 → spotsLeft=8 > ceil(10/2)=5
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 2 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.scarcity).toBeNull()
  })

  it('returns scarcity=null when spotsLeft=0 (fully booked)', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, max_spots: 10, current_spots: 10 } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.scarcity).toBeNull()
  })
})

// ─── blockTotalPence derivation ────────────────────────────────────────────────

describe('fetchProgrammeDetail — blockTotalPence', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('uses block_price_pence directly when set', async () => {
    setupFetch({
      programme: {
        ...BASE_PROGRAMME,
        payment_type: 'block_upfront',
        price_per_session_pence: 2500,
        block_price_pence: 18000,
        block_session_count: 8,
      },
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.blockTotalPence).toBe(18000)
  })

  it('falls back to price_per_session_pence * sessionCount when block_price_pence is null', async () => {
    // 4 sessions at £25.00 → 10000 pence
    setupFetch({
      programme: {
        ...BASE_PROGRAMME,
        payment_type: 'block_upfront',
        price_per_session_pence: 2500,
        block_price_pence: null,
        block_session_count: 4,
      },
      sessions: [
        { session_date: FUTURE_DATE, start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.blockTotalPence).toBe(10000)
    expect(Number.isInteger(result!.blockTotalPence!)).toBe(true)
  })

  it('returns null when both price_per_session_pence and block_price_pence are null', async () => {
    setupFetch({
      programme: {
        ...BASE_PROGRAMME,
        payment_type: 'block_upfront',
        price_per_session_pence: null,
        block_price_pence: null,
        block_session_count: null,
      },
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.blockTotalPence).toBeNull()
  })

  it('uses distinct session dates as sessionCount when block_session_count is null', async () => {
    // 3 distinct session dates → sessionCount=3; 2500 * 3 = 7500
    setupFetch({
      programme: {
        ...BASE_PROGRAMME,
        payment_type: 'block_upfront',
        price_per_session_pence: 2500,
        block_price_pence: null,
        block_session_count: null,
      },
      sessions: [
        { session_date: '2099-07-01', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
        { session_date: '2099-07-08', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
        { session_date: '2099-07-15', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.blockTotalPence).toBe(7500)
    expect(Number.isInteger(result!.blockTotalPence!)).toBe(true)
  })
})

// ─── schedule[] numbered rows ─────────────────────────────────────────────────

describe('fetchProgrammeDetail — schedule rows (block_upfront numbered list)', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('builds numbered schedule rows starting from 1', async () => {
    setupFetch({
      programme: { ...BASE_PROGRAMME, payment_type: 'block_upfront' },
      sessions: [
        { session_date: '2099-07-01', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
        { session_date: '2099-07-08', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.schedule).toHaveLength(2)
    expect(result!.schedule[0].number).toBe(1)
    expect(result!.schedule[1].number).toBe(2)
  })

  it('schedule rows have dateLabel and timeShort populated', async () => {
    setupFetch({
      programme: { ...BASE_PROGRAMME, payment_type: 'block_upfront' },
      sessions: [
        { session_date: '2099-07-01', start_time: '09:00:00', end_time: '10:00:00', slots: null, status: 'scheduled' },
      ],
    })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.schedule[0].dateLabel).toBeTruthy()
    expect(result!.schedule[0].timeShort).toBeTruthy()
  })
})

// ─── currency field passthrough (BR-10) ───────────────────────────────────────

describe('fetchProgrammeDetail — BR-10 currency passthrough', () => {
  beforeEach(() => {
    _callIdx = 0
    _responses = []
    jest.clearAllMocks()
  })

  it('passes through the currency code from the DB row (GBP default)', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, currency: 'GBP' } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.currency).toBe('GBP')
  })

  it('passes through a non-GBP currency code unchanged', async () => {
    setupFetch({ programme: { ...BASE_PROGRAMME, currency: 'USD' } })
    const result = await fetchProgrammeDetail('coach-123', 'prog-abc')
    expect(result!.currency).toBe('USD')
  })
})
