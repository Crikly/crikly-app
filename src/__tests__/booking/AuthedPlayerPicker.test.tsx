/** @jest-environment jsdom */
// P-10 (single-flow rev): component tests for the shared authed player picker
// (src/components/booking/AuthedPlayerPicker.tsx).
//
// Covered:
//   - 1-on-1 mode renders ChildSelector; picking a child reports
//     childProfileId + primaryAssigned/isComplete
//   - Player-count chips render only when the coach has group tiers
//   - Group mode: avatar toggle select/deselect, cap-driven dimming, "+"
//     hides at max and returns on removal
//   - Guest rows: add, type, remove; playerAssignments order children-first
//   - isComplete false while an added guest row is unnamed; error copy shows
//     only when the host sets showError
//   - ChildSelector "+" tile bumps the player count in group context
//   - Pool collapses to the primary on group → 1-on-1 toggle

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AuthedPlayerPicker,
  type AuthedBookingContext,
  type PlayerPickerSelection,
} from '@/components/booking/AuthedPlayerPicker'

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const YUWIN = { id: 'child-1', firstName: 'Yuwin', colour: '#0077CC', age: 9 }
const ARTHUR = { id: 'child-2', firstName: 'Arthur', colour: '#B45309', age: 11 }

function makeContext(overrides: Partial<AuthedBookingContext> = {}): AuthedBookingContext {
  return {
    childrenList: [YUWIN, ARTHUR],
    sessionTypes: ['individual', 'group'],
    maxGroupSize: 4,
    groupPriceTiers: { '2': 9000, '3': 12000, '4': 14000 },
    ...overrides,
  }
}

function renderPicker(
  context: AuthedBookingContext,
  { showError = false }: { showError?: boolean } = {},
) {
  const selections: PlayerPickerSelection[] = []
  const onChange = (selection: PlayerPickerSelection) => {
    selections.push(selection)
  }
  const view = render(
    <AuthedPlayerPicker context={context} showError={showError} onChange={onChange} />,
  )
  const latest = () => {
    const last = selections[selections.length - 1]
    if (!last) throw new Error('onChange was never called')
    return last
  }
  return { ...view, selections, latest }
}

// ─── 1-on-1 mode ───────────────────────────────────────────────────────────────

describe('AuthedPlayerPicker — 1-on-1 mode', () => {
  it('renders ChildSelector and reports the picked child', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext())

    expect(screen.getByTestId('child-selector')).toBeInTheDocument()
    expect(latest().primaryAssigned).toBe(false)
    expect(latest().isComplete).toBe(false)

    await user.click(screen.getByTestId(`child-selector-option-${YUWIN.id}`))

    expect(latest()).toMatchObject({
      players: 1,
      childProfileId: YUWIN.id,
      primaryAssigned: true,
      isComplete: true,
    })
    expect(latest().playerAssignments).toBeUndefined()
  })

  it('shows the primary error only when the host sets showError', () => {
    const { rerender } = render(
      <AuthedPlayerPicker context={makeContext()} showError={false} onChange={() => {}} />,
    )
    expect(screen.queryByTestId('player-picker-error')).not.toBeInTheDocument()

    rerender(
      <AuthedPlayerPicker context={makeContext()} showError onChange={() => {}} />,
    )
    expect(screen.getByTestId('player-picker-error')).toHaveTextContent(
      'Choose who this session is for',
    )
  })

  it('hides the player-count chips when the coach has no group tiers', () => {
    renderPicker(makeContext({ groupPriceTiers: null, sessionTypes: ['individual'] }))
    expect(screen.queryByTestId('player-count-2')).not.toBeInTheDocument()
  })
})

// ─── BUG-77: 1-on-1 "+" expands an inline guest row (no navigation) ───────────

describe('AuthedPlayerPicker — BUG-77 inline solo guest', () => {
  const NO_GROUPS = { groupPriceTiers: null, sessionTypes: ['individual'] }

  it('non-group coach: "+" expands the inline row and prevents navigation', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext(NO_GROUPS))

    // The tile carries the booking-flow label (approved clarification 2).
    expect(screen.getByTestId('child-selector-add')).toHaveTextContent('Add player')
    expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('child-selector-add'))

    // Inline row expanded in-panel; jsdom throws "not implemented" on real
    // navigation, so reaching these assertions also proves preventDefault.
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument()
    expect(
      screen.getByText('Guest players are for this session only — no profile needed.'),
    ).toBeInTheDocument()
    expect(latest().players).toBe(1)
    expect(latest().primaryAssigned).toBe(false)

    await user.type(screen.getByTestId('guest-name-1'), 'Sam')
    expect(latest()).toMatchObject({
      players: 1,
      primaryAssigned: true,
      isComplete: true,
    })
    expect(latest().childProfileId).toBeUndefined()
    expect(latest().playerAssignments).toEqual([
      { kind: 'guest', firstName: 'Sam', age: '' },
    ])
  })

  it('zero children: "+" expands inline instead of navigating (clarification 1)', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext({ childrenList: [] }))

    await user.click(screen.getByTestId('child-selector-add'))

    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument()
    await user.type(screen.getByTestId('guest-name-1'), 'Maya')
    expect(latest()).toMatchObject({ players: 1, isComplete: true })
    expect(latest().playerAssignments).toEqual([
      { kind: 'guest', firstName: 'Maya', age: '' },
    ])
  })

  it('child pick and solo guest row are mutually exclusive', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext(NO_GROUPS))

    await user.click(screen.getByTestId(`child-selector-option-${YUWIN.id}`))
    expect(latest().childProfileId).toBe(YUWIN.id)

    // Opening the guest row clears the child pick…
    await user.click(screen.getByTestId('child-selector-add'))
    expect(latest().childProfileId).toBeUndefined()
    expect(screen.getByTestId('guest-row-1')).toBeInTheDocument()

    // …and clicking "+" again never adds a second row in 1-on-1.
    await user.click(screen.getByTestId('child-selector-add'))
    expect(screen.queryByTestId('guest-row-2')).not.toBeInTheDocument()

    // Picking a child dismisses the row again.
    await user.click(screen.getByTestId(`child-selector-option-${ARTHUR.id}`))
    expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument()
    expect(latest()).toMatchObject({ childProfileId: ARTHUR.id, isComplete: true })
    expect(latest().playerAssignments).toBeUndefined()
  })

  it('removing the solo row returns to the unassigned state', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext(NO_GROUPS))

    await user.click(screen.getByTestId('child-selector-add'))
    await user.type(screen.getByTestId('guest-name-1'), 'Sam')
    expect(latest().isComplete).toBe(true)

    await user.click(screen.getByTestId('remove-guest-1'))
    expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument()
    expect(latest()).toMatchObject({ primaryAssigned: false, isComplete: false })
  })

  it('group-capable coach with children: "+" still bumps the player count (unchanged)', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext())

    await user.click(screen.getByTestId('child-selector-add'))
    expect(latest().players).toBe(2)
    expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument()
  })

  it('an open solo guest row carries into group mode as a guest row', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext({ childrenList: [] }))

    await user.click(screen.getByTestId('child-selector-add'))
    await user.type(screen.getByTestId('guest-name-1'), 'Sam')

    await user.click(screen.getByTestId('player-count-2'))
    expect(screen.getByTestId('guest-name-1')).toHaveValue('Sam')
    expect(latest().players).toBe(2)
    expect(latest().playerAssignments?.[0]).toEqual({
      kind: 'guest',
      firstName: 'Sam',
      age: '',
    })
  })
})

// ─── Group mode ────────────────────────────────────────────────────────────────

describe('AuthedPlayerPicker — group mode', () => {
  it('toggles child avatars, dims at the cap, and hides "+" at max', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext())

    await user.click(screen.getByTestId('player-count-2'))
    expect(latest().players).toBe(2)

    await user.click(screen.getByTestId(`select-child-${YUWIN.id}`))
    await user.click(screen.getByTestId(`select-child-${ARTHUR.id}`))

    // Cap reached (2 of 2): "+" disappears, both avatars stay enabled
    // (selected ones must remain tappable to deselect).
    expect(screen.queryByTestId('add-guest-player')).not.toBeInTheDocument()
    expect(latest()).toMatchObject({
      players: 2,
      childProfileId: YUWIN.id,
      primaryAssigned: true,
      isComplete: true,
    })
    expect(latest().playerAssignments).toEqual([
      { kind: 'child', childProfileId: YUWIN.id, firstName: 'Yuwin', age: '9' },
      { kind: 'child', childProfileId: ARTHUR.id, firstName: 'Arthur', age: '11' },
    ])

    // Deselect Arthur → cap lifts, "+" returns.
    await user.click(screen.getByTestId(`select-child-${ARTHUR.id}`))
    expect(screen.getByTestId('add-guest-player')).toBeInTheDocument()
    expect(latest().playerAssignments).toEqual([
      { kind: 'child', childProfileId: YUWIN.id, firstName: 'Yuwin', age: '9' },
    ])
  })

  it('dims unselected avatars at max (guest rows fill the cap)', async () => {
    const user = userEvent.setup()
    renderPicker(makeContext())

    await user.click(screen.getByTestId('player-count-2'))
    await user.click(screen.getByTestId(`select-child-${YUWIN.id}`))
    await user.click(screen.getByTestId('add-guest-player'))

    // 2 of 2 filled: Arthur (unselected) is disabled/dimmed; Yuwin stays enabled.
    expect(screen.getByTestId(`select-child-${ARTHUR.id}`)).toBeDisabled()
    expect(screen.getByTestId(`select-child-${YUWIN.id}`)).toBeEnabled()
    expect(screen.queryByTestId('add-guest-player')).not.toBeInTheDocument()
  })

  it('guest rows: add, name, remove — children always precede guests; every slot must fill (fix 4)', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext())

    await user.click(screen.getByTestId('player-count-3'))
    await user.click(screen.getByTestId('add-guest-player'))

    // Unnamed guest row: counts toward the cap but blocks completeness.
    expect(latest().isComplete).toBe(false)

    await user.type(screen.getByTestId('guest-name-1'), '  Sam  ')
    await user.selectOptions(screen.getByTestId('guest-age-1'), '8')
    await user.click(screen.getByTestId(`select-child-${YUWIN.id}`))

    // P-10 fix 4: 2 of 3 slots filled — still incomplete, guidance visible.
    expect(latest().isComplete).toBe(false)
    expect(screen.getByTestId('player-picker-incomplete')).toHaveTextContent(
      'all 3 players',
    )

    await user.click(screen.getByTestId(`select-child-${ARTHUR.id}`))
    expect(latest().isComplete).toBe(true)
    expect(screen.queryByTestId('player-picker-incomplete')).not.toBeInTheDocument()
    expect(latest().playerAssignments).toEqual([
      { kind: 'child', childProfileId: YUWIN.id, firstName: 'Yuwin', age: '9' },
      { kind: 'child', childProfileId: ARTHUR.id, firstName: 'Arthur', age: '11' },
      { kind: 'guest', firstName: 'Sam', age: '8' },
    ])

    await user.click(screen.getByTestId('remove-guest-1'))
    expect(screen.queryByTestId('guest-row-1')).not.toBeInTheDocument()
    expect(latest().isComplete).toBe(false) // back to 2 of 3
    expect(latest().playerAssignments).toEqual([
      { kind: 'child', childProfileId: YUWIN.id, firstName: 'Yuwin', age: '9' },
      { kind: 'child', childProfileId: ARTHUR.id, firstName: 'Arthur', age: '11' },
    ])
  })

  it('works with zero children — guests only', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext({ childrenList: [] }))

    await user.click(screen.getByTestId('player-count-2'))
    await user.click(screen.getByTestId('add-guest-player'))
    await user.click(screen.getByTestId('add-guest-player'))
    expect(screen.queryByTestId('add-guest-player')).not.toBeInTheDocument()

    await user.type(screen.getByTestId('guest-name-1'), 'Sam')
    await user.type(screen.getByTestId('guest-name-2'), 'Alex')

    expect(latest()).toMatchObject({ primaryAssigned: true, isComplete: true })
    expect(latest().childProfileId).toBeUndefined()
    expect(latest().playerAssignments).toEqual([
      { kind: 'guest', firstName: 'Sam', age: '' },
      { kind: 'guest', firstName: 'Alex', age: '' },
    ])
  })

  it('ChildSelector "+" tile bumps the player count in group context', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext())

    await user.click(screen.getByTestId(`child-selector-option-${YUWIN.id}`))
    await user.click(screen.getByTestId('child-selector-add'))

    // Bumped 1 → 2 and seeded the pool with the primary.
    expect(latest().players).toBe(2)
    expect(latest().playerAssignments).toEqual([
      { kind: 'child', childProfileId: YUWIN.id, firstName: 'Yuwin', age: '9' },
    ])
  })

  it('collapses the pool to the primary on group → 1-on-1 toggle', async () => {
    const user = userEvent.setup()
    const { latest } = renderPicker(makeContext())

    await user.click(screen.getByTestId('player-count-3'))
    await user.click(screen.getByTestId(`select-child-${YUWIN.id}`))
    await user.click(screen.getByTestId(`select-child-${ARTHUR.id}`))
    await user.click(screen.getByTestId('player-count-1'))

    expect(latest()).toMatchObject({
      players: 1,
      childProfileId: YUWIN.id,
      isComplete: true,
    })

    // Re-entering group mode seeds from the primary only — Arthur must not
    // resurrect.
    await user.click(screen.getByTestId('player-count-3'))
    expect(latest().playerAssignments).toEqual([
      { kind: 'child', childProfileId: YUWIN.id, firstName: 'Yuwin', age: '9' },
    ])
  })

  it('guest-name error copy appears only when the host sets showError', async () => {
    const user = userEvent.setup()
    const context = makeContext()
    const { rerender } = render(
      <AuthedPlayerPicker context={context} showError={false} onChange={() => {}} />,
    )

    await user.click(screen.getByTestId('player-count-2'))
    await user.click(screen.getByTestId(`select-child-${YUWIN.id}`))
    await user.click(screen.getByTestId('add-guest-player'))
    expect(screen.queryByTestId('player-picker-error')).not.toBeInTheDocument()

    rerender(<AuthedPlayerPicker context={context} showError onChange={() => {}} />)
    expect(screen.getByTestId('player-picker-error')).toHaveTextContent(
      'first name to continue',
    )
  })
})
