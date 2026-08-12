/** @jest-environment jsdom */

// P-07 (Screen 07) — child profile player card.

import { render, screen } from '@testing-library/react'
import { ChildProfileCard } from '@/components/parent/children/ChildProfileCard'
import type { ChildCardData } from '@/components/parent/children/types'

jest.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))
jest.mock('@gsap/react', () => ({
  useGSAP: () => undefined,
}))
jest.mock('gsap', () => ({
  gsap: { to: jest.fn(), from: jest.fn(), fromTo: jest.fn() },
}))

function makeChild(overrides: Partial<ChildCardData> = {}): ChildCardData {
  return {
    id: 'ch-1',
    fullName: 'Kiran Shah',
    firstName: 'Kiran',
    age: 9,
    colour: '#0d9488',
    gender: 'male',
    medicalNotes: null,
    sportName: 'Cricket',
    sportSlug: 'cricket',
    skillLevel: 'beginner',
    sessionsCompleted: 0,
    nextSession: null,
    ...overrides,
  }
}

describe('ChildProfileCard', () => {
  it('renders the header with name, age · sport subline, back and edit links', () => {
    render(<ChildProfileCard child={makeChild()} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kiran')
    expect(screen.getByText('Age 9 · Cricket')).toBeInTheDocument()
    expect(screen.getByTestId('child-card-back')).toHaveAttribute(
      'href',
      '/parent/dashboard',
    )
    expect(screen.getByTestId('child-card-edit')).toHaveAttribute(
      'href',
      '/parent/children/ch-1/edit',
    )
  })

  it('shows the skill level for the selected sport', () => {
    render(<ChildProfileCard child={makeChild()} />)
    expect(screen.getByText('Skill level: Beginner')).toBeInTheDocument()
  })

  it('shows a no-sport state linking to edit when no sport is set', () => {
    render(
      <ChildProfileCard child={makeChild({ sportName: null, skillLevel: null })} />,
    )
    expect(screen.getByText(/No sport yet/)).toBeInTheDocument()
    expect(screen.getByText('Age 9')).toBeInTheDocument()
  })

  it('shows coaching history count with singular/plural copy', () => {
    const { rerender } = render(
      <ChildProfileCard child={makeChild({ sessionsCompleted: 1 })} />,
    )
    expect(screen.getByTestId('sessions-completed')).toHaveTextContent('1')
    expect(screen.getByText('session completed with Crikly')).toBeInTheDocument()

    rerender(<ChildProfileCard child={makeChild({ sessionsCompleted: 4 })} />)
    expect(screen.getByText('sessions completed with Crikly')).toBeInTheDocument()
  })

  it('empty next-session state offers Find a coach with the child name', () => {
    render(<ChildProfileCard child={makeChild()} />)
    expect(screen.getByTestId('next-session-row')).toHaveTextContent(
      'No sessions yet',
    )
    expect(screen.getByTestId('find-coach-link')).toHaveTextContent(
      'Find a coach for Kiran',
    )
  })

  it("links Find a coach to the child's sport, falling back to cricket", () => {
    const { rerender } = render(
      <ChildProfileCard child={makeChild({ sportSlug: 'tennis' })} />,
    )
    expect(screen.getByTestId('find-coach-link')).toHaveAttribute(
      'href',
      '/coaches?sport=tennis&role=parent',
    )

    rerender(
      <ChildProfileCard
        child={makeChild({ sportName: null, sportSlug: null, skillLevel: null })}
      />,
    )
    expect(screen.getByTestId('find-coach-link')).toHaveAttribute(
      'href',
      '/coaches?sport=cricket&role=parent',
    )
  })

  it('renders the next session when one exists', () => {
    render(
      <ChildProfileCard
        child={makeChild({
          nextSession: {
            dateLabel: 'Sat 15 Aug',
            timeLabel: '10:00',
            coachName: 'Ravi Sharma',
          },
        })}
      />,
    )
    expect(screen.getByTestId('next-session-row')).toHaveTextContent(
      'Sat 15 Aug · 10:00 with Ravi Sharma',
    )
    expect(screen.queryByTestId('find-coach-link')).not.toBeInTheDocument()
  })

  it('shows the safety note when set, and the add prompt when empty', () => {
    const { rerender } = render(
      <ChildProfileCard child={makeChild({ medicalNotes: 'Mild asthma' })} />,
    )
    expect(screen.getByTestId('safety-note-tile')).toHaveTextContent('Mild asthma')

    rerender(<ChildProfileCard child={makeChild()} />)
    expect(screen.getByTestId('safety-note-tile')).toHaveTextContent(
      'Add a safety note for coaches (optional)',
    )
  })

  it('marks the Training Passport tile as coming soon', () => {
    render(<ChildProfileCard child={makeChild()} />)
    expect(screen.getByText('COMING SOON')).toBeInTheDocument()
  })
})
