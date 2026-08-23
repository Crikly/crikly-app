/** @jest-environment jsdom */

// P-07 — dashboard bubble wiring (Step 0 decision A): tapping the active
// bubble opens the child's profile card; tapping an inactive bubble keeps
// the P-04 context-switch behaviour.

import { fireEvent, render, screen } from '@testing-library/react'
import { ChildBubbleRow } from '@/components/parent/dashboard/ChildBubbleRow'

jest.mock('gsap', () => ({
  gsap: { fromTo: jest.fn() },
}))

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const CHILDREN = [
  { id: 'c1', fullName: 'Kiran Shah', firstName: 'Kiran', colour: '#0d9488' },
  { id: 'c2', fullName: 'Anaya Shah', firstName: 'Anaya', colour: '#f97316' },
]

describe('ChildBubbleRow', () => {
  beforeEach(() => jest.clearAllMocks())

  it('navigates to the child profile when the ACTIVE bubble is tapped', () => {
    const onSelect = jest.fn()
    render(
      <ChildBubbleRow
        childrenList={CHILDREN}
        activeChildId="c1"
        onSelect={onSelect}
        prefersReduced
      />,
    )
    fireEvent.click(screen.getByTestId('child-bubble-c1'))
    expect(push).toHaveBeenCalledWith('/parent/children/c1')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('switches context (no navigation) when an INACTIVE bubble is tapped', () => {
    const onSelect = jest.fn()
    render(
      <ChildBubbleRow
        childrenList={CHILDREN}
        activeChildId="c1"
        onSelect={onSelect}
        prefersReduced
      />,
    )
    fireEvent.click(screen.getByTestId('child-bubble-c2'))
    expect(onSelect).toHaveBeenCalledWith('c2')
    expect(push).not.toHaveBeenCalled()
  })
})
