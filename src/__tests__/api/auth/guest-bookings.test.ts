// P-04-B: GET /api/auth/guest-bookings — count of unclaimed guest
// bookings for the verified session email. Registration-path endpoint:
// every failure degrades to count 0.

const mockGetUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const mockFindGuestBookings = jest.fn()
jest.mock('@/lib/auth/guest-linking', () => ({
  findGuestBookings: (email: string) => mockFindGuestBookings(email),
}))

import { GET } from '@/app/api/auth/guest-bookings/route'

beforeEach(() => jest.clearAllMocks())

describe('GET /api/auth/guest-bookings', () => {
  it('401s without a session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns the match count using the VERIFIED session email', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'guest@example.com' } },
      error: null,
    })
    mockFindGuestBookings.mockResolvedValue({
      matches: [{ id: 'b1' }, { id: 'e1' }],
      provisionalProfileIds: ['p1'],
    })
    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ success: true, count: 2 })
    expect(mockFindGuestBookings).toHaveBeenCalledWith('guest@example.com')
  })

  it('degrades to count 0 when the scan throws — never blocks registration', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'guest@example.com' } },
      error: null,
    })
    mockFindGuestBookings.mockRejectedValue(new Error('stripe down'))
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toEqual({ success: true, count: 0 })
    consoleSpy.mockRestore()
  })

  it('returns count 0 for a session with no email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await GET()
    const data = await res.json()
    expect(data).toEqual({ success: true, count: 0 })
    expect(mockFindGuestBookings).not.toHaveBeenCalled()
  })
})
