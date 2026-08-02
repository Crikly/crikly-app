/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TermsAcceptanceForm } from '@/components/auth/TermsAcceptanceForm'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}))

// Chainable Supabase client mock — resolves the active_role read.
const mockSingle = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: () => {
      const chain: Record<string, jest.Mock> = {}
      for (const m of ['select', 'eq']) {
        chain[m] = jest.fn(() => chain)
      }
      chain.single = mockSingle
      return chain
    },
  }),
}))

function mockFetchRoutes(handlers: {
  acceptTerms?: { ok: boolean }
  guestBookings?: { ok: boolean; count?: number; reject?: boolean }
}) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/auth/accept-terms')) {
      const ok = handlers.acceptTerms?.ok ?? true
      return { ok, json: async () => (ok ? { success: true } : { error: null }) } as Response
    }
    if (url.includes('/api/auth/guest-bookings')) {
      if (handlers.guestBookings?.reject) throw new Error('network down')
      const ok = handlers.guestBookings?.ok ?? true
      return {
        ok,
        json: async () => ({ success: ok, count: handlers.guestBookings?.count ?? 0 }),
      } as Response
    }
    throw new Error(`unexpected fetch: ${url}`)
  }) as unknown as typeof fetch
}

async function acceptTerms() {
  fireEvent.click(screen.getByTestId('terms-checkbox'))
  fireEvent.click(screen.getByTestId('terms-continue'))
  await waitFor(() => expect(push).toHaveBeenCalled())
}

describe('TermsAcceptanceForm — P-04-B guest-booking check', () => {
  beforeEach(() => jest.clearAllMocks())

  it('parent with unclaimed guest bookings routes to /parent/link-bookings', async () => {
    mockSingle.mockResolvedValue({ data: { active_role: 'parent' }, error: null })
    mockFetchRoutes({ guestBookings: { ok: true, count: 2 } })
    render(<TermsAcceptanceForm />)
    await acceptTerms()
    expect(push).toHaveBeenCalledWith('/parent/link-bookings')
  })

  it('parent with no guest bookings routes straight to /parent/dashboard', async () => {
    mockSingle.mockResolvedValue({ data: { active_role: 'parent' }, error: null })
    mockFetchRoutes({ guestBookings: { ok: true, count: 0 } })
    render(<TermsAcceptanceForm />)
    await acceptTerms()
    expect(push).toHaveBeenCalledWith('/parent/dashboard')
  })

  it('player role also runs the guest check', async () => {
    mockSingle.mockResolvedValue({ data: { active_role: 'player' }, error: null })
    mockFetchRoutes({ guestBookings: { ok: true, count: 1 } })
    render(<TermsAcceptanceForm />)
    await acceptTerms()
    expect(push).toHaveBeenCalledWith('/parent/link-bookings')
  })

  it('a failed guest check degrades to /parent/dashboard — auth never blocked', async () => {
    mockSingle.mockResolvedValue({ data: { active_role: 'parent' }, error: null })
    mockFetchRoutes({ guestBookings: { reject: true, ok: false } })
    render(<TermsAcceptanceForm />)
    await acceptTerms()
    expect(push).toHaveBeenCalledWith('/parent/dashboard')
  })

  it('coach routing is untouched — no guest check fires', async () => {
    mockSingle.mockResolvedValue({ data: { active_role: 'coach' }, error: null })
    mockFetchRoutes({})
    render(<TermsAcceptanceForm />)
    await acceptTerms()
    expect(push).toHaveBeenCalledWith('/coach/dashboard')
    const calls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(calls.some((url) => url.includes('guest-bookings'))).toBe(false)
  })
})
