/** @jest-environment jsdom */
// BUG-43: the ?action=new-session auto-open must CONSUME the URL param.
// Previously the effect ran on [searchParams, activePopover] with the param
// never cleared, so every dismissal (X, Cancel, outside tap, Escape) re-ran
// the effect and re-opened the popover in the same frame — an inescapable
// dead end on mobile that read as "the X button is broken".
//
// Covered:
//   - Popover auto-opens from ?action=new-session
//   - router.replace('/coach/schedule', { scroll: false }) strips the param
//   - Dismissal via Escape STAYS dismissed (no re-open loop)
//   - Dismissal via the X button stays dismissed
//   - Dismissal via outside touchstart stays dismissed (mobile path, BUG-43b)
//   - No auto-open without the param

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// next/navigation mock — must appear before the component import. mockSearch
// is mutable so router.replace() behaves like the real thing: the next render
// of useSearchParams() sees the stripped URL.
let mockSearch = new URLSearchParams('')
const mockReplace = jest.fn((url: string) => {
  mockSearch = new URLSearchParams(url.split('?')[1] ?? '')
})
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearch,
}))

import { Schedule } from '@/components/coach/Schedule'

// Every mount-time fetch tolerates empty datasets — return them all.
const emptyPayload = { availability: [], sports: [], bookings: [], sessions: [] }

beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(emptyPayload),
    }),
  ) as jest.Mock
})

afterEach(() => {
  jest.clearAllMocks()
})

function mountWithParam(search: string) {
  mockSearch = new URLSearchParams(search)
  return render(<Schedule />)
}

describe('Schedule — ?action=new-session auto-open (BUG-43)', () => {
  it('auto-opens the New session popover and consumes the URL param', async () => {
    mountWithParam('action=new-session')

    expect(await screen.findByText('New session')).toBeInTheDocument()
    expect(mockReplace).toHaveBeenCalledWith('/coach/schedule', { scroll: false })
  })

  it('does not auto-open without the param', async () => {
    mountWithParam('')

    // Let mount effects settle, then confirm no popover.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByText('New session')).not.toBeInTheDocument()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('Escape dismisses and the popover STAYS closed (no re-open loop)', async () => {
    mountWithParam('action=new-session')
    await screen.findByText('New session')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByText('New session')).not.toBeInTheDocument(),
    )
    // The re-open loop fired within one render frame — give effects a beat and
    // confirm it is still gone.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('New session')).not.toBeInTheDocument()
  })

  it('the X button dismisses and stays dismissed', async () => {
    mountWithParam('action=new-session')
    await screen.findByText('New session')

    fireEvent.click(screen.getByLabelText('Close'))

    await waitFor(() =>
      expect(screen.queryByText('New session')).not.toBeInTheDocument(),
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('New session')).not.toBeInTheDocument()
  })

  it('an outside touchstart dismisses and stays dismissed (mobile path)', async () => {
    mountWithParam('action=new-session')
    await screen.findByText('New session')

    fireEvent.touchStart(document.body)

    await waitFor(() =>
      expect(screen.queryByText('New session')).not.toBeInTheDocument(),
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('New session')).not.toBeInTheDocument()
  })
})
