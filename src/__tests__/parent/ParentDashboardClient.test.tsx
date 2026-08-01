/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { ParentDashboardClient } from '@/components/parent/dashboard/ParentDashboardClient'
import type { ParentDashboardData } from '@/components/parent/dashboard/types'

// Reduced motion forced on: every GSAP path short-circuits (the spec
// requirement under test) and the child-switch cross-fade falls through
// to a synchronous state update, keeping assertions deterministic.
jest.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))
jest.mock('@gsap/react', () => ({
  useGSAP: () => undefined,
}))
jest.mock('gsap', () => ({
  gsap: {
    to: jest.fn(),
    from: jest.fn(),
    fromTo: jest.fn(),
    set: jest.fn(),
    killTweensOf: jest.fn(),
  },
}))

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}))

function makeData(
  overrides: Partial<ParentDashboardData> = {},
): ParentDashboardData {
  return {
    firstName: 'Sarah',
    playerMode: false,
    locationCity: 'Kingston',
    children: [
      { id: 'c1', fullName: 'Emma Carter', firstName: 'Emma', colour: '#0d9488' },
      { id: 'c2', fullName: 'Liam Carter', firstName: 'Liam', colour: '#f97316' },
    ],
    sessions: [
      {
        id: 's1',
        childProfileId: 'c1',
        coachName: 'Coach Dave',
        sportName: 'Cricket',
        dateLabel: 'Sat 9 Aug',
        timeLabel: '10:00',
        venueName: 'Kingston Cricket Club',
        daysUntil: 3,
      },
    ],
    programmes: [],
    lifetimeBookingsCount: 0,
    ...overrides,
  }
}

describe('ParentDashboardClient', () => {
  beforeEach(() => jest.clearAllMocks())

  it('greets the parent and books for the first child by default', () => {
    render(<ParentDashboardClient data={makeData()} />)
    expect(screen.getByText('Hi Sarah')).toBeInTheDocument()
    expect(screen.getByTestId('hero-subline')).toHaveTextContent(
      "You're booking for Emma today.",
    )
    expect(screen.getByTestId('search-cta')).toHaveTextContent(
      'Find a cricket coach for Emma',
    )
  })

  it('switching the active child updates subline, CTA and sessions', () => {
    render(<ParentDashboardClient data={makeData()} />)
    expect(screen.getByTestId('session-card')).toHaveTextContent('Coach Dave')

    fireEvent.click(screen.getByTestId('child-bubble-c2'))

    expect(screen.getByTestId('hero-subline')).toHaveTextContent(
      "You're booking for Liam today.",
    )
    expect(screen.getByTestId('search-cta')).toHaveTextContent(
      'Find a cricket coach for Liam',
    )
    // Liam has no sessions — Emma's card swaps out for the empty state.
    expect(screen.queryByTestId('session-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('sessions-empty-state')).toHaveTextContent(
      "Liam's next session will show up here.",
    )
  })

  it('marks only the active child bubble as pressed', () => {
    render(<ParentDashboardClient data={makeData()} />)
    expect(screen.getByTestId('child-bubble-c1')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('child-bubble-c2')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('player mode: self-booking copy, no child bubbles, no CTA name suffix', () => {
    render(
      <ParentDashboardClient
        data={makeData({ playerMode: true, children: [], sessions: [] })}
      />,
    )
    expect(screen.getByTestId('hero-subline')).toHaveTextContent(
      'Ready to find a coach? Search and book below.',
    )
    expect(screen.queryByTestId('child-bubble-row')).not.toBeInTheDocument()
    expect(screen.getByTestId('search-cta')).toHaveTextContent(
      /^Find a cricket coach$/,
    )
  })

  it('parent with no children yet gets the add-child prompt', () => {
    render(<ParentDashboardClient data={makeData({ children: [], sessions: [] })} />)
    expect(screen.getByTestId('hero-subline')).toHaveTextContent(
      'Add your child to start booking sessions.',
    )
    expect(screen.getByTestId('add-child-bubble')).toHaveAttribute(
      'href',
      '/parent/children/new',
    )
  })

  it('shows "How booking works" only for zero lifetime bookings', () => {
    const { rerender } = render(<ParentDashboardClient data={makeData()} />)
    expect(screen.getByTestId('how-booking-works')).toBeInTheDocument()

    rerender(
      <ParentDashboardClient data={makeData({ lifetimeBookingsCount: 3 })} />,
    )
    expect(screen.queryByTestId('how-booking-works')).not.toBeInTheDocument()
  })

  it('hides the programmes section entirely when there are none', () => {
    render(<ParentDashboardClient data={makeData()} />)
    expect(screen.queryByTestId('programmes-row')).not.toBeInTheDocument()
  })

  it('renders programme cards with spots badge and price', () => {
    render(
      <ParentDashboardClient
        data={makeData({
          programmes: [
            {
              id: 'p1',
              title: 'Junior Nets',
              coachName: 'Coach Dave',
              venueName: 'Kingston CC',
              nextDateLabel: 'Sat 9 Aug',
              spotsRemaining: 4,
              priceLabel: '£12 / session',
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('Cricket programmes near Kingston')).toBeInTheDocument()
    const card = screen.getByTestId('programme-card')
    expect(card).toHaveTextContent('Junior Nets')
    expect(card).toHaveTextContent('4 spots left')
    expect(card).toHaveTextContent('£12 / session')
  })
})
