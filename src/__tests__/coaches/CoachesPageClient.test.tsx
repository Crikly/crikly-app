/** @jest-environment jsdom */
// BUG-73 — /coaches listing is auth-aware. A signed-in parent gets the
// parent AppShell and card links straight to the auth-aware booking flow
// (/coaches/[slug]/availability); everyone else gets the public header and
// profile links, byte-identical to before.

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/coaches',
}))

// AppShell resolves identity/notifications internally — mock to a marker so
// this test only asserts WHICH shell the page picked.
jest.mock('@/components/shell/AppShell', () => ({
  AppShell: () => <div data-testid="app-shell" />,
}))

jest.mock('next/link', () => {
  const MockLink = ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

// next/image → plain img (fill/priority props stripped)
jest.mock('next/image', () => {
  const MockImage = ({
    src,
    alt,
  }: {
    src: string
    alt: string
    [key: string]: unknown
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  )
  MockImage.displayName = 'MockImage'
  return MockImage
})

import {
  CoachesPageClient,
  type AuthedParentShell,
} from '@/app/coaches/CoachesPageClient'
import type { PublicCoachListItem } from '@/components/public/CoachCard'

const COACH: PublicCoachListItem = {
  coach_profile_id: 'c-1',
  slug: 'ravi-patel',
  display_name: 'Ravi Patel',
  location_city: 'Kingston',
  avatar_url: null,
  sport_id: 's-1',
  sport_slug: 'cricket',
  sport_name: 'Cricket',
  price_individual_pence: 5500,
  currency: 'GBP',
  rating_avg: 4.9,
  rating_count: 12,
}

const PARENT: AuthedParentShell = {
  name: 'Sarah Carter',
  email: 'sarah@example.com',
  avatarUrl: null,
  activeRole: 'parent',
  roles: ['parent'],
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest
      .fn()
      .mockResolvedValue({ coaches: [COACH], pagination: { has_more: false } }),
  } as unknown as Response)
})

afterEach(() => {
  jest.clearAllMocks()
})

async function waitForCoachCard() {
  await waitFor(() => {
    expect(screen.getByText('Ravi Patel')).toBeInTheDocument()
  })
}

describe('CoachesPageClient (BUG-73)', () => {
  it('guest: public header with Log in / Get started, no AppShell', async () => {
    render(<CoachesPageClient authedParent={null} />)
    await waitForCoachCard()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(screen.getByRole('link', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument()
  })

  it('guest: coach card links to the public profile route', async () => {
    render(<CoachesPageClient authedParent={null} />)
    await waitForCoachCard()
    const card = screen.getByText('Ravi Patel').closest('a')
    expect(card).toHaveAttribute('href', '/coaches/ravi-patel')
  })

  it('signed-in parent: renders the AppShell instead of the public header', async () => {
    render(<CoachesPageClient authedParent={PARENT} />)
    await waitForCoachCard()
    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Get started' }),
    ).not.toBeInTheDocument()
  })

  it('signed-in parent: coach card links to the auth-aware booking flow', async () => {
    render(<CoachesPageClient authedParent={PARENT} />)
    await waitForCoachCard()
    const card = screen.getByText('Ravi Patel').closest('a')
    expect(card).toHaveAttribute('href', '/coaches/ravi-patel/availability')
  })

  it('both variants render the search form and page heading', async () => {
    const { unmount } = render(<CoachesPageClient authedParent={null} />)
    await waitForCoachCard()
    expect(
      screen.getByRole('heading', { name: 'Find a cricket coach' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Where')).toBeInTheDocument()
    unmount()

    render(<CoachesPageClient authedParent={PARENT} />)
    await waitForCoachCard()
    expect(
      screen.getByRole('heading', { name: 'Find a cricket coach' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Where')).toBeInTheDocument()
  })
})
