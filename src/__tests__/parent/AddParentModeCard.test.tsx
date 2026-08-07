/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AddParentModeCard } from '@/components/parent/AddParentModeCard'

jest.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))
jest.mock('@gsap/react', () => ({
  useGSAP: () => undefined,
}))
jest.mock('gsap', () => ({
  gsap: {
    to: jest.fn(),
    fromTo: jest.fn(),
    set: jest.fn(),
  },
}))

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

const mockUpdateEq = jest.fn().mockResolvedValue({ error: null })
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }))
const mockGetUser = jest
  .fn()
  .mockResolvedValue({ data: { user: { id: 'auth-1' } } })
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ update: mockUpdate }),
  }),
}))

describe('AddParentModeCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdateEq.mockResolvedValue({ error: null })
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  it('pre-fills the name from the coach account', () => {
    render(<AddParentModeCard initialName="Alex Stuart" />)
    expect(screen.getByLabelText('Your name')).toHaveValue('Alex Stuart')
  })

  it('submits via POST /api/auth/roles and routes to the parent dashboard', async () => {
    render(<AddParentModeCard initialName="Alex Stuart" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add parent account' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/dashboard'))
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'parent' }),
    })
    // Unchanged name → no profile write.
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })

  it('persists an edited name to user_profiles before adding the role', async () => {
    render(<AddParentModeCard initialName="Alex Stuart" />)
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Alexandra Stuart' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add parent account' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/dashboard'))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Alexandra Stuart' }),
    )
  })

  it('shows an inline error and stays put when the role POST fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: 'Could not save your role. Please try again.' },
      }),
    })
    render(<AddParentModeCard initialName="Alex Stuart" />)
    fireEvent.click(screen.getByRole('button', { name: 'Add parent account' }))

    await screen.findByRole('alert')
    expect(
      screen.getByText('Could not save your role. Please try again.'),
    ).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
