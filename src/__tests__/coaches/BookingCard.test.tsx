/** @jest-environment jsdom */
// BUG-75 — the coach profile's desktop BookingCard CTA is auth-aware: a
// signed-in parent (authedAvailabilityHref set by the server page) routes to
// the auth-aware booking flow; everyone else keeps the guest checkout href
// with its slot prefill, unchanged.

import React from 'react'
import { render, screen } from '@testing-library/react'

// Slot comes from the URL params so the component skips its availability
// fetch — deterministic, no network. The instance MUST be stable across
// renders: BookingCard's effect depends on the searchParams identity, and a
// fresh object per call causes an infinite effect → setState → render loop.
const mockSearchParams = new URLSearchParams('date=2026-08-27&time=10:00')
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
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

import { BookingCard } from '@/app/coaches/[id]/_components/BookingCard'
import type { BookingCardProps } from '@/app/coaches/[id]/_components/BookingCard'

const BASE: BookingCardProps = {
  coachId: 'c0a80000-0000-0000-0000-000000000001',
  sports: [
    {
      sport_id: 's-1',
      sport_name: 'Cricket',
      session_types: ['individual'],
      price_individual_pence: 5500,
      price_group_pence: null,
      session_duration_minutes: 60,
    },
  ],
  priceFrom: 5500,
  ratingAvg: 4.9,
  ratingCount: 12,
}

describe('BookingCard (BUG-75)', () => {
  it('guest (no authedAvailabilityHref): CTA keeps the guest checkout href with slot prefill', () => {
    render(<BookingCard {...BASE} />)
    const cta = screen.getByTestId('desktop-book-cta')
    const href = cta.getAttribute('href') ?? ''
    expect(href.startsWith(`/book/${BASE.coachId}?`)).toBe(true)
    expect(href).toContain('date=2026-08-27')
    expect(href).toContain('startTime=10%3A00')
    expect(href).not.toContain('/availability')
  })

  it('explicit null authedAvailabilityHref behaves identically to omitting it', () => {
    render(<BookingCard {...BASE} authedAvailabilityHref={null} />)
    const href = screen.getByTestId('desktop-book-cta').getAttribute('href') ?? ''
    expect(href.startsWith(`/book/${BASE.coachId}?`)).toBe(true)
  })

  it('signed-in parent: CTA routes to the auth-aware availability flow', () => {
    render(
      <BookingCard
        {...BASE}
        authedAvailabilityHref="/coaches/ravi-patel/availability"
      />,
    )
    expect(screen.getByTestId('desktop-book-cta')).toHaveAttribute(
      'href',
      '/coaches/ravi-patel/availability',
    )
  })
})
