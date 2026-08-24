/** @jest-environment jsdom */

// P-07 — ChildSelector: pure props-driven picker for the booking flow
// (REQ-P-004). P-10 wires it; here we verify semantics and callbacks.

import { fireEvent, render, screen } from '@testing-library/react'
import { ChildSelector } from '@/components/parent/children/ChildSelector'

const CHILDREN = [
  { id: 'c1', firstName: 'Kiran', colour: '#0d9488', age: 9 },
  { id: 'c2', firstName: 'Anaya', colour: '#f97316', age: 7 },
]

describe('ChildSelector', () => {
  it('renders a radiogroup with one radio per child and the default label', () => {
    render(
      <ChildSelector
        childrenList={CHILDREN}
        selectedChildId="c1"
        onSelect={jest.fn()}
      />,
    )
    expect(
      screen.getByRole('radiogroup', { name: 'Who is this session for?' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByTestId('child-selector-option-c1')).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByTestId('child-selector-option-c2')).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('fires onSelect with the tapped child id', () => {
    const onSelect = jest.fn()
    render(
      <ChildSelector
        childrenList={CHILDREN}
        selectedChildId="c1"
        onSelect={onSelect}
      />,
    )
    fireEvent.click(screen.getByTestId('child-selector-option-c2'))
    expect(onSelect).toHaveBeenCalledWith('c2')
  })

  it('moves and selects with arrow keys (roving tabindex)', () => {
    const onSelect = jest.fn()
    render(
      <ChildSelector
        childrenList={CHILDREN}
        selectedChildId="c1"
        onSelect={onSelect}
      />,
    )
    // Only the selected option sits in the tab order.
    expect(screen.getByTestId('child-selector-option-c1')).toHaveAttribute('tabindex', '0')
    expect(screen.getByTestId('child-selector-option-c2')).toHaveAttribute('tabindex', '-1')

    fireEvent.keyDown(screen.getByTestId('child-selector-option-c1'), {
      key: 'ArrowRight',
    })
    expect(onSelect).toHaveBeenCalledWith('c2')

    // Wraps from the first option back to the last.
    fireEvent.keyDown(screen.getByTestId('child-selector-option-c1'), {
      key: 'ArrowLeft',
    })
    expect(onSelect).toHaveBeenCalledWith('c2')
  })

  it('always offers an Add a child option routing to the add form', () => {
    render(
      <ChildSelector
        childrenList={CHILDREN}
        selectedChildId={null}
        onSelect={jest.fn()}
      />,
    )
    expect(screen.getByTestId('child-selector-add')).toHaveAttribute(
      'href',
      '/parent/children/new',
    )
  })

  it('accepts a custom addChildHref for booking-flow return context', () => {
    render(
      <ChildSelector
        childrenList={[]}
        selectedChildId={null}
        onSelect={jest.fn()}
        addChildHref="/parent/children/new?return=booking"
      />,
    )
    expect(screen.getByTestId('child-selector-add')).toHaveAttribute(
      'href',
      '/parent/children/new?return=booking',
    )
  })
})

// ─── BUG-77: addLabel prop ─────────────────────────────────────────────────────

describe('ChildSelector — addLabel (BUG-77)', () => {
  it('defaults the add tile to "Add a child" (management context unchanged)', () => {
    render(
      <ChildSelector childrenList={[]} selectedChildId={null} onSelect={() => {}} />,
    )
    expect(screen.getByTestId('child-selector-add')).toHaveTextContent('Add a child')
  })

  it('renders a custom addLabel (booking context passes "Add player")', () => {
    render(
      <ChildSelector
        childrenList={[]}
        selectedChildId={null}
        onSelect={() => {}}
        addLabel="Add player"
      />,
    )
    expect(screen.getByTestId('child-selector-add')).toHaveTextContent('Add player')
  })
})
