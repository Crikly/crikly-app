// Integration tests for GET /api/cron/auto-complete-sessions (C-PAY-01)
//
// The route is deliberately thin — auth + one RPC — because all completion
// logic (eligibility SQL, UK wall-clock handling, BR-03 payout arithmetic,
// idempotency) lives in the DB function auto_complete_due_bookings()
// (migration 044), verified against the local database. Contract under test:
//   - CRON_SECRET Bearer auth: 500 when unconfigured, 401 on wrong/missing
//     header (mirrors release-expired-bookings).
//   - Success: calls the RPC exactly once, returns { completed: n }.
//   - Non-numeric RPC data defends as completed: 0.
//   - RPC error → 500 internal_error, no throw.

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { GET } from '@/app/api/cron/auto-complete-sessions/route'

type MockFn = jest.Mock

const SECRET = 'test-cron-secret'

// Plain Request cast to the route's param type — the suite's next/server shim
// doesn't support constructing NextRequest directly (same pattern as
// release-expired-bookings.test.ts).
function makeRequest(auth?: string) {
  return new Request('http://localhost/api/cron/auto-complete-sessions', {
    headers: auth ? { authorization: auth } : {},
  }) as Parameters<typeof GET>[0]
}

function mockRpc(result: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  })
  ;(createAdminClient as MockFn).mockReturnValue({ rpc })
  return rpc
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV, CRON_SECRET: SECRET }
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('GET /api/cron/auto-complete-sessions — auth', () => {
  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const rpc = mockRpc({ data: 0 })

    const res = await GET(makeRequest(`Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 401 without an authorization header', async () => {
    const rpc = mockRpc({ data: 0 })

    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 401 on a wrong bearer token', async () => {
    const rpc = mockRpc({ data: 0 })

    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('GET /api/cron/auto-complete-sessions — run', () => {
  it('calls auto_complete_due_bookings once and returns the completed count', async () => {
    const rpc = mockRpc({ data: 5 })

    const res = await GET(makeRequest(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('auto_complete_due_bookings')
    expect(await res.json()).toEqual({ completed: 5 })
  })

  it('returns completed: 0 when the RPC reports nothing eligible', async () => {
    mockRpc({ data: 0 })

    const res = await GET(makeRequest(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ completed: 0 })
  })

  it('defends non-numeric RPC data as completed: 0', async () => {
    mockRpc({ data: null })

    const res = await GET(makeRequest(`Bearer ${SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ completed: 0 })
  })

  it('returns 500 internal_error when the RPC fails', async () => {
    mockRpc({ error: { message: 'function missing' } })

    const res = await GET(makeRequest(`Bearer ${SECRET}`))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error' })
  })
})
