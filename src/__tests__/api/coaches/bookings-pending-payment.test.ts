// BUG-82: pending_payment rows are abandoned/in-flight checkouts, not
// sessions. The Schedule grid (?tab=today) and the right-panel lineup
// (?tab=week and /all thisWeek bucket) previously returned them alongside
// confirmed sessions with no distinction. These tests pin the server-side
// filters so the coach never sees them, while confirmed/completed/no_show
// (today) and the cancelled exclusion (week) stay exactly as before.

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-coach', () => ({
  requireCoachContext: jest.fn(),
}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnValue({
        in: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    })),
  })),
}))

import { createClient } from '@/lib/supabase/server'
import { requireCoachContext } from '@/lib/auth/require-coach'
import { GET as getBookings } from '@/app/api/coaches/bookings/route'
import { GET as getAllBookings } from '@/app/api/coaches/bookings/all/route'

type Call = { method: string; args: unknown[] }

/**
 * Chainable recorder: every builder method records its call and returns the
 * same chain; awaiting the chain resolves to `{ data: [], error: null }`.
 */
function buildRecordingClient() {
  const calls: Call[] = []
  const chain: Record<string, unknown> = {}
  const methods = ['select', 'eq', 'neq', 'is', 'in', 'not', 'gte', 'lte', 'order', 'range']
  for (const m of methods) {
    chain[m] = jest.fn((...args: unknown[]) => {
      calls.push({ method: m, args })
      return chain
    })
  }
  chain.then = (resolve: (v: { data: never[]; error: null }) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve)

  const supabase = { from: jest.fn(() => chain) }
  return { supabase, calls }
}

function statusFilters(calls: Call[]): Call[] {
  return calls.filter((c) => c.args[0] === 'status')
}

beforeEach(() => {
  ;(requireCoachContext as jest.Mock).mockResolvedValue({
    context: {
      user: { id: 'auth-user-1' },
      userProfile: { id: 'up-1' },
      coachProfile: { id: 'coach-1' },
    },
    error: null,
  })
})

describe('GET /api/coaches/bookings — BUG-82 status filters', () => {
  async function callTab(tab: string) {
    const { supabase, calls } = buildRecordingClient()
    ;(createClient as jest.Mock).mockResolvedValue(supabase)
    const res = await getBookings(new Request(`http://localhost/api/coaches/bookings?tab=${tab}`))
    expect(res.status).toBe(200)
    return calls
  }

  it('tab=today excludes pending_payment and nothing else', async () => {
    const filters = statusFilters(await callTab('today'))
    expect(filters).toEqual([{ method: 'neq', args: ['status', 'pending_payment'] }])
  })

  it('tab=week excludes cancelled_parent, cancelled_coach and pending_payment', async () => {
    const filters = statusFilters(await callTab('week'))
    expect(filters).toEqual([
      { method: 'not', args: ['status', 'in', '(cancelled_parent,cancelled_coach,pending_payment)'] },
    ])
  })

  it('tab=upcoming stays confirmed-only (regression guard)', async () => {
    const filters = statusFilters(await callTab('upcoming'))
    expect(filters).toEqual([{ method: 'eq', args: ['status', 'confirmed'] }])
  })

  it('tab=past stays completed/no_show (regression guard)', async () => {
    const filters = statusFilters(await callTab('past'))
    expect(filters).toEqual([{ method: 'in', args: ['status', ['completed', 'no_show']] }])
  })
})

describe('GET /api/coaches/bookings/all — BUG-82 thisWeek bucket', () => {
  it('thisWeek bucket excludes pending_payment alongside cancelled', async () => {
    const { supabase, calls } = buildRecordingClient()
    ;(createClient as jest.Mock).mockResolvedValue(supabase)
    const res = await getAllBookings()
    expect(res.status).toBe(200)

    const filters = statusFilters(calls)
    // upcoming (eq confirmed) + pending_approval (in) + week (not in)
    expect(filters).toEqual([
      { method: 'eq', args: ['status', 'confirmed'] },
      { method: 'in', args: ['status', ['pending_approval']] },
      { method: 'not', args: ['status', 'in', '(cancelled_parent,cancelled_coach,pending_payment)'] },
    ])
  })
})
