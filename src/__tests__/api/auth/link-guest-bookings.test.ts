// P-04-B: POST /api/auth/link-guest-bookings — atomic guest→account
// transfer. No request body: everything derives from the verified session.

const mockGetUser = jest.fn()
const mockSingle = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: () => {
      const chain: Record<string, jest.Mock> = {}
      for (const m of ['select', 'eq']) chain[m] = jest.fn(() => chain)
      chain.single = mockSingle
      return chain
    },
  }),
}))

const mockRpc = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mockRpc }),
}))

const mockFindGuestBookings = jest.fn()
jest.mock('@/lib/auth/guest-linking', () => ({
  findGuestBookings: (email: string) => mockFindGuestBookings(email),
}))

import { POST } from '@/app/api/auth/link-guest-bookings/route'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'auth-1', email: 'guest@example.com' } },
    error: null,
  })
  mockSingle.mockResolvedValue({
    data: { id: 'profile-1', is_provisional: false },
    error: null,
  })
})

describe('POST /api/auth/link-guest-bookings', () => {
  it('401s without a session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls the RPC with server-derived profile ids only', async () => {
    mockFindGuestBookings.mockResolvedValue({
      matches: [{ id: 'b1' }],
      provisionalProfileIds: ['prov-1', 'prov-2'],
    })
    mockRpc.mockResolvedValue({ data: { bookings: 2, enrolments: 1 }, error: null })

    const res = await POST()
    const data = await res.json()
    expect(data).toEqual({ success: true, bookings: 2, enrolments: 1 })
    expect(mockRpc).toHaveBeenCalledWith('link_provisional_bookings', {
      p_target_profile_id: 'profile-1',
      p_provisional_profile_ids: ['prov-1', 'prov-2'],
    })
    expect(mockFindGuestBookings).toHaveBeenCalledWith('guest@example.com')
  })

  it('no-ops cleanly when nothing is left to link', async () => {
    mockFindGuestBookings.mockResolvedValue({ matches: [], provisionalProfileIds: [] })
    const res = await POST()
    const data = await res.json()
    expect(data).toEqual({ success: true, bookings: 0, enrolments: 0 })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('500s when the RPC fails — nothing partially applied', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockFindGuestBookings.mockResolvedValue({
      matches: [{ id: 'b1' }],
      provisionalProfileIds: ['prov-1'],
    })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const res = await POST()
    expect(res.status).toBe(500)
    consoleSpy.mockRestore()
  })
})
