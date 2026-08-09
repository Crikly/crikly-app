/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import { RoleSelectionForm } from '@/components/auth/RoleSelectionForm'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}))

describe('RoleSelectionForm — P-04-B auto-submit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('renders the three role cards normally without a preselected role', () => {
    render(<RoleSelectionForm />)
    expect(screen.getByTestId('role-card-parent')).toBeInTheDocument()
    expect(screen.getByTestId('role-card-player')).toBeInTheDocument()
    expect(screen.getByTestId('role-card-coach')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('auto-submits a preselected role and skips the picker UI', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, redirectTo: '/onboarding/terms' }),
    })
    render(<RoleSelectionForm preselectedRole="parent" />)

    // Picker skipped — setting-up state instead of cards.
    expect(screen.getByTestId('role-autosubmit-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('role-card-parent')).not.toBeInTheDocument()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/onboarding/terms'))
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/roles',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role: 'parent' }),
      }),
    )
  })

  it('falls back to the cards when the auto-submit fails', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' },
      }),
    })
    render(<RoleSelectionForm preselectedRole="player" />)

    await waitFor(() =>
      expect(screen.getByTestId('role-card-player')).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
