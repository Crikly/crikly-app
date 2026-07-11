// BUG-19 P2.6: fetchProgrammeSchedule must return ONE DayProgramme entry per
// (programme, date) — a camp day is a single enrollable unit and a single
// card — while `blocks` carries every camp time block for busy-suppression
// (Option B). P2.4 briefly returned one entry PER block, which duplicated the
// enrolment card and the {programmeId}-{date} React key; these tests pin the
// corrected contract.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { fetchProgrammeSchedule } from '@/app/coaches/[id]/availability/_components/_data/programmeSchedule'

type MockFn = jest.Mock

// ── Thenable chain mock (same pattern as availability-commitments.test.ts) ────
// Every query method chains; awaiting resolves to the table's seeded rows. The
// helper's own filtering/shaping is what's under test.
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
  }
}

/** Local YYYY-MM-DD for `now + days` — keeps fixtures inside the visible window. */
function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dd}`
}

const PROGRAMME_BASE = {
  id: 'prog-camp',
  title: 'Summer Camp',
  sport_id: 'sport-1',
  age_groups: ['U10'],
  max_spots: 10,
  current_spots: 2,
  price_per_session_pence: 5600,
  block_price_pence: null,
  payment_type: 'per_session',
  day_of_week: 1,
  days_of_week: [1, 2],
  start_time: '09:00:00',
  duration_minutes: 60,
  starts_at: null,
  ends_at: null,
  venue_name: null,
}

function seed(programmes: unknown[]) {
  ;(createClient as MockFn).mockResolvedValue(
    makeClient({ group_programmes: programmes, sports: [{ id: 'sport-1', name: 'Cricket' }] }),
  )
}

beforeEach(() => jest.clearAllMocks())

describe('fetchProgrammeSchedule — camp-mode blocks (BUG-19 P2.6)', () => {
  it('returns ONE entry per camp day with every block nested (not one entry per block)', async () => {
    const date = isoInDays(2)
    seed([
      {
        ...PROGRAMME_BASE,
        group_programme_sessions: [
          {
            session_date: date,
            start_time: '09:00:00',
            end_time: '12:00:00',
            status: 'scheduled',
            slots: [
              { startTime: '09:00', endTime: '12:00' },
              { startTime: '13:00', endTime: '17:00' },
            ],
          },
        ],
      },
    ])

    const { byDate } = await fetchProgrammeSchedule('coach-1')

    // One card per camp day — the P2.4 regression rendered two.
    expect(byDate[date]).toHaveLength(1)
    const entry = byDate[date][0]
    // Display fields are the FIRST block only (byte-identical to pre-P2.4).
    expect(entry.startTime).toBe('09:00')
    expect(entry.endTime).toBe('12:00')
    // Suppression reads blocks — the afternoon block must be present.
    expect(entry.blocks).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ])
    expect(entry.pricePence).toBe(5600)
    expect(entry.sportName).toBe('Cricket')
  })

  it('a single-block session yields one entry with one block (unchanged shape)', async () => {
    const date = isoInDays(3)
    seed([
      {
        ...PROGRAMME_BASE,
        id: 'prog-single',
        group_programme_sessions: [
          { session_date: date, start_time: '10:00:00', end_time: '11:00:00', status: 'scheduled', slots: null },
        ],
      },
    ])

    const { byDate } = await fetchProgrammeSchedule('coach-1')

    expect(byDate[date]).toHaveLength(1)
    expect(byDate[date][0].startTime).toBe('10:00')
    expect(byDate[date][0].endTime).toBe('11:00')
    expect(byDate[date][0].blocks).toEqual([{ startTime: '10:00', endTime: '11:00' }])
  })

  it('recurring-fallback programmes (no session rows) carry their derived single block', async () => {
    seed([{ ...PROGRAMME_BASE, id: 'prog-recurring', group_programme_sessions: [] }])

    const { byDate, programmeDates } = await fetchProgrammeSchedule('coach-1')

    expect(programmeDates.length).toBeGreaterThan(0)
    const entry = byDate[programmeDates[0]][0]
    expect(entry.startTime).toBe('09:00')
    expect(entry.endTime).toBe('10:00') // start + 60 min
    expect(entry.blocks).toEqual([{ startTime: '09:00', endTime: '10:00' }])
  })

  it('a session with no usable times yields one entry with null times and no blocks', async () => {
    const date = isoInDays(4)
    seed([
      {
        ...PROGRAMME_BASE,
        id: 'prog-timeless',
        group_programme_sessions: [
          { session_date: date, start_time: null, end_time: null, status: 'scheduled', slots: null },
        ],
      },
    ])

    const { byDate } = await fetchProgrammeSchedule('coach-1')

    expect(byDate[date]).toHaveLength(1)
    expect(byDate[date][0].startTime).toBeNull()
    expect(byDate[date][0].endTime).toBeNull()
    expect(byDate[date][0].blocks).toEqual([])
  })
})
