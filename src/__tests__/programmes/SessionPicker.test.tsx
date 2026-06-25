/** @jest-environment jsdom */
// TEST-PROG-DETAIL-PICKER: component tests for the per_session session picker
// (src/app/coaches/[id]/programmes/[programmeId]/_components/SessionPicker.tsx).
//
// Covered:
//   - Renders session-row buttons and session-row-closed divs correctly
//   - Selecting / deselecting a row updates count + total
//   - CTA is disabled at 0 selected; enabled + correctly labelled with selections
//   - Closed rows (selectable=false) do not respond to click
//   - Collapse toggle: 4 rows visible when collapsed, all rows when expanded
//   - Camp mode: CampDay header labels render; slots are grouped per day

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionPicker } from '@/app/coaches/[id]/programmes/[programmeId]/_components/SessionPicker'
import type { SessionView, CampDay } from '@/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<SessionView> = {}): SessionView {
  return {
    key: 'key-1',
    sessionId: 'session-1',
    dateISO: '2099-07-05',
    dateLabel: 'Sat 5 July',
    timeLabel: '9:00am – 10:00am',
    timeShort: '9–10am',
    slotName: null,
    pricePence: 2500,
    selectable: true,
    closedLabel: null,
    ...overrides,
  }
}

/** Build N distinct selectable sessions. */
function makeSessions(count: number): SessionView[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `key-${i + 1}`,
    sessionId: `session-${i + 1}`,
    dateISO: `2099-07-${String(i + 1).padStart(2, '0')}`,
    dateLabel: `Day ${i + 1}`,
    timeLabel: '9:00am – 10:00am',
    timeShort: '9–10am',
    slotName: null,
    pricePence: 2500,
    selectable: true,
    closedLabel: null,
  }))
}

const EMPTY_CAMP_DAYS: CampDay[] = []

// ─── Rendering ─────────────────────────────────────────────────────────────────

describe('SessionPicker — rendering', () => {
  it('renders a session-row button for a selectable session', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession()]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getAllByTestId('session-row')).toHaveLength(1)
  })

  it('renders a session-row-closed div for a non-selectable session', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ selectable: false, closedLabel: 'Closed' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByTestId('session-row-closed')).toBeInTheDocument()
  })

  it('renders the date label inside a selectable row', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ dateLabel: 'Sat 5 July' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByText('Sat 5 July')).toBeInTheDocument()
  })

  it('renders the time label inside a selectable row', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ timeLabel: '9:00am – 10:00am' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getAllByText('9:00am – 10:00am').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the "Closed" label inside a closed row', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ selectable: false, closedLabel: 'Closed' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })
})

// ─── CTA initial state ─────────────────────────────────────────────────────────

describe('SessionPicker — CTA at 0 selections', () => {
  it('mobile pay-cta is disabled when no sessions are selected', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession()]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const cta = screen.getByTestId('pay-cta')
    expect(cta).toBeDisabled()
  })

  it('desktop pay-cta-desktop is disabled when no sessions are selected', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession()]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const cta = screen.getByTestId('pay-cta-desktop')
    expect(cta).toBeDisabled()
  })

  it('shows "Select sessions to continue" when count=0', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession()]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    // Both mobile and desktop carry the same label string
    expect(screen.getAllByText('Select sessions to continue').length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Selection interaction ─────────────────────────────────────────────────────

describe('SessionPicker — selection toggles count + total', () => {
  it('selecting one session enables the CTA', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    expect(screen.getByTestId('pay-cta')).not.toBeDisabled()
  })

  it('CTA label shows "Pay for 1 session — £25" after selecting one £25 session', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1', pricePence: 2500 })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    // Both mobile and desktop share the ctaLabel
    expect(screen.getAllByText('Pay for 1 session — £25').length).toBeGreaterThanOrEqual(1)
  })

  it('CTA label pluralises: "Pay for 2 sessions — £50" after selecting two sessions', async () => {
    const user = userEvent.setup()
    const sessions = makeSessions(2)
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={sessions}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const rows = screen.getAllByTestId('session-row')
    await user.click(rows[0])
    await user.click(rows[1])
    expect(screen.getAllByText('Pay for 2 sessions — £50').length).toBeGreaterThanOrEqual(1)
  })

  it('deselecting a previously selected session decrements the count', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const row = screen.getByTestId('session-row')
    await user.click(row) // select
    await user.click(row) // deselect
    expect(screen.getByTestId('pay-cta')).toBeDisabled()
    expect(screen.getAllByText('Select sessions to continue').length).toBeGreaterThanOrEqual(1)
  })

  it('running total = count × pricePerSessionPence (3 × £30 = £90)', async () => {
    const user = userEvent.setup()
    const sessions = makeSessions(3).map((s) => ({ ...s, pricePence: 3000 }))
    render(
      <SessionPicker
        pricePerSessionPence={3000}
        campMode={false}
        sessions={sessions}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const rows = screen.getAllByTestId('session-row')
    await user.click(rows[0])
    await user.click(rows[1])
    await user.click(rows[2])
    expect(screen.getAllByText('Pay for 3 sessions — £90').length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Closed row not selectable ─────────────────────────────────────────────────

describe('SessionPicker — closed rows are not interactive', () => {
  it('clicking a closed row does not enable the CTA', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ selectable: false, closedLabel: 'Closed' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    // The closed row is a div, not a button — userEvent.click is safe but should have no effect
    const closedRow = screen.getByTestId('session-row-closed')
    await user.click(closedRow)
    expect(screen.getByTestId('pay-cta')).toBeDisabled()
  })

  it('closed row does not receive aria-pressed (it is not a button)', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ selectable: false, closedLabel: 'Closed' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const closedRow = screen.getByTestId('session-row-closed')
    expect(closedRow.tagName).toBe('DIV')
    expect(closedRow).not.toHaveAttribute('aria-pressed')
  })
})

// ─── Collapse / expand toggle ──────────────────────────────────────────────────

describe('SessionPicker — collapse toggle', () => {
  it('shows only 4 session rows when there are more than 4 and toggle is collapsed', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(6)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getAllByTestId('session-row')).toHaveLength(4)
  })

  it('does NOT render the toggle-sessions button when there are exactly 4 sessions', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(4)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.queryByTestId('toggle-sessions')).not.toBeInTheDocument()
  })

  it('renders the toggle-sessions button when there are more than 4 sessions', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(5)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByTestId('toggle-sessions')).toBeInTheDocument()
  })

  it('toggle label shows "Show all N sessions" when collapsed', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(7)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByTestId('toggle-sessions')).toHaveTextContent('Show all 7 sessions')
  })

  it('expands to show all sessions after clicking the toggle', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(6)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('toggle-sessions'))
    expect(screen.getAllByTestId('session-row')).toHaveLength(6)
  })

  it('toggle label changes to "Show fewer" after expanding', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(5)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('toggle-sessions'))
    expect(screen.getByTestId('toggle-sessions')).toHaveTextContent('Show fewer')
  })

  it('collapses back to 4 rows after clicking toggle a second time', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(6)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const toggle = screen.getByTestId('toggle-sessions')
    await user.click(toggle) // expand
    await user.click(toggle) // collapse
    expect(screen.getAllByTestId('session-row')).toHaveLength(4)
  })

  it('toggle is aria-expanded=false when collapsed', () => {
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(5)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByTestId('toggle-sessions')).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggle is aria-expanded=true after expanding', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={false}
        sessions={makeSessions(5)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('toggle-sessions'))
    expect(screen.getByTestId('toggle-sessions')).toHaveAttribute('aria-expanded', 'true')
  })

  it('camp mode: toggle is NOT rendered even with >4 sessions (collapse is flat-list only)', () => {
    // campMode=true — the component always renders all camp days without a toggle
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-01',
        dateLabel: 'Tue 1 July',
        slots: makeSessions(6).map((s) => ({ ...s, slotName: 'Morning' })),
      },
    ]
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    expect(screen.queryByTestId('toggle-sessions')).not.toBeInTheDocument()
  })
})

// ─── Camp mode rendering ───────────────────────────────────────────────────────

describe('SessionPicker — camp mode', () => {
  it('renders the day label as a camp-day header', () => {
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-01',
        dateLabel: 'Tue 1 July',
        slots: [makeSession({ key: 'c1', slotName: 'Morning' })],
      },
    ]
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    expect(screen.getByText('Tue 1 July')).toBeInTheDocument()
  })

  it('renders all slots inside a camp day', () => {
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-01',
        dateLabel: 'Tue 1 July',
        slots: [
          makeSession({ key: 'c1', slotName: 'Morning' }),
          makeSession({ key: 'c2', slotName: 'Afternoon' }),
        ],
      },
    ]
    render(
      <SessionPicker
        pricePerSessionPence={2500}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    expect(screen.getAllByTestId('session-row')).toHaveLength(2)
  })

  it('selects a camp slot and updates total correctly', async () => {
    const user = userEvent.setup()
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-01',
        dateLabel: 'Tue 1 July',
        slots: [makeSession({ key: 'c1', pricePence: 3000, slotName: 'Morning' })],
      },
    ]
    render(
      <SessionPicker
        pricePerSessionPence={3000}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    expect(screen.getAllByText('Pay for 1 session — £30').length).toBeGreaterThanOrEqual(1)
  })
})

// ─── pricePerSessionPence=null edge case ──────────────────────────────────────

describe('SessionPicker — null price edge case', () => {
  it('renders without crashing when pricePerSessionPence is null', () => {
    render(
      <SessionPicker
        pricePerSessionPence={null}
        campMode={false}
        sessions={[makeSession({ pricePence: 0 })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByTestId('session-picker')).toBeInTheDocument()
  })

  it('total remains £0 when pricePerSessionPence is null even with a selection', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        pricePerSessionPence={null}
        campMode={false}
        sessions={[makeSession({ key: 'k1', pricePence: 0 })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    // "Pay for 1 session — £0"
    expect(screen.getAllByText('Pay for 1 session — £0').length).toBeGreaterThanOrEqual(1)
  })
})
