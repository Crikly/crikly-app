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

// P-04-C: role switching lives in the RolePill exclusively (see
// RolePill.test.tsx). BUG-58: rows brought to ProfileDropdown parity —
// Dashboard, Settings, My Profile (coach, Live/Paused badge), Share profile
// (coach), Sign out.

const baseProps = {
  open: true,
  onClose: jest.fn(),
  name: 'Sarah Carter',
  email: 'sarah@example.com',
  dashboardHref: '/parent/dashboard',
  settingsHref: '/parent/settings',
}

describe('ProfilePopover', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders header with name and email', () => {
    render(<ProfilePopover {...baseProps} />)
    expect(screen.getByText('Sarah Carter')).toBeInTheDocument()
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
  })

  it('contains no role-switching rows (P-04-C: pill owns switching)', () => {
    render(<ProfilePopover {...baseProps} />)
    expect(screen.queryByText('Switch to Coach')).not.toBeInTheDocument()
    expect(screen.queryByText(/mode/i)).not.toBeInTheDocument()
  })

  it('routes Settings to the provided settingsHref', () => {
    render(<ProfilePopover {...baseProps} />)
    fireEvent.click(screen.getByText('Settings'))
    expect(push).toHaveBeenCalledWith('/parent/settings')
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('routes Settings to the coach settings for a coach-context href', () => {
    render(<ProfilePopover {...baseProps} settingsHref="/coach/settings" />)
    fireEvent.click(screen.getByText('Settings'))
    expect(push).toHaveBeenCalledWith('/coach/settings')
  })

  it('routes Dashboard to the active role dashboardHref (BUG-58)', () => {
    render(<ProfilePopover {...baseProps} />)
    fireEvent.click(screen.getByText('Dashboard'))
    expect(push).toHaveBeenCalledWith('/parent/dashboard')
    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('hides My Profile without a myProfileStatus prop (parent/player)', () => {
    render(<ProfilePopover {...baseProps} />)
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument()
  })

  it('shows My Profile with a Live badge and routes to the profile editor', () => {
    render(<ProfilePopover {...baseProps} myProfileStatus="live" />)
    expect(screen.getByText('Live')).toBeInTheDocument()
    fireEvent.click(screen.getByText('My Profile'))
    expect(push).toHaveBeenCalledWith('/coach/profile/edit')
  })

  it('shows a Paused badge for a paused coach profile', () => {
    render(<ProfilePopover {...baseProps} myProfileStatus="paused" />)
    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('shows My Profile without a badge when status is null (not yet live)', () => {
    render(<ProfilePopover {...baseProps} myProfileStatus={null} />)
    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
    expect(screen.queryByText('Paused')).not.toBeInTheDocument()
  })

  it('hides the Share profile row without an onShareProfile handler', () => {
    render(<ProfilePopover {...baseProps} />)
    expect(screen.queryByText('Share profile')).not.toBeInTheDocument()
  })

  it('renders Share profile in coach context and fires the handler', () => {
    const onShareProfile = jest.fn()
    render(<ProfilePopover {...baseProps} onShareProfile={onShareProfile} />)
    fireEvent.click(screen.getByText('Share profile'))
    expect(onShareProfile).toHaveBeenCalled()
    expect(baseProps.onClose).toHaveBeenCalled()
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
