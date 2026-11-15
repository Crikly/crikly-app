/** @jest-environment jsdom */
// STAGE1-CANCEL-OFFLINE-2 (Decision T-21): a cancelled programme is a read-only
// record. It used to fall through to the Draft tab, where it was offered
// Publish / Edit / Delete. It must now be listed only under its own Cancelled
// tab, with the approved direct-refund reminder and no way back to live.

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/components/coach/ShareCardModal', () => ({
  ShareCardModal: () => null,
}))

import { ProgrammesManagement } from '@/components/coach/ProgrammesManagement'
import { PROGRAMME_CANCELLED_REMINDER } from '@/constants/programme-refunds'

function programme(overrides: Record<string, unknown>) {
  return {
    id: 'prog-x',
    sport_id: 'sport-1',
    sport_name: 'Cricket',
    title: 'Programme',
    description: null,
    schedule_type: 'fixed',
    day_of_week: 6,
    day_name: 'Saturday',
    days_of_week: [6],
    start_time: '10:00:00',
    duration_minutes: 60,
    max_spots: 10,
    current_spots: 0,
    spots_remaining: 10,
    payment_type: 'block_upfront',
    price_per_session_pence: 16000,
    block_price_pence: 16000,
    block_session_count: 4,
    currency: 'GBP',
    status: 'draft',
    created_at: '2026-10-01T00:00:00Z',
    venue_name: null,
    venue_address: null,
    min_participants: null,
    cancellation_window_hours: 24,
    image_url: null,
    age_groups: [],
    starts_at: null,
    camp_mode: false,
    ...overrides,
  }
}

const ACTIVE = programme({ id: 'prog-active', title: 'Live Nets', status: 'active', current_spots: 2 })
const DRAFT = programme({ id: 'prog-draft', title: 'Draft Nets', status: 'draft' })
const CANCELLED = programme({ id: 'prog-cancelled', title: 'Summer Camp', status: 'cancelled', current_spots: 3 })

let fetchMock: jest.Mock

function mockList(programmes: Array<Record<string, unknown>>) {
  fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ programmes }) }))
  global.fetch = fetchMock as unknown as typeof fetch
}

/** The tab buttons live in the sticky header, before the first card. */
function tab(name: RegExp) {
  return screen.getByRole('button', { name })
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
})

describe('ProgrammesManagement — cancelled programmes', () => {
  it('lists a cancelled programme only under Cancelled, and not in the Draft count', async () => {
    mockList([ACTIVE, DRAFT, CANCELLED])
    const user = userEvent.setup()
    render(<ProgrammesManagement />)

    await screen.findByText('Live Nets')
    expect(screen.queryByText('Summer Camp')).not.toBeInTheDocument()

    // Draft holds the one real draft — the cancelled programme no longer inflates it.
    expect(tab(/^Draft/)).toHaveTextContent('Draft1')
    await user.click(tab(/^Draft/))
    expect(screen.getByText('Draft Nets')).toBeInTheDocument()
    expect(screen.queryByText('Summer Camp')).not.toBeInTheDocument()

    expect(tab(/^Cancelled/)).toHaveTextContent('Cancelled1')
    await user.click(tab(/^Cancelled/))
    expect(screen.getByText('Summer Camp')).toBeInTheDocument()
    expect(screen.queryByText('Draft Nets')).not.toBeInTheDocument()
  })

  it('shows the approved reminder and a read-only card with only "View roster"', async () => {
    mockList([ACTIVE, DRAFT, CANCELLED])
    const user = userEvent.setup()
    render(<ProgrammesManagement />)

    await user.click(await screen.findByRole('button', { name: /^Cancelled/ }))

    expect(screen.getByTestId('cancelled-programmes-reminder')).toHaveTextContent(PROGRAMME_CANCELLED_REMINDER)
    expect(PROGRAMME_CANCELLED_REMINDER).toBe(
      'Cancelled programmes are kept here as a record. If parents had paid, you must refund them directly. Crikly does not refund programme fees.',
    )

    for (const name of [/^Publish$/, /^Edit$/, /^Delete$/, /^Share$/, /^Cancel$/, /^Manage/]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }

    await user.click(screen.getByTestId('cancelled-view-roster'))
    expect(mockPush).toHaveBeenCalledWith('/coach/programmes/prog-cancelled/roster')
    // Nothing was sent to the API beyond the initial list load.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('opens a read-only detail drawer: no Edit, Preview or Share', async () => {
    mockList([CANCELLED])
    const user = userEvent.setup()
    render(<ProgrammesManagement />)

    await user.click(await screen.findByRole('button', { name: /^Cancelled/ }))
    await user.click(screen.getByText('Summer Camp'))

    const rosterButton = await screen.findByTestId('cancelled-detail-view-roster')
    expect(screen.queryByRole('button', { name: /^Edit$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Preview/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Share/ })).not.toBeInTheDocument()

    await user.click(rosterButton)
    expect(mockPush).toHaveBeenCalledWith('/coach/programmes/prog-cancelled/roster')
    expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/edit'))
  })

  it('hides the Cancelled tab when nothing has been cancelled', async () => {
    mockList([ACTIVE, DRAFT])
    render(<ProgrammesManagement />)

    await screen.findByText('Live Nets')
    expect(screen.queryByRole('button', { name: /^Cancelled/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('cancelled-programmes-reminder')).not.toBeInTheDocument()
  })

  it('leaves draft cards unchanged: Publish, Edit and Delete are still offered', async () => {
    mockList([ACTIVE, DRAFT, CANCELLED])
    const user = userEvent.setup()
    render(<ProgrammesManagement />)

    await user.click(await screen.findByRole('button', { name: /^Draft/ }))

    const card = screen.getByText('Draft Nets').closest('div.rounded-2xl') as HTMLElement
    expect(within(card).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('leaves active cards unchanged: Edit, Share, Manage and Cancel are still offered', async () => {
    mockList([ACTIVE, DRAFT, CANCELLED])
    render(<ProgrammesManagement />)

    const card = (await screen.findByText('Live Nets')).closest('div.rounded-2xl') as HTMLElement
    for (const name of ['Edit', 'Share', 'Manage →', 'Cancel']) {
      expect(within(card).getByRole('button', { name })).toBeInTheDocument()
    }
    expect(within(card).queryByTestId('cancelled-view-roster')).not.toBeInTheDocument()
  })
})
