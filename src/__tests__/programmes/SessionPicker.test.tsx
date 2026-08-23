/** @jest-environment jsdom */
// TEST-PROG-DETAIL-PICKER: component tests for the per_session session picker
// (src/app/coaches/[id]/programmes/[programmeId]/_components/SessionPicker.tsx).
//
// Covered:
//   - Renders session-row buttons and session-row-closed divs correctly
//   - Selecting / deselecting a row updates count + total
//   - CTA is disabled at 0 selected; enabled + correctly labelled with selections
//   - CTA label shows commission-inclusive 2-dp total (BR-01 add-on-top)
//   - Clicking enabled CTA calls router.push with selected session ids
//   - Closed rows (selectable=false) do not respond to click
//   - Collapse toggle: 4 rows visible when collapsed, all rows when expanded
//   - Camp mode: CampDay header labels render; slots are grouped per day

import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// next/navigation mock — must appear before any component import
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { SessionPicker } from '@/app/coaches/[id]/programmes/[programmeId]/_components/SessionPicker'
import type { SessionView, CampDay } from '@/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const COACH_ID = 'coach-uuid-001'
const PROGRAMME_ID = 'programme-uuid-001'

function makeSession(overrides: Partial<SessionView> = {}): SessionView {
  return {
    key: 'key-1',
    sessionId: 'session-1',
    slotIndex: 0,
    spotsLeft: null,
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
    slotIndex: 0,
    spotsLeft: null,
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

afterEach(() => {
  jest.clearAllMocks()
})

// ─── Rendering ─────────────────────────────────────────────────────────────────

describe('SessionPicker — rendering', () => {
  it('renders a session-row button for a selectable session', () => {
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession()]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getAllByText('Select sessions to continue').length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Selection interaction ─────────────────────────────────────────────────────

describe('SessionPicker — selection toggles count + total', () => {
  it('selecting one session enables the CTA', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    expect(screen.getByTestId('pay-cta')).not.toBeDisabled()
  })

  it('BR-01: CTA label shows commission-inclusive 2-dp total for 1 × £25 session (parent pays £27.50)', async () => {
    // Coach price: 2500p (£25). Commission: 250p (10%). Parent total: 2750p → £27.50.
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1', pricePence: 2500 })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    expect(screen.getAllByText('Pay for 1 session — £27.50').length).toBeGreaterThanOrEqual(1)
  })

  it('BR-01: CTA label shows commission-inclusive 2-dp total for 2 × £25 sessions (parent pays £55.00)', async () => {
    // Coach subtotal: 5000p. Commission: 500p. Parent total: 5500p → £55.00.
    const user = userEvent.setup()
    const sessions = makeSessions(2)
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={sessions}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const rows = screen.getAllByTestId('session-row')
    await user.click(rows[0])
    await user.click(rows[1])
    expect(screen.getAllByText('Pay for 2 sessions — £55.00').length).toBeGreaterThanOrEqual(1)
  })

  it('deselecting a previously selected session decrements the count', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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

  it('BR-01: running total = count × pricePerSessionPence + 10% commission (3 × £28 = £84 coach → £92.40 parent)', async () => {
    // 3 × 2800p = 8400p coach subtotal. Commission 840p. Parent total 9240p → £92.40.
    const user = userEvent.setup()
    const sessions = makeSessions(3).map((s) => ({ ...s, pricePence: 2800 }))
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2800}
        campMode={false}
        sessions={sessions}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const rows = screen.getAllByTestId('session-row')
    await user.click(rows[0])
    await user.click(rows[1])
    await user.click(rows[2])
    expect(screen.getAllByText('Pay for 3 sessions — £92.40').length).toBeGreaterThanOrEqual(1)
  })
})

// ─── CTA navigation ────────────────────────────────────────────────────────────

describe('SessionPicker — CTA navigation', () => {
  it('clicking pay-cta calls router.push with ?sessions=<sessionId>', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1', sessionId: 'session-uuid-1' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    await user.click(screen.getByTestId('pay-cta'))
    expect(mockPush).toHaveBeenCalledWith(
      `/book/${COACH_ID}/programmes/${PROGRAMME_ID}?sessions=session-uuid-1`,
    )
  })

  it('URL includes all selected session ids comma-separated', async () => {
    const user = userEvent.setup()
    const sessions = [
      makeSession({ key: 'k1', sessionId: 'session-uuid-1' }),
      makeSession({ key: 'k2', sessionId: 'session-uuid-2', dateISO: '2099-07-06' }),
    ]
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={sessions}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const rows = screen.getAllByTestId('session-row')
    await user.click(rows[0])
    await user.click(rows[1])
    await user.click(screen.getByTestId('pay-cta'))
    // Both ids present in the URL (order may vary so assert both are included)
    const pushArg = mockPush.mock.calls[0][0] as string
    expect(pushArg).toContain('session-uuid-1')
    expect(pushArg).toContain('session-uuid-2')
    expect(pushArg).toContain(`/book/${COACH_ID}/programmes/${PROGRAMME_ID}?sessions=`)
  })

  it('BUG-23: two SLOTS of one camp session are two URL entries (uuid + uuid.1), never deduped', async () => {
    // The pre-BUG-23 picker deduped by session-row id here — which sold a
    // full camp day (both slots) as ONE session at 1×. Slot identity must
    // survive into the checkout URL.
    const user = userEvent.setup()
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-05',
        dateLabel: 'Mon 5 July',
        slots: [
          makeSession({ key: 'k1', sessionId: 'shared-uuid', slotIndex: 0, slotName: 'Morning' }),
          makeSession({ key: 'k2', sessionId: 'shared-uuid', slotIndex: 1, slotName: 'Afternoon' }),
        ],
      },
    ]
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    const rows = screen.getAllByTestId('session-row')
    await user.click(rows[0])
    await user.click(rows[1])

    // Count + total reflect BOTH slots (2 × £25 + 10% fee = £55.00 shown).
    expect(screen.getByTestId('pay-cta')).toHaveTextContent(/Pay for 2 sessions/)
    // UX-21 itemisation: subtotal and fee are separate lines.
    expect(screen.getAllByTestId('subtotal-line')[0]).toHaveTextContent('2 sessions × £25 = £50.00')
    expect(screen.getAllByTestId('fee-line')[0]).toHaveTextContent('Service fee £5.00')

    await user.click(screen.getByTestId('pay-cta'))
    const pushArg = mockPush.mock.calls[0][0] as string
    expect(pushArg).toContain('shared-uuid')
    expect(pushArg).toContain('shared-uuid.1')
    // Both entries present: the bare uuid (slot 0) AND uuid.1 (slot 1).
    const occurrences = pushArg.split('shared-uuid').length - 1
    expect(occurrences).toBe(2)
  })

  it('UX-21: summary bar itemises subtotal, service fee and total on both variants', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={4000}
        campMode={false}
        sessions={makeSessions(3)}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const rows = screen.getAllByTestId('session-row')

    // No selection → no subtotal/fee lines, just the £0.00 total.
    expect(screen.queryByTestId('subtotal-line')).not.toBeInTheDocument()
    expect(screen.queryByTestId('fee-line')).not.toBeInTheDocument()

    await user.click(rows[0])
    // Singular label at one session.
    expect(screen.getByTestId('subtotal-line')).toHaveTextContent('1 session × £40 = £40.00')

    await user.click(rows[1])
    // Mobile sticky bar (BR-01: 2 × £40 = £80.00 subtotal, £8.00 fee on top).
    expect(screen.getByTestId('subtotal-line')).toHaveTextContent('2 sessions × £40 = £80.00')
    expect(screen.getByTestId('fee-line')).toHaveTextContent('Service fee £8.00')
    // Desktop sticky card shows the same breakdown.
    expect(screen.getByTestId('subtotal-line-desktop')).toHaveTextContent('2 sessions × £40 = £80.00')
    expect(screen.getByTestId('fee-line-desktop')).toHaveTextContent('Service fee £8.00')
  })

  it('does NOT call router.push when CTA is disabled (no selection)', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ key: 'k1' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    // CTA is disabled — click should be a no-op
    await user.click(screen.getByTestId('pay-cta'))
    expect(mockPush).not.toHaveBeenCalled()
  })
})

// ─── Closed row not selectable ─────────────────────────────────────────────────

describe('SessionPicker — closed rows are not interactive', () => {
  it('clicking a closed row does not enable the CTA', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={false}
        sessions={[makeSession({ selectable: false, closedLabel: 'Closed' })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    const closedRow = screen.getByTestId('session-row-closed')
    await user.click(closedRow)
    expect(screen.getByTestId('pay-cta')).toBeDisabled()
  })

  it('closed row does not receive aria-pressed (it is not a button)', () => {
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-01',
        dateLabel: 'Tue 1 July',
        slots: makeSessions(6).map((s) => ({ ...s, slotName: 'Morning' })),
      },
    ]
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
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
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={2500}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    expect(screen.getAllByTestId('session-row')).toHaveLength(2)
  })

  it('BR-01: selects a camp slot and shows commission-inclusive total (1 × £30 coach → £33.00 parent)', async () => {
    const user = userEvent.setup()
    const campDays: CampDay[] = [
      {
        dateISO: '2099-07-01',
        dateLabel: 'Tue 1 July',
        slots: [makeSession({ key: 'c1', pricePence: 3000, slotName: 'Morning', sessionId: 'camp-session-1' })],
      },
    ]
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={3000}
        campMode={true}
        sessions={[]}
        campDays={campDays}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    // 3000p × 1.1 = 3300p → £33.00
    expect(screen.getAllByText('Pay for 1 session — £33.00').length).toBeGreaterThanOrEqual(1)
  })
})

// ─── pricePerSessionPence=null edge case ──────────────────────────────────────

describe('SessionPicker — null price edge case', () => {
  it('renders without crashing when pricePerSessionPence is null', () => {
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={null}
        campMode={false}
        sessions={[makeSession({ pricePence: 0 })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    expect(screen.getByTestId('session-picker')).toBeInTheDocument()
  })

  it('total remains £0.00 when pricePerSessionPence is null even with a selection', async () => {
    const user = userEvent.setup()
    render(
      <SessionPicker
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        commissionRate={0.1}
        pricePerSessionPence={null}
        campMode={false}
        sessions={[makeSession({ key: 'k1', pricePence: 0 })]}
        campDays={EMPTY_CAMP_DAYS}
      />,
    )
    await user.click(screen.getByTestId('session-row'))
    // 0p × 1.1 = 0p → £0.00 (Intl.NumberFormat with 2dp)
    expect(screen.getAllByText('Pay for 1 session — £0.00').length).toBeGreaterThanOrEqual(1)
  })
})
