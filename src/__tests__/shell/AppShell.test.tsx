/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppShell } from '@/components/shell/AppShell'

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
  usePathname: () => '/parent/dashboard',
}))

// auth.getUser resolves to no user by default: the coach-context notification
// fetch and the landing selfFetch both bail out early, keeping the Supabase
// mock minimal. Individual tests override where identity resolution matters.
const mockGetUser = jest.fn().mockResolvedValue({ data: { user: null } })
// BUG-60: selfFetch mode subscribes to auth changes so sign-out on the
// landing page tears the shell down.
const mockUnsubscribe = jest.fn()
const mockOnAuthStateChange = jest.fn(() => ({
  data: { subscription: { unsubscribe: mockUnsubscribe } },
}))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signOut: jest.fn(),
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: jest.fn(),
  }),
}))

jest.mock('@/lib/onboarding-cache', () => ({
  fetchCoachProfileCached: jest.fn().mockResolvedValue(null),
}))

const identity = {
  name: 'Sarah Carter',
  email: 'sarah@example.com',
  avatarUrl: null,
  roles: ['parent'] as ('coach' | 'parent' | 'player')[],
}

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    // P-06: ParentTodoBadge mounts inside parent context and fetches on
    // mount. Default to count 0 so it stays invisible (null render) for
    // every pre-existing assertion in this file that doesn't care about it.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ count: 0, items: [] }),
    })
  })

  it('renders logo, role pill and avatar in the 48px bar', () => {
    render(<AppShell context="parent" activeRole="parent" {...identity} />)
    expect(screen.getByLabelText('Crikly home')).toBeInTheDocument()
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Parent')
    expect(screen.getByTestId('parent-nav-avatar')).toBeInTheDocument()
  })

  it('shows the parent module links only in parent context', () => {
    const { rerender } = render(
      <AppShell context="parent" activeRole="parent" {...identity} />,
    )
    expect(screen.getByText('Find a coach')).toBeInTheDocument()
    expect(screen.getByText('My bookings')).toBeInTheDocument()

    rerender(
      <AppShell
        context="coach"
        activeRole="coach"
        {...identity}
        roles={['coach']}
      />,
    )
    expect(screen.queryByText('Find a coach')).not.toBeInTheDocument()
  })

  it('shows the marketing links only in landing context (BUG-59)', () => {
    const { rerender } = render(
      <AppShell context="landing" activeRole="parent" {...identity} />,
    )
    expect(screen.getByText('How it works')).toBeInTheDocument()
    expect(screen.getByText('Activities')).toBeInTheDocument()
    expect(screen.getByText('For coaches')).toBeInTheDocument()
    expect(screen.queryByText('Find a coach')).not.toBeInTheDocument()

    rerender(<AppShell context="parent" activeRole="parent" {...identity} />)
    expect(screen.queryByText('How it works')).not.toBeInTheDocument()

    rerender(
      <AppShell
        context="coach"
        activeRole="coach"
        {...identity}
        roles={['coach']}
      />,
    )
    expect(screen.queryByText('How it works')).not.toBeInTheDocument()
  })

  it('opens the account popover with name, email and role-aware Settings', () => {
    render(<AppShell context="parent" activeRole="parent" {...identity} />)
    fireEvent.click(screen.getByTestId('parent-nav-avatar'))
    const popover = screen.getByTestId('profile-popover')
    expect(popover).toHaveAttribute('aria-hidden', 'false')
    expect(screen.getByText('Sarah Carter')).toBeInTheDocument()
    expect(screen.getByText('sarah@example.com')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Settings'))
    expect(push).toHaveBeenCalledWith('/parent/settings')
  })

  it('coach context: popover Share profile dispatches crikly:open-share-modal', () => {
    const listener = jest.fn()
    window.addEventListener('crikly:open-share-modal', listener)
    render(
      <AppShell
        context="coach"
        activeRole="coach"
        {...identity}
        roles={['coach']}
      />,
    )
    fireEvent.click(screen.getByTestId('parent-nav-avatar'))
    fireEvent.click(screen.getByText('Share profile'))
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('crikly:open-share-modal', listener)
  })

  it('parent context: popover has no Share profile row', () => {
    render(<AppShell context="parent" activeRole="parent" {...identity} />)
    fireEvent.click(screen.getByTestId('parent-nav-avatar'))
    expect(screen.queryByText('Share profile')).not.toBeInTheDocument()
  })

  it('popover Dashboard routes to the active role dashboard (BUG-58)', () => {
    render(<AppShell context="parent" activeRole="parent" {...identity} />)
    fireEvent.click(screen.getByTestId('parent-nav-avatar'))
    fireEvent.click(screen.getByText('Dashboard'))
    expect(push).toHaveBeenCalledWith('/parent/dashboard')
  })

  it('coach context: popover shows full_name + My Profile with status badge (BUG-58)', () => {
    render(
      <AppShell
        context="coach"
        activeRole="coach"
        {...identity}
        roles={['coach']}
        name="Coach Sarah"
        fullName="Sarah Carter"
        coachStatus="live"
      />,
    )
    fireEvent.click(screen.getByTestId('parent-nav-avatar'))
    // Popover header shows the account full_name, not the display_name.
    expect(screen.getByText('Sarah Carter')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    fireEvent.click(screen.getByText('My Profile'))
    expect(push).toHaveBeenCalledWith('/coach/profile/edit')
  })

  it('parent context: popover has no My Profile row', () => {
    render(<AppShell context="parent" activeRole="parent" {...identity} />)
    fireEvent.click(screen.getByTestId('parent-nav-avatar'))
    expect(screen.queryByText('My Profile')).not.toBeInTheDocument()
  })

  it('selfFetch (landing): renders nothing while logged out', async () => {
    const { container } = render(<AppShell context="landing" selfFetch />)
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('P-06: mounts the To-Do badge in parent context', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        items: [{ type: 'add_child', href: '/parent/children/new' }],
      }),
    })
    render(<AppShell context="parent" activeRole="parent" {...identity} />)
    expect(await screen.findByTestId('parent-todo-badge')).toBeInTheDocument()
  })

  it('P-06: does not mount the To-Do badge in coach context', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        count: 1,
        items: [{ type: 'add_child', href: '/parent/children/new' }],
      }),
    })
    render(
      <AppShell
        context="coach"
        activeRole="coach"
        {...identity}
        roles={['coach']}
      />,
    )
    // Give the (non-existent) badge's fetch a tick to have fired if it were
    // present, then assert it never mounted.
    await waitFor(() => expect(screen.getByTestId('app-shell')).toBeInTheDocument())
    expect(screen.queryByTestId('parent-todo-badge')).not.toBeInTheDocument()
  })
})
