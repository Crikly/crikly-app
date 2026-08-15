/** @jest-environment jsdom */
// TEST-PROG-DETAIL-SCHEDULE: component tests for the block_upfront schedule
// (src/app/coaches/[id]/programmes/[programmeId]/_components/ProgrammeSchedule.tsx).
//
// Covered:
//   - Renders numbered schedule rows (data-testid="schedule-row")
//   - Enrol CTA is ENABLED when blockTotalPence is set; DISABLED when null
//   - CTA label includes commission-inclusive 2-dp total (BR-01 add-on-top)
//   - CTA label falls back to "Enrol for full programme" when blockTotalPence is null
//   - Clicking CTA calls router.push(`/book/${coachId}/programmes/${programmeId}?block=true`)
//   - Collapse toggle: 4 rows visible when collapsed, all rows when expanded
//   - spanLabel and scheduleLabel render in the intro text

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// next/navigation mock — must appear before the component import
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import { ProgrammeSchedule } from '@/app/coaches/[id]/programmes/[programmeId]/_components/ProgrammeSchedule'
import type { ScheduleRow } from '@/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeRows(count: number): ScheduleRow[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    dateLabel: `Day ${i + 1}`,
    timeShort: '9–10am',
  }))
}

const COACH_ID = 'coach-uuid-001'
const PROGRAMME_ID = 'programme-uuid-001'

// blockTotalPence = 22400 (£224) coach price → parent pays £246.40 (10% commission on top)
const DEFAULT_PROPS = {
  coachId: COACH_ID,
  programmeId: PROGRAMME_ID,
  schedule: makeRows(3),
  sessionCount: 3,
  blockTotalPence: 22400 as number | null,
  spanLabel: '1 Jul – 19 Jul 2026' as string | null,
  scheduleLabel: 'Every Saturday · 9:00am – 10:00am',
  commissionRate: 0.1,
}

afterEach(() => {
  jest.clearAllMocks()
})

// ─── Rendering ─────────────────────────────────────────────────────────────────

describe('ProgrammeSchedule — rendering', () => {
  it('renders a schedule-row for each entry', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    expect(screen.getAllByTestId('schedule-row')).toHaveLength(3)
  })

  it('shows the correct row numbers (1, 2, 3)', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    const rows = screen.getAllByTestId('schedule-row')
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[1]).toHaveTextContent('2')
    expect(rows[2]).toHaveTextContent('3')
  })

  it('shows the dateLabel inside each row', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    expect(screen.getByText('Day 1')).toBeInTheDocument()
    expect(screen.getByText('Day 2')).toBeInTheDocument()
  })

  it('shows the timeShort inside each row', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    expect(screen.getAllByText('9–10am').length).toBeGreaterThanOrEqual(1)
  })

  it('renders the programme-schedule container', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('programme-schedule')).toBeInTheDocument()
  })
})

// ─── Enrol CTA — enabled state (blockTotalPence is set) ───────────────────────

describe('ProgrammeSchedule — enrol CTA enabled when blockTotalPence is set', () => {
  it('mobile enrol-cta is ENABLED when blockTotalPence is set', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={22400} />)
    expect(screen.getByTestId('enrol-cta')).not.toBeDisabled()
  })

  it('desktop enrol-cta-desktop is ENABLED when blockTotalPence is set', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={22400} />)
    expect(screen.getByTestId('enrol-cta-desktop')).not.toBeDisabled()
  })

  it('mobile enrol-cta is DISABLED when blockTotalPence is null', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={null} />)
    expect(screen.getByTestId('enrol-cta')).toBeDisabled()
  })

  it('desktop enrol-cta-desktop is DISABLED when blockTotalPence is null', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={null} />)
    expect(screen.getByTestId('enrol-cta-desktop')).toBeDisabled()
  })
})

// ─── CTA navigation ───────────────────────────────────────────────────────────

describe('ProgrammeSchedule — CTA navigation', () => {
  it('clicking mobile enrol-cta calls router.push with block=true URL', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={22400} />)
    await user.click(screen.getByTestId('enrol-cta'))
    expect(mockPush).toHaveBeenCalledWith(
      `/book/${COACH_ID}/programmes/${PROGRAMME_ID}?block=true`,
    )
  })

  it('clicking desktop enrol-cta-desktop calls router.push with block=true URL', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={22400} />)
    await user.click(screen.getByTestId('enrol-cta-desktop'))
    expect(mockPush).toHaveBeenCalledWith(
      `/book/${COACH_ID}/programmes/${PROGRAMME_ID}?block=true`,
    )
  })

  it('CTA does NOT call router.push when blockTotalPence is null (disabled)', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={null} />)
    // disabled button — click should be a no-op
    await user.click(screen.getByTestId('enrol-cta'))
    expect(mockPush).not.toHaveBeenCalled()
  })
})

// ─── CTA label formatting (BR-01 commission on top, 2-dp total) ───────────────

describe('ProgrammeSchedule — CTA label', () => {
  it('BR-01: shows commission-inclusive 2-dp total: "Enrol for full programme — £246.40" for £224 coach price (10% on top)', () => {
    // Coach price = £224 (22400p). Commission = £22.40 (2240p) → parent pays £246.40.
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={22400} />)
    expect(
      screen.getAllByText('Enrol for full programme — £246.40').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('shows "Enrol for full programme" (no price) when blockTotalPence is null', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={null} />)
    expect(
      screen.getAllByText('Enrol for full programme').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('BR-01: formats £100 coach price as "£110.00" (10% commission = £10.00)', () => {
    // 10000p coach → 11000p parent total → £110.00
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={10000} />)
    expect(
      screen.getAllByText('Enrol for full programme — £110.00').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('blockTotalPence is always an integer (pence rule — BR-10 adjacent)', () => {
    // Verifies the test fixture itself is correct.
    expect(Number.isInteger(DEFAULT_PROPS.blockTotalPence)).toBe(true)
  })

  it('BR-10: commission-inclusive total is an integer pence before formatting', () => {
    // 22400 × 1.1 = 24640 exactly — no floating-point residue.
    const coachPence = 22400
    const parentTotal = coachPence + Math.round(coachPence * 0.1)
    expect(Number.isInteger(parentTotal)).toBe(true)
    expect(parentTotal).toBe(24640)
  })
})

// ─── Collapse / expand toggle ──────────────────────────────────────────────────

describe('ProgrammeSchedule — collapse toggle', () => {
  it('shows only 4 rows when there are more than 4 and toggle is collapsed', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(7)} sessionCount={7} />)
    expect(screen.getAllByTestId('schedule-row')).toHaveLength(4)
  })

  it('does NOT render the toggle when there are exactly 4 rows', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(4)} sessionCount={4} />)
    expect(screen.queryByTestId('toggle-schedule')).not.toBeInTheDocument()
  })

  it('renders the toggle-schedule button when there are more than 4 rows', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(5)} sessionCount={5} />)
    expect(screen.getByTestId('toggle-schedule')).toBeInTheDocument()
  })

  it('toggle label shows "Show all N sessions" when collapsed', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(6)} sessionCount={6} />)
    expect(screen.getByTestId('toggle-schedule')).toHaveTextContent('Show all 6 sessions')
  })

  it('expands to show all rows after clicking the toggle', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(6)} sessionCount={6} />)
    await user.click(screen.getByTestId('toggle-schedule'))
    expect(screen.getAllByTestId('schedule-row')).toHaveLength(6)
  })

  it('toggle label changes to "Show fewer" after expanding', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(5)} sessionCount={5} />)
    await user.click(screen.getByTestId('toggle-schedule'))
    expect(screen.getByTestId('toggle-schedule')).toHaveTextContent('Show fewer')
  })

  it('collapses back to 4 rows after clicking toggle a second time', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(6)} sessionCount={6} />)
    const toggle = screen.getByTestId('toggle-schedule')
    await user.click(toggle) // expand
    await user.click(toggle) // collapse
    expect(screen.getAllByTestId('schedule-row')).toHaveLength(4)
  })

  it('toggle is aria-expanded=false when collapsed', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(5)} sessionCount={5} />)
    expect(screen.getByTestId('toggle-schedule')).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggle is aria-expanded=true after expanding', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(5)} sessionCount={5} />)
    await user.click(screen.getByTestId('toggle-schedule'))
    expect(screen.getByTestId('toggle-schedule')).toHaveAttribute('aria-expanded', 'true')
  })

  it('enrol CTA remains enabled after expanding the schedule (blockTotalPence set)', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(5)} sessionCount={5} />)
    await user.click(screen.getByTestId('toggle-schedule'))
    expect(screen.getByTestId('enrol-cta')).not.toBeDisabled()
    expect(screen.getByTestId('enrol-cta-desktop')).not.toBeDisabled()
  })
})

// ─── Intro text (spanLabel + scheduleLabel) ────────────────────────────────────

describe('ProgrammeSchedule — intro text', () => {
  it('renders sessionCount in the intro', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} sessionCount={3} />)
    expect(screen.getAllByText(/3 sessions/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders spanLabel when provided', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} spanLabel="1 Jul – 19 Jul 2026" />)
    expect(screen.getByText(/1 Jul – 19 Jul 2026/)).toBeInTheDocument()
  })

  it('does NOT render spanLabel when null', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} spanLabel={null} />)
    expect(screen.queryByText(/Jul – /)).not.toBeInTheDocument()
  })

  it('renders "1 session" (singular, not "1 sessions") when sessionCount=1', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} sessionCount={1} schedule={makeRows(1)} />)
    expect(screen.queryByText(/1 sessions/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/1 session/).length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Empty schedule edge case ──────────────────────────────────────────────────

describe('ProgrammeSchedule — empty schedule', () => {
  it('renders without crashing when schedule is empty', () => {
    render(
      <ProgrammeSchedule
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        schedule={[]}
        sessionCount={0}
        blockTotalPence={null}
        spanLabel={null}
        scheduleLabel="Schedule TBC"
        commissionRate={0.1}
      />,
    )
    expect(screen.getByTestId('programme-schedule')).toBeInTheDocument()
  })

  it('does not render the toggle button when schedule is empty', () => {
    render(
      <ProgrammeSchedule
        coachId={COACH_ID}
        programmeId={PROGRAMME_ID}
        schedule={[]}
        sessionCount={0}
        blockTotalPence={null}
        spanLabel={null}
        scheduleLabel="Schedule TBC"
        commissionRate={0.1}
      />,
    )
    expect(screen.queryByTestId('toggle-schedule')).not.toBeInTheDocument()
  })
})
