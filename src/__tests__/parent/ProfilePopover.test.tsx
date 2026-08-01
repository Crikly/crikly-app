/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { ProfilePopover } from '@/components/shared/ProfilePopover'

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

const signOut = jest.fn().mockResolvedValue({ error: null })
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut } }),
}))

const baseProps = {
  open: true,
  onClose: jest.fn(),
  name: 'Sarah Carter',
  email: 'sarah@example.com',
  avatarUrl: null,
  hasCoachRole: false,
}

describe('ProfilePopover', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders avatar header with name and email', () => {
    render(<ProfilePopover {...baseProps} />)
    expect(screen.getByText('Sarah Carter')).toBeInTheDocument()
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('crikly-avatar')).toBeInTheDocument()
  })

  it('hides "Switch to Coach" for accounts without a coach role', () => {
    render(<ProfilePopover {...baseProps} />)
    expect(screen.queryByText('Switch to Coach')).not.toBeInTheDocument()
  })

  it('shows "Switch to Coach" for multi-role accounts and routes to the coach dashboard', () => {
    render(<ProfilePopover {...baseProps} hasCoachRole />)
    fireEvent.click(screen.getByText('Switch to Coach'))
    expect(push).toHaveBeenCalledWith('/coach/dashboard')
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('routes Settings to /parent/settings', () => {
    render(<ProfilePopover {...baseProps} />)
    fireEvent.click(screen.getByText('Settings'))
    expect(push).toHaveBeenCalledWith('/parent/settings')
  })

  it('signs out via Supabase and returns to the landing page', async () => {
    render(<ProfilePopover {...baseProps} />)
    fireEvent.click(screen.getByText('Sign out'))
    await screen.findByText('Sign out') // flush the async handler
    expect(signOut).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/')
    expect(refresh).toHaveBeenCalled()
  })

  it('is aria-hidden and non-interactive when closed', () => {
    render(<ProfilePopover {...baseProps} open={false} />)
    const panel = screen.getByTestId('profile-popover')
    expect(panel).toHaveAttribute('aria-hidden', 'true')
    expect(panel.className).toContain('pointer-events-none')
  })

  it('closes on Escape', () => {
    render(<ProfilePopover {...baseProps} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(baseProps.onClose).toHaveBeenCalled()
  })
})
