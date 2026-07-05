// BUG-17/18: getCoachCommitments aggregates every busy interval a coach holds on
// a given date across availability_templates, group_programme_sessions (persisted
// + recurring fallback), and bookings. findFirstConflict is the overlap gate.

import { getCoachCommitments, findFirstConflict, type Commitment } from '@/lib/availability/commitments'

// ── Minimal thenable Supabase mock ────────────────────────────────────────────
// from(table) returns a proxy where every query method chains and awaiting it
// resolves to { data: dataByTable[table], error: null }. Query filters (eq/in/
// gte/not/...) are no-ops — the helper's own in-memory filtering is what's under
// test, so each table is seeded with the rows the DB would already have returned.
function makeClient(dataByTable: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const result = { data: dataByTable[table] ?? [], error: null }
      const proxy: unknown = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === 'then') return (resolve: (r: unknown) => void) => resolve(result)
            return () => proxy
          },
        },
      )
      return proxy
    },
  } as unknown as Parameters<typeof getCoachCommitments>[0]
}

// 2026-07-05 is a Sunday (day_of_week === 0).
const DATE = '2026-07-05'
const COACH = 'coach-1'

describe('getCoachCommitments — availability_templates', () => {
  it('includes a recurring block on the matching weekday', async () => {
    const client = makeClient({
      availability_templates: [
        { id: 'a1', day_of_week: 0, start_time: '09:00', end_time: '10:00', is_recurring: true, specific_date: null },
      ],
    })
    const c = await getCoachCommitments(client, COACH, DATE)
    expect(c).toEqual<Commitment[]>([
      { startMinutes: 540, endMinutes: 600, source: 'recurring', label: 'a recurring availability block' },
    ])
  })

  it('excludes a recurring block on a different weekday', async () => {
    const client = makeClient({
      availability_templates: [
        { id: 'a1', day_of_week: 3, start_time: '09:00', end_time: '10:00', is_recurring: true, specific_date: null },
      ],
    })
    expect(await getCoachCommitments(client, COACH, DATE)).toEqual([])
  })

  it('includes an ad-hoc block only on its own specific_date', async () => {
    const client = makeClient({
      availability_templates: [
        { id: 'a1', day_of_week: 0, start_time: '14:00', end_time: '15:00', is_recurring: false, specific_date: DATE },
        { id: 'a2', day_of_week: 0, start_time: '16:00', end_time: '17:00', is_recurring: false, specific_date: '2026-07-12' },
      ],
    })
    const c = await getCoachCommitments(client, COACH, DATE)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ startMinutes: 840, endMinutes: 900, source: 'ad_hoc' })
  })

  it('honours excludeAvailabilityBlockId', async () => {
    const client = makeClient({
      availability_templates: [
        { id: 'a1', day_of_week: 0, start_time: '09:00', end_time: '10:00', is_recurring: true, specific_date: null },
      ],
    })
    expect(await getCoachCommitments(client, COACH, DATE, { excludeAvailabilityBlockId: 'a1' })).toEqual([])
  })
})

describe('getCoachCommitments — programmes', () => {
  it('includes a persisted session landing on the date', async () => {
    const client = makeClient({
      group_programmes: [
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '10:00', duration_minutes: 60, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [
        { group_programme_id: 'p1', session_date: DATE, start_time: '10:00', end_time: '11:00' },
      ],
    })
    const c = await getCoachCommitments(client, COACH, DATE)
    expect(c).toEqual<Commitment[]>([
      { startMinutes: 600, endMinutes: 660, source: 'programme', label: 'a programme session' },
    ])
  })

  it('ignores a persisted session on a different date', async () => {
    const client = makeClient({
      group_programmes: [
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '10:00', duration_minutes: 60, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [
        { group_programme_id: 'p1', session_date: '2026-07-12', start_time: '10:00', end_time: '11:00' },
      ],
    })
    // p1 is in persisted mode (has a session row), so the recurring fallback does
    // NOT fire — and the one session it has isn't on DATE → no commitment.
    expect(await getCoachCommitments(client, COACH, DATE)).toEqual([])
  })

  it('falls back to the recurring pattern for a programme with no session rows', async () => {
    const client = makeClient({
      group_programmes: [
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '10:00', duration_minutes: 90, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [],
    })
    const c = await getCoachCommitments(client, COACH, DATE)
    expect(c).toEqual<Commitment[]>([
      { startMinutes: 600, endMinutes: 690, source: 'programme', label: 'a programme session' },
    ])
  })

  it('recurring fallback respects starts_at / ends_at anchors', async () => {
    const client = makeClient({
      group_programmes: [
        // pattern matches Sunday, but the date is after ends_at → no commitment
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '10:00', duration_minutes: 60, starts_at: null, ends_at: '2026-06-30T00:00:00' },
      ],
      group_programme_sessions: [],
    })
    expect(await getCoachCommitments(client, COACH, DATE)).toEqual([])
  })

  it('uses days_of_week when present for the recurring fallback', async () => {
    const client = makeClient({
      group_programmes: [
        { id: 'p1', day_of_week: 3, days_of_week: [0, 2], start_time: '10:00', duration_minutes: 60, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [],
    })
    // days_of_week includes Sunday(0) → matches DATE even though day_of_week is 3.
    expect(await getCoachCommitments(client, COACH, DATE)).toHaveLength(1)
  })

  it('expands a camp-mode session into one commitment per slots block (BUG-19 Phase 2)', async () => {
    const client = makeClient({
      group_programmes: [
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '09:00', duration_minutes: 180, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [
        {
          group_programme_id: 'p1',
          session_date: DATE,
          start_time: '09:00',
          end_time: '12:00',
          slots: [
            { startTime: '09:00', endTime: '12:00' },
            { startTime: '13:00', endTime: '17:00' },
          ],
        },
      ],
    })
    const c = await getCoachCommitments(client, COACH, DATE)
    // Before Phase 2 only the first block guarded — the 13:00–17:00 afternoon
    // was silently bookable for a 1-on-1.
    expect(c).toEqual<Commitment[]>([
      { startMinutes: 540, endMinutes: 720, source: 'programme', label: 'a programme session' },
      { startMinutes: 780, endMinutes: 1020, source: 'programme', label: 'a programme session' },
    ])
  })

  it('honours excludeProgrammeId', async () => {
    const client = makeClient({
      group_programmes: [
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '10:00', duration_minutes: 60, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [
        { group_programme_id: 'p1', session_date: DATE, start_time: '10:00', end_time: '11:00' },
      ],
    })
    expect(await getCoachCommitments(client, COACH, DATE, { excludeProgrammeId: 'p1' })).toEqual([])
  })
})

describe('getCoachCommitments — bookings', () => {
  it('includes a booking on the date', async () => {
    const client = makeClient({
      bookings: [{ session_start_time: '15:00', session_end_time: '16:00' }],
    })
    const c = await getCoachCommitments(client, COACH, DATE)
    expect(c).toEqual<Commitment[]>([
      { startMinutes: 900, endMinutes: 960, source: 'booking', label: 'a confirmed booking' },
    ])
  })
})

describe('getCoachCommitments — combined', () => {
  it('aggregates across all sources', async () => {
    const client = makeClient({
      availability_templates: [
        { id: 'a1', day_of_week: 0, start_time: '09:00', end_time: '10:00', is_recurring: true, specific_date: null },
      ],
      group_programmes: [
        { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '11:00', duration_minutes: 60, starts_at: null, ends_at: null },
      ],
      group_programme_sessions: [],
      bookings: [{ session_start_time: '15:00', session_end_time: '16:00' }],
    })
    const sources = (await getCoachCommitments(client, COACH, DATE)).map(c => c.source).sort()
    expect(sources).toEqual(['booking', 'programme', 'recurring'])
  })
})

// ── BUG-19 Phase 1: sources filter ────────────────────────────────────────────
//
// The guest bookings route consumes the aggregator with sources
// ['programme','booking'] — for a 1-on-1 booking an availability template is
// the VALID zone, not a conflict. Omitting sources must keep the coach-side
// BUG-16/17/18 behaviour byte-for-byte.

describe('getCoachCommitments — sources filter (BUG-19 Phase 1)', () => {
  const seeded = {
    availability_templates: [
      { id: 'a1', day_of_week: 0, start_time: '09:00', end_time: '10:00', is_recurring: true, specific_date: null },
      { id: 'a2', day_of_week: 0, start_time: '13:00', end_time: '14:00', is_recurring: false, specific_date: DATE },
    ],
    group_programmes: [
      { id: 'p1', day_of_week: 0, days_of_week: null, start_time: '11:00', duration_minutes: 60, starts_at: null, ends_at: null },
    ],
    group_programme_sessions: [],
    bookings: [{ session_start_time: '15:00', session_end_time: '16:00' }],
  }

  it("['programme','booking'] excludes both template kinds", async () => {
    const c = await getCoachCommitments(makeClient(seeded), COACH, DATE, {
      sources: ['programme', 'booking'],
    })
    expect(c.map(x => x.source).sort()).toEqual(['booking', 'programme'])
  })

  it("['booking'] returns bookings only", async () => {
    const c = await getCoachCommitments(makeClient(seeded), COACH, DATE, { sources: ['booking'] })
    expect(c).toHaveLength(1)
    expect(c[0].source).toBe('booking')
  })

  it("['recurring'] includes the recurring template but not the ad-hoc one", async () => {
    const c = await getCoachCommitments(makeClient(seeded), COACH, DATE, { sources: ['recurring'] })
    expect(c.map(x => x.source)).toEqual(['recurring'])
  })

  it('omitting sources returns every surface (coach-side callers unchanged)', async () => {
    const c = await getCoachCommitments(makeClient(seeded), COACH, DATE)
    expect(c.map(x => x.source).sort()).toEqual(['ad_hoc', 'booking', 'programme', 'recurring'])
  })
})

describe('findFirstConflict', () => {
  const busy: Commitment[] = [
    { startMinutes: 600, endMinutes: 660, source: 'programme', label: 'a programme session' },
  ]

  it('returns the overlapping commitment', () => {
    expect(findFirstConflict(630, 690, busy)).toBe(busy[0])
  })

  it('returns null for a non-overlapping range', () => {
    expect(findFirstConflict(660, 720, busy)).toBeNull() // adjacent = no conflict
  })

  it('returns null against an empty commitment set', () => {
    expect(findFirstConflict(600, 660, [])).toBeNull()
  })
})
