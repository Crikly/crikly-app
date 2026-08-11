/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { PublicHeader } from '@/components/nav/PublicHeader'

// The dropdown owns its own auth resolution and is covered by its usage on
// the public pages — stub it so this suite only exercises the header shell.
jest.mock('@/components/nav/ProfileDropdown', () => ({
  ProfileDropdown: () => <div data-testid="profile-dropdown" />,
}))

const mockGetUser = jest.fn()
let authChangeCallback: ((event: string, session: unknown) => void) | null =
  null
const mockUnsubscribe = jest.fn()
const mockOnAuthStateChange = jest.fn(
  (cb: (event: string, session: unknown) => void) => {
    authChangeCallback = cb
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
  },
)
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser, onAuthStateChange: mockOnAuthStateChange },
  }),
}))

// BUG-60: with hideWhenAuthed the whole header disappears once a session
// resolves — the landing page AppShell is then the only nav bar.

describe('PublicHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    authChangeCallback = null
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  it('renders logo, marketing links and the dropdown by default', () => {
    render(<PublicHeader />)
    expect(screen.getByLabelText('Crikly home')).toBeInTheDocument()
    expect(screen.getByText('How it works')).toBeInTheDocument()
    expect(screen.getByText('Activities')).toBeInTheDocument()
    expect(screen.getByText('For coaches')).toBeInTheDocument()
    expect(screen.getByTestId('profile-dropdown')).toBeInTheDocument()
    // Without hideWhenAuthed there is no auth check at all.
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('hideWhenAuthed: keeps rendering for logged-out visitors', async () => {
    render(<PublicHeader hideWhenAuthed />)
    await waitFor(() => expect(mockGetUser).toHaveBeenCalled())
    expect(screen.getByLabelText('Crikly home')).toBeInTheDocument()
  })

  it('hideWhenAuthed: renders nothing once a session resolves (BUG-60)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { container } = render(<PublicHeader hideWhenAuthed />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })

  it('hideWhenAuthed: reappears after sign-out via onAuthStateChange', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { container } = render(<PublicHeader hideWhenAuthed />)
    await waitFor(() => expect(container.firstChild).toBeNull())

    act(() => authChangeCallback?.('SIGNED_OUT', null))
    expect(screen.getByLabelText('Crikly home')).toBeInTheDocument()
  })
})
