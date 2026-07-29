/** @jest-environment jsdom */
// UX-01 BUG 3 + BUG 4: onboarding availability step affordances.
//
// Covered:
//   - BUG 3: a day that already has a block renders a per-day "Add another
//     time" affordance which opens the add form with that day preselected
//     (proved via the overlap warning against the existing block)
//   - BUG 4: clicking Save & continue with the add form open renders the
//     unsaved-block warning INSIDE the sticky footer (always visible), and
//     Go back dismisses it
//   - Save & continue with no form open navigates to the policy step
//   - UX-01 BUG 2: preview panel shows display_name over full_name

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// VenueAutocomplete boots the Google Places loader — irrelevant here.
jest.mock('@/components/coach/shared/LocationAutocomplete', () => ({
  VenueAutocomplete: (props: { value: string }) => (
    <input data-testid="venue-autocomplete-mock" defaultValue={props.value} />
  ),
}))

import { AvailabilityStep } from '@/components/coach/onboarding/AvailabilityStep'

// jsdom has no scrollIntoView (the step calls it when opening the form)
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

const MONDAY_BLOCK = {
  id: 'block-1',
  sport_id: 'sport-1',
  sport_name: 'Cricket',
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '11:00:00',
  is_active: true,
  price_override_pence: 4000,
  session_type_id: null,
  session_type_name: '60min',
  created_at: '2026-07-01T00:00:00Z',
}

function stubFetch() {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/coaches/availability')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ availability: [MONDAY_BLOCK] }),
      } as Response)
    }
    if (url.includes('/api/coaches/profile')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ full_name: 'Lasith Jayarathne', display_name: 'Alex Stuart' }),
      } as Response)
    }
    if (url.includes('/api/coaches/sports')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ sports: [{ sport_id: 'sport-1', sport_name: 'Cricket' }] }),
      } as Response)
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`))
  }) as jest.Mock
}

beforeEach(() => {
  sessionStorage.clear()
  stubFetch()
})

afterEach(() => {
  jest.clearAllMocks()
})

describe('AvailabilityStep — per-day add affordance (UX-01 BUG 3)', () => {
  it('renders an Add another time row for a day with existing blocks', async () => {
    render(<AvailabilityStep />)

    expect(
      await screen.findByRole('button', { name: /Add another time on Monday/ }),
    ).toBeInTheDocument()
    // empty days keep the dashed empty-state affordance
    expect(screen.getByText('No slots on Tuesday yet')).toBeInTheDocument()
    // days with no blocks get no per-day row
    expect(
      screen.queryByRole('button', { name: /Add another time on Tuesday/ }),
    ).not.toBeInTheDocument()
  })

  it('opens the add form with that day preselected', async () => {
    render(<AvailabilityStep />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Add another time on Monday/ }),
    )

    expect(screen.getByText('New availability block')).toBeInTheDocument()
    // default times 09:00–10:00 overlap the existing Monday block — the
    // conflict warning proves Monday arrived preselected in the form
    expect(
      await screen.findByText(/overlaps with an existing block/),
    ).toBeInTheDocument()
  })
})

describe('AvailabilityStep — unsaved-block warning (UX-01 BUG 4)', () => {
  it('shows the warning inside the sticky footer when Save & continue is clicked with the form open', async () => {
    render(<AvailabilityStep />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Add another time on Monday/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    const warning = screen.getByText('You have an unsaved block.')
    expect(warning).toBeInTheDocument()
    expect(warning.closest('.sticky')).not.toBeNull()
    expect(mockPush).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.queryByText('You have an unsaved block.')).not.toBeInTheDocument()
  })

  it('clears a lingering warning when the form is cancelled', async () => {
    render(<AvailabilityStep />)

    fireEvent.click(
      await screen.findByRole('button', { name: /Add another time on Monday/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))
    expect(screen.getByText('You have an unsaved block.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('You have an unsaved block.')).not.toBeInTheDocument()
  })

  it('navigates to the policy step when no form is open', async () => {
    render(<AvailabilityStep />)
    await screen.findByRole('button', { name: /Add another time on Monday/ })

    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))
    expect(mockPush).toHaveBeenCalledWith('/coach/onboarding/policy')
  })
})

describe('AvailabilityStep — preview name (UX-01 BUG 2)', () => {
  it('shows display_name in the What parents see panel, not full_name', async () => {
    render(<AvailabilityStep />)

    expect(await screen.findByText('Alex Stuart')).toBeInTheDocument()
    expect(screen.queryByText('Lasith Jayarathne')).not.toBeInTheDocument()
  })
})
