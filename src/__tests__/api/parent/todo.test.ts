jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: () => [],
    set: jest.fn(),
  })),
}))

// P-06: guest-linking hits Stripe + the admin client — always mocked here.
jest.mock('@/lib/auth/guest-linking', () => ({
  findGuestBookings: jest.fn(),
}))

import { createServerClient } from '@supabase/ssr'
import { findGuestBookings } from '@/lib/auth/guest-linking'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type ChainResult = { data?: unknown; error?: unknown; count?: number | null }

// One chain per table. Non-terminal methods return the chain; terminals
// (single/maybeSingle) resolve, and the chain itself is awaitable for
// head-count queries (`await ...is(...)` destructures { count, error }).
function makeChain(terminal: ChainResult = { data: null, error: null }) {
  const c: Record<string, jest.Mock> & {
    then?: (resolve: (v: ChainResult) => void) => void
  } = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'order', 'limit']) {
    c[m] = jest.fn(() => c)
  }
  c.single = jest.fn().mockResolvedValue(terminal)
  c.maybeSingle = jest.fn().mockResolvedValue(terminal)
  c.then = (resolve) => resolve(terminal)
  return c
}

const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockSupabase = { auth: { getUser: mockGetUser }, from: mockFrom }
const mockFindGuestBookings = findGuestBookings as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

// ─── Scenario builder ─────────────────────────────────────────────────────────

const USER = { id: 'auth-1', email: 'priya@example.com' }

interface Scenario {
  user?: { id: string; email?: string } | null
  hasParentRole?: boolean
  parentProfile?: { id: string } | null
  parentProfileError?: unknown
  childCount?: number | null
  childError?: unknown
  pendingBooking?: { id: string; coach_profile_id: string } | null
  pendingBookingError?: unknown
  guestMatches?: number
}

function setUp(s: Scenario = {}) {
  mockGetUser.mockResolvedValue({
    data: { user: s.user === undefined ? USER : s.user },
    error: null,
  })

  const chains: Record<string, ReturnType<typeof makeChain>> = {
    user_profiles: makeChain({ data: { id: 'profile-1' }, error: null }),
    user_roles: makeChain(
      s.hasParentRole === false
        ? { data: null, error: new Error('no row') }
        : { data: { role: 'parent' }, error: null },
    ),
    parent_profiles: makeChain({
      data: s.parentProfile === undefined ? { id: 'pp-1' } : s.parentProfile,
      error: s.parentProfileError ?? null,
    }),
    child_profiles: makeChain({
      count: s.childCount === undefined ? 0 : s.childCount,
      error: s.childError ?? null,
    }),
    bookings: makeChain({
      data: s.pendingBooking ?? null,
      error: s.pendingBookingError ?? null,
    }),
  }
  mockFrom.mockImplementation((table: string) => {
    const chain = chains[table]
    if (!chain) throw new Error(`Unexpected table: ${table}`)
    return chain
  })

  mockFindGuestBookings.mockResolvedValue({
    matches: Array.from({ length: s.guestMatches ?? 0 }, (_, i) => ({ id: `m-${i}` })),
    provisionalProfileIds: [],
  })

  return chains
}

async function callGet() {
  const { GET } = await import('@/app/api/parent/todo/route')
  return GET()
}

// ─── Auth guards ──────────────────────────────────────────────────────────────

describe('GET /api/parent/todo — auth guards', () => {
  it('returns 401 when unauthenticated', async () => {
    setUp({ user: null })

    const res = await callGet()
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user holds no parent role', async () => {
    setUp({ hasParentRole: false })

    const res = await callGet()
    expect(res.status).toBe(403)
  })
})

// ─── All conditions ───────────────────────────────────────────────────────────

describe('GET /api/parent/todo — all three conditions firing', () => {
  it('returns count 3 with items in design order and correct hrefs', async () => {
    setUp({
      childCount: 0,
      pendingBooking: { id: 'b-1', coach_profile_id: 'coach-9' },
      guestMatches: 2,
    })

    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(3)
    expect(body.items).toEqual([
      { type: 'add_child', href: '/parent/children/new' },
      { type: 'complete_booking', href: '/book/coach-9' },
      { type: 'link_bookings', href: '/parent/link-bookings' },
    ])
  })

  it('sends Cache-Control: no-store so a resolved action clears on next load', async () => {
    setUp()
    const res = await callGet()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

// ─── Condition 1: add_child ───────────────────────────────────────────────────

describe('GET /api/parent/todo — add_child condition', () => {
  it('fires when the parent has no parent_profiles row yet (lazy-create case)', async () => {
    setUp({ parentProfile: null })

    const body = await (await callGet()).json()
    expect(body.items).toEqual([{ type: 'add_child', href: '/parent/children/new' }])
  })

  it('does not fire when at least one child exists', async () => {
    setUp({ childCount: 2 })

    const body = await (await callGet()).json()
    expect(body.count).toBe(0)
    expect(body.items).toEqual([])
  })

  it('drops only its own item when the child query errors — never 500s', async () => {
    setUp({
      childError: new Error('db down'),
      pendingBooking: { id: 'b-1', coach_profile_id: 'coach-9' },
    })

    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([
      { type: 'complete_booking', href: '/book/coach-9' },
    ])
  })
})

// ─── Condition 2: complete_booking ────────────────────────────────────────────

describe('GET /api/parent/todo — complete_booking condition', () => {
  it('does not fire when no pending_payment booking exists', async () => {
    setUp({ childCount: 1, pendingBooking: null })

    const body = await (await callGet()).json()
    expect(body.items).toEqual([])
  })

  it('filters on pending_payment status and the session user only', async () => {
    const chains = setUp({
      childCount: 1,
      pendingBooking: { id: 'b-1', coach_profile_id: 'coach-9' },
    })

    await callGet()
    expect(chains.bookings!.eq).toHaveBeenCalledWith('booked_by_user_id', 'profile-1')
    expect(chains.bookings!.eq).toHaveBeenCalledWith('status', 'pending_payment')
    expect(chains.bookings!.is).toHaveBeenCalledWith('deleted_at', null)
  })
})

// ─── Condition 3: link_bookings ───────────────────────────────────────────────

describe('GET /api/parent/todo — link_bookings condition', () => {
  it('uses only the verified session email', async () => {
    setUp({ childCount: 1, guestMatches: 1 })

    const body = await (await callGet()).json()
    expect(mockFindGuestBookings).toHaveBeenCalledWith('priya@example.com')
    expect(body.items).toEqual([
      { type: 'link_bookings', href: '/parent/link-bookings' },
    ])
  })

  it('skips the check entirely when the session has no email', async () => {
    setUp({ user: { id: 'auth-1' }, childCount: 1 })

    const body = await (await callGet()).json()
    expect(mockFindGuestBookings).not.toHaveBeenCalled()
    expect(body.items).toEqual([])
  })

  it('drops only its own item when the Stripe scan throws — never 500s', async () => {
    setUp({ childCount: 0 })
    mockFindGuestBookings.mockRejectedValue(new Error('stripe down'))

    const res = await callGet()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([{ type: 'add_child', href: '/parent/children/new' }])
  })
})
