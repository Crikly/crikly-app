/** @jest-environment jsdom */
// UX-19: the programme edit form must surface the API's 409 conflict `message`
// prominently (inline alert banner) and disable Save while the conflict stands.
// Any form edit clears the conflict and re-enables Save.

import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// next/navigation mock — must appear before any component import
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Heavy child components are irrelevant to conflict handling — stub them out.
jest.mock('@/components/coach/shared/LocationAutocomplete', () => ({
  VenueAutocomplete: () => null,
}))
jest.mock('@/components/coach/shared/ProgrammeImagePicker', () => ({
  ProgrammeImagePicker: () => null,
}))
jest.mock('@/components/coach/SessionCalendar', () => ({
  SessionCalendar: () => null,
}))
jest.mock('@/components/ui', () => ({
  DatePicker: () => null,
  TimePicker: () => null,
  todayYYYYMMDD: () => '2026-07-09',
}))

import { EditProgramme } from '@/components/coach/EditProgramme'

const PROGRAMME_ID = 'programme-uuid-001'

const CONFLICT_MESSAGE =
  'One of these sessions overlaps a booking or programme session already scheduled for you. Adjust the programme times or dates.'

/** Minimal single-programme GET payload — enough for the form to hydrate. */
const PROGRAMME_DATA = {
  title: 'Spring Nets',
  description: 'Weekly nets',
  skill_level: 'all',
  age_groups: [],
  days_of_week: [6],
  day_of_week: 6,
  start_time: '09:00:00',
  duration_minutes: 60,
  starts_at: null,
  ends_at: null,
  session_dates: [],
  camp_mode: false,
  max_spots: 8,
  payment_type: 'per_session',
  price_per_session_pence: 2800,
  block_price_pence: null,
  block_session_count: null,
  venue_name: '',
  venue_address: '',
  image_url: null,
  sport_name: 'Cricket',
  schedule_type: 'fixed',
  current_spots: 0,
  status: 'draft',
  session_count: 8,
}

function mockFetch(patchResponse: { status: number; body: unknown }): jest.Mock {
  return jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve({
        ok: patchResponse.status < 400,
        status: patchResponse.status,
        json: () => Promise.resolve(patchResponse.body),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PROGRAMME_DATA),
    } as unknown as Response)
  })
}

async function renderLoaded(): Promise<void> {
  render(<EditProgramme programmeId={PROGRAMME_ID} />)
  await screen.findByDisplayValue('Spring Nets')
}

describe('EditProgramme — 409 conflict handling (UX-19)', () => {
  it('shows the API 409 message in a prominent banner and disables Save', async () => {
    global.fetch = mockFetch({
      status: 409,
      body: { error: 'Conflict detected', message: CONFLICT_MESSAGE },
    })

    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    const banner = await screen.findByTestId('conflict-banner')
    expect(banner).toHaveAttribute('role', 'alert')
    expect(within(banner).getByText(CONFLICT_MESSAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeDisabled()
    // The full message is shown — not the constant "Conflict detected" label.
    expect(within(banner).queryByText(/^Conflict detected$/)).not.toBeInTheDocument()
  })

  it('falls back to the error constant when the 409 carries no message', async () => {
    global.fetch = mockFetch({ status: 409, body: { error: 'Conflict detected' } })

    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    const banner = await screen.findByTestId('conflict-banner')
    expect(within(banner).getByText('Conflict detected')).toBeInTheDocument()
  })

  it('clears the conflict and re-enables Save when the coach edits the form', async () => {
    global.fetch = mockFetch({
      status: 409,
      body: { error: 'Conflict detected', message: CONFLICT_MESSAGE },
    })

    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: /Save changes/i }))
    await screen.findByTestId('conflict-banner')

    await user.type(screen.getByDisplayValue('Spring Nets'), ' U11')

    await waitFor(() => {
      expect(screen.queryByTestId('conflict-banner')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeEnabled()
  })

  it('non-409 failures use the plain save error, not the conflict banner', async () => {
    global.fetch = mockFetch({ status: 500, body: { error: 'Failed to save changes.' } })

    const user = userEvent.setup()
    await renderLoaded()

    await user.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(await screen.findByText('Failed to save changes.')).toBeInTheDocument()
    expect(screen.queryByTestId('conflict-banner')).not.toBeInTheDocument()
    // Plain errors never lock the button — the coach can simply retry.
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeEnabled()
  })
})
