/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RolePill } from '@/components/shell/RolePill'

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

describe('RolePill', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('shows the active role on the pill face', () => {
    render(<RolePill activeRole="coach" roles={['coach']} />)
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Coach')
  })

  it('marks the active role row checked/bold and lists held roles', () => {
    render(<RolePill activeRole="coach" roles={['coach', 'parent']} />)
    fireEvent.click(screen.getByTestId('role-pill'))
    const activeRow = screen.getByTestId('role-row-coach')
    expect(activeRow).toHaveTextContent('Coach mode')
    expect(activeRow).toHaveAttribute('aria-current', 'true')
    expect(screen.getByTestId('role-row-parent')).toHaveTextContent(
      'Parent mode',
    )
  })

  it('shows "+ Add parent mode" only when parent role is missing', () => {
    const { rerender } = render(
      <RolePill activeRole="coach" roles={['coach']} />,
    )
    expect(screen.getByTestId('role-add-parent')).toBeInTheDocument()

    rerender(<RolePill activeRole="coach" roles={['coach', 'parent']} />)
    expect(screen.queryByTestId('role-add-parent')).not.toBeInTheDocument()
  })

  it('hides "+ Add parent mode" for a player-only account (coach-only entry point)', () => {
    render(<RolePill activeRole="player" roles={['player']} />)
    expect(screen.queryByTestId('role-add-parent')).not.toBeInTheDocument()
  })

  it('routes "+ Add parent mode" to the add-parent onboarding screen', () => {
    render(<RolePill activeRole="coach" roles={['coach']} />)
    fireEvent.click(screen.getByTestId('role-pill'))
    fireEvent.click(screen.getByTestId('role-add-parent'))
    expect(push).toHaveBeenCalledWith('/onboarding/add-parent')
  })

  it('switches an existing role via PATCH and routes to the returned dashboard', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, redirectTo: '/parent/dashboard' }),
    })
    render(<RolePill activeRole="coach" roles={['coach', 'parent']} />)
    fireEvent.click(screen.getByTestId('role-pill'))
    fireEvent.click(screen.getByTestId('role-row-parent'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/dashboard'))
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/roles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'parent' }),
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('shows an inline error when the switch fails and does not navigate', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({
        success: false,
        error: { code: 'ROLE_NOT_HELD' },
      }),
    })
    render(<RolePill activeRole="coach" roles={['coach', 'parent']} />)
    fireEvent.click(screen.getByTestId('role-pill'))
    fireEvent.click(screen.getByTestId('role-row-parent'))

    await screen.findByRole('alert')
    expect(push).not.toHaveBeenCalled()
  })

  it('is aria-hidden and non-interactive when closed', () => {
    render(<RolePill activeRole="coach" roles={['coach']} />)
    const panel = screen.getByTestId('role-pill-dropdown')
    expect(panel).toHaveAttribute('aria-hidden', 'true')
    expect(panel.className).toContain('pointer-events-none')
  })

  it('closes on Escape', () => {
    render(<RolePill activeRole="coach" roles={['coach']} />)
    fireEvent.click(screen.getByTestId('role-pill'))
    expect(screen.getByTestId('role-pill')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('role-pill')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
