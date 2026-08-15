/** @jest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// P-06: the parent To-Do badge. GSAP animation, motion-preference and the
// route-change trigger are all mocked so behaviour (fetch on mount + on
// pathname change, open/close, row copy/hrefs) can be tested deterministically
// in jsdom — mirrors RolePill.test.tsx / ProfilePopover.test.tsx / AppShell.test.tsx.

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

// usePathname is mutable so the "re-fetch on route change" test can move it
// between renders and assert the effect re-runs (mockPathname prefix is
// required — jest.mock factories may only reference out-of-scope names that
// start with "mock").
let mockPathname = '/parent/dashboard'
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

// next/link — renders an <a> so href assertions work in jsdom
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

import { ParentTodoBadge } from '@/components/parent/ParentTodoBadge'
import type { ParentTodoResponse } from '@/app/api/parent/todo/route'

function mockFetchResolvedOnce(body: ParentTodoResponse, ok = true): void {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    json: async () => body,
  })
}

const THREE_ITEMS: ParentTodoResponse = {
  count: 3,
  items: [
    { type: 'add_child', href: '/parent/children/new' },
    { type: 'complete_booking', href: '/book/coach-123-uuid' },
    { type: 'link_bookings', href: '/parent/link-bookings' },
  ],
}

describe('ParentTodoBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/parent/dashboard'
    global.fetch = jest.fn()
  })

  it('renders nothing when the endpoint returns { count: 0, items: [] }', async () => {
    mockFetchResolvedOnce({ count: 0, items: [] })
    const { container } = render(<ParentTodoBadge />)

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/parent/todo'),
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByTestId('parent-todo-badge')).not.toBeInTheDocument()
  })

  it('renders nothing when fetch rejects (advisory chrome — never crashes)', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'))
    const { container } = render(<ParentTodoBadge />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the endpoint responds !ok', async () => {
    mockFetchResolvedOnce({ count: 0, items: [] }, false)
    const { container } = render(<ParentTodoBadge />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(container.firstChild).toBeNull()
  })

  it('renders the badge with the correct count when items exist', async () => {
    mockFetchResolvedOnce(THREE_ITEMS)
    render(<ParentTodoBadge />)

    await screen.findByTestId('parent-todo-badge')
    expect(screen.getByTestId('parent-todo-count')).toHaveTextContent('3')
  })

  it('opening shows the three rows with correct titles, CTAs and hrefs', async () => {
    mockFetchResolvedOnce(THREE_ITEMS)
    render(<ParentTodoBadge />)

    const trigger = await screen.findByTestId('parent-todo-badge')
    fireEvent.click(trigger)

    const dropdown = screen.getByTestId('parent-todo-dropdown')

    const addChildRow = within(dropdown).getByTestId('todo-item-add_child')
    expect(addChildRow).toHaveTextContent('Add a child')
    expect(within(addChildRow).getByText('Add now').closest('a')).toHaveAttribute(
      'href',
      '/parent/children/new',
    )

    const completeBookingRow = within(dropdown).getByTestId(
      'todo-item-complete_booking',
    )
    expect(completeBookingRow).toHaveTextContent('Finish your booking')
    // href must pass through verbatim from the API item — never re-derived.
    expect(
      within(completeBookingRow).getByText('Continue').closest('a'),
    ).toHaveAttribute('href', '/book/coach-123-uuid')

    const linkBookingsRow = within(dropdown).getByTestId('todo-item-link_bookings')
    expect(linkBookingsRow).toHaveTextContent('Link past bookings')
    expect(
      within(linkBookingsRow).getByText('Link bookings').closest('a'),
    ).toHaveAttribute('href', '/parent/link-bookings')
  })

  it("clicking a row's CTA link closes the panel", async () => {
    mockFetchResolvedOnce(THREE_ITEMS)
    render(<ParentTodoBadge />)

    const trigger = await screen.findByTestId('parent-todo-badge')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    const dropdown = screen.getByTestId('parent-todo-dropdown')
    fireEvent.click(within(dropdown).getByText('Add now'))

    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape', async () => {
    mockFetchResolvedOnce(THREE_ITEMS)
    render(<ParentTodoBadge />)

    const trigger = await screen.findByTestId('parent-todo-badge')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on an outside mousedown', async () => {
    mockFetchResolvedOnce(THREE_ITEMS)
    render(<ParentTodoBadge />)

    const trigger = await screen.findByTestId('parent-todo-badge')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.mouseDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('re-fetches on pathname change; badge disappears once the action resolves', async () => {
    mockFetchResolvedOnce(THREE_ITEMS)
    const { rerender } = render(<ParentTodoBadge />)

    await screen.findByTestId('parent-todo-badge')
    expect(global.fetch).toHaveBeenCalledTimes(1)

    mockFetchResolvedOnce({ count: 0, items: [] })
    mockPathname = '/parent/children/new'
    rerender(<ParentTodoBadge />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(screen.queryByTestId('parent-todo-badge')).not.toBeInTheDocument(),
    )
  })
})
