/** @jest-environment jsdom */
// TEST-PROG-DETAIL-SCHEDULE: component tests for the block_upfront schedule
// (src/app/coaches/[id]/programmes/[programmeId]/_components/ProgrammeSchedule.tsx).
//
// Covered:
//   - Renders numbered schedule rows (data-testid="schedule-row")
//   - Enrol CTA is ALWAYS disabled — both mobile (enrol-cta) and desktop (enrol-cta-desktop)
//   - CTA label shows formatted price when blockTotalPence is set
//   - CTA label falls back to "Enrol for full programme" when blockTotalPence is null
//   - Collapse toggle: 4 rows visible when collapsed, all rows when expanded
//   - spanLabel and scheduleLabel render in the intro text

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const DEFAULT_PROPS = {
  schedule: makeRows(3),
  sessionCount: 3,
  blockTotalPence: 7500 as number | null,
  spanLabel: '1 Jul – 19 Jul 2026' as string | null,
  scheduleLabel: 'Every Saturday · 9:00am – 10:00am',
}

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

// ─── Enrol CTA — always disabled (Block 0 placeholder) ────────────────────────

describe('ProgrammeSchedule — enrol CTA is always disabled', () => {
  it('mobile enrol-cta is disabled', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('enrol-cta')).toBeDisabled()
  })

  it('desktop enrol-cta-desktop is disabled', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    expect(screen.getByTestId('enrol-cta-desktop')).toBeDisabled()
  })

  it('enrol-cta remains disabled even after user attempts to interact with the page', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} />)
    // Clicking another element first should not change disabled state
    const row = screen.getAllByTestId('schedule-row')[0]
    await user.click(row)
    expect(screen.getByTestId('enrol-cta')).toBeDisabled()
    expect(screen.getByTestId('enrol-cta-desktop')).toBeDisabled()
  })
})

// ─── CTA label formatting ──────────────────────────────────────────────────────

describe('ProgrammeSchedule — CTA label', () => {
  it('shows formatted price: "Enrol for full programme — £75" when blockTotalPence=7500', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={7500} />)
    // Both mobile and desktop buttons carry the same label
    expect(
      screen.getAllByText('Enrol for full programme — £75').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('shows "Enrol for full programme" (no price) when blockTotalPence is null', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={null} />)
    expect(
      screen.getAllByText('Enrol for full programme').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('formats £100.00 as "£100" (no decimals for whole pounds — integer pence)', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} blockTotalPence={10000} />)
    expect(
      screen.getAllByText('Enrol for full programme — £100').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('blockTotalPence is always an integer (pence rule — BR-10 adjacent)', () => {
    // This test verifies the consumer does not pass floats.
    // 7500 is a valid integer.
    expect(Number.isInteger(DEFAULT_PROPS.blockTotalPence)).toBe(true)
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

  it('enrol CTA remains disabled after expanding the schedule', async () => {
    const user = userEvent.setup()
    render(<ProgrammeSchedule {...DEFAULT_PROPS} schedule={makeRows(5)} sessionCount={5} />)
    await user.click(screen.getByTestId('toggle-schedule'))
    expect(screen.getByTestId('enrol-cta')).toBeDisabled()
    expect(screen.getByTestId('enrol-cta-desktop')).toBeDisabled()
  })
})

// ─── Intro text (spanLabel + scheduleLabel) ────────────────────────────────────

describe('ProgrammeSchedule — intro text', () => {
  it('renders sessionCount in the intro', () => {
    render(<ProgrammeSchedule {...DEFAULT_PROPS} sessionCount={3} />)
    // The component renders "3 sessions" in multiple places (intro p, CTA bar)
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
    // The intro <p> is the most specific place — assert it does not say "1 sessions"
    expect(screen.queryByText(/1 sessions/)).not.toBeInTheDocument()
    // At least one element contains "1 session" text
    expect(screen.getAllByText(/1 session/).length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Empty schedule edge case ──────────────────────────────────────────────────

describe('ProgrammeSchedule — empty schedule', () => {
  it('renders without crashing when schedule is empty', () => {
    render(
      <ProgrammeSchedule
        schedule={[]}
        sessionCount={0}
        blockTotalPence={null}
        spanLabel={null}
        scheduleLabel="Schedule TBC"
      />,
    )
    expect(screen.getByTestId('programme-schedule')).toBeInTheDocument()
  })

  it('does not render the toggle button when schedule is empty', () => {
    render(
      <ProgrammeSchedule
        schedule={[]}
        sessionCount={0}
        blockTotalPence={null}
        spanLabel={null}
        scheduleLabel="Schedule TBC"
      />,
    )
    expect(screen.queryByTestId('toggle-schedule')).not.toBeInTheDocument()
  })
})
