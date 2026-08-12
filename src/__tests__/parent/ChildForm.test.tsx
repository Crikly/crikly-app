/** @jest-environment jsdom */

// P-07 (Screens 08 + 09) — shared add/edit child form. Step 0 decisions
// under test: name + DOB gate the CTA (gender optional), skill required
// only once a sport is selected, under-16 DOB rule with Player-account
// copy, inline (never window.confirm) remove confirmation.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChildForm } from '@/components/parent/children/ChildForm'
import type { ChildFormInitialValues } from '@/components/parent/children/types'

jest.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))
jest.mock('@gsap/react', () => ({
  useGSAP: () => undefined,
}))
jest.mock('gsap', () => ({
  gsap: { to: jest.fn(), from: jest.fn(), fromTo: jest.fn() },
}))

const push = jest.fn()
const refresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

const SPORT_ID = '11111111-2222-3333-4444-555555555555'
const SPORTS = [{ id: SPORT_ID, name: 'Cricket' }]
const YOUNG_DOB = '2020-03-14'
const ADULT_DOB = '2005-03-14'
const COLOUR = '#0d9488'

const INITIAL: ChildFormInitialValues = {
  id: 'ch-1',
  fullName: 'Kiran Shah',
  dateOfBirth: YOUNG_DOB,
  gender: 'male',
  medicalNotes: 'Mild asthma',
  sportId: SPORT_ID,
  skillLevel: 'beginner',
}

function fillRequired() {
  fireEvent.change(screen.getByTestId('child-name-input'), {
    target: { value: 'Kiran' },
  })
  fireEvent.change(screen.getByTestId('child-dob-input'), {
    target: { value: YOUNG_DOB },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'ch-new' }),
  }) as jest.Mock
})

describe('ChildForm — create mode', () => {
  it('disables the CTA until name and DOB are valid; gender stays optional', () => {
    render(<ChildForm mode="create" sports={SPORTS} colour={COLOUR} />)
    const cta = screen.getByTestId('child-form-submit')
    expect(cta).toBeDisabled()
    expect(cta).toHaveTextContent('Add your child to your account')

    fillRequired()
    expect(screen.getByTestId('child-form-submit')).toBeEnabled()
    expect(screen.getByTestId('child-form-submit')).toHaveTextContent(
      'Add Kiran to your account',
    )
  })

  it('shows the Player-account copy and blocks submit for a 16+ DOB', () => {
    render(<ChildForm mode="create" sports={SPORTS} colour={COLOUR} />)
    fireEvent.change(screen.getByTestId('child-name-input'), {
      target: { value: 'Kiran' },
    })
    fireEvent.change(screen.getByTestId('child-dob-input'), {
      target: { value: ADULT_DOB },
    })
    expect(
      screen.getByText(/they can create their own Player account/),
    ).toBeInTheDocument()
    expect(screen.getByTestId('child-form-submit')).toBeDisabled()
  })

  it('reveals skill pills only when a sport is selected, and requires a skill', () => {
    render(<ChildForm mode="create" sports={SPORTS} colour={COLOUR} />)
    fillRequired()
    expect(screen.queryByTestId('skill-beginner')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId(`sport-${SPORT_ID}`))
    expect(screen.getByTestId('skill-beginner')).toBeInTheDocument()
    // Sport picked but no skill yet — decision D: skill required per sport.
    expect(screen.getByTestId('child-form-submit')).toBeDisabled()

    fireEvent.click(screen.getByTestId('skill-beginner'))
    expect(screen.getByTestId('child-form-submit')).toBeEnabled()

    // Tapping the active sport pill deselects — skills hide, CTA re-enables.
    fireEvent.click(screen.getByTestId(`sport-${SPORT_ID}`))
    expect(screen.queryByTestId('skill-beginner')).not.toBeInTheDocument()
    expect(screen.getByTestId('child-form-submit')).toBeEnabled()
  })

  it('POSTs the payload and routes to the new child profile', async () => {
    render(<ChildForm mode="create" sports={SPORTS} colour={COLOUR} />)
    fillRequired()
    fireEvent.click(screen.getByTestId('gender-male'))
    fireEvent.click(screen.getByTestId(`sport-${SPORT_ID}`))
    fireEvent.click(screen.getByTestId('skill-beginner'))
    fireEvent.change(screen.getByTestId('child-safety-note'), {
      target: { value: '  Mild asthma  ' },
    })
    fireEvent.click(screen.getByTestId('child-form-submit'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/children/ch-new'))
    expect(global.fetch).toHaveBeenCalledWith('/api/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        gender: 'male',
        medical_notes: 'Mild asthma',
        sports: [{ sport_id: SPORT_ID, skill_level: 'beginner' }],
      }),
    })
  })

  it('renders a server error inline', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Validation failed', details: ['full_name is required'] }),
    })
    render(<ChildForm mode="create" sports={SPORTS} colour={COLOUR} />)
    fillRequired()
    fireEvent.click(screen.getByTestId('child-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('child-form-error')).toHaveTextContent(
        'full_name is required',
      ),
    )
    expect(push).not.toHaveBeenCalled()
  })
})

describe('ChildForm — edit mode', () => {
  it('pre-fills every field from initial values', () => {
    render(
      <ChildForm mode="edit" sports={SPORTS} colour={COLOUR} initial={INITIAL} />,
    )
    expect(screen.getByTestId('child-name-input')).toHaveValue('Kiran Shah')
    expect(screen.getByTestId('child-dob-input')).toHaveValue(YOUNG_DOB)
    expect(screen.getByTestId('gender-male')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId(`sport-${SPORT_ID}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('skill-beginner')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('child-safety-note')).toHaveValue('Mild asthma')
    expect(screen.getByTestId('child-form-submit')).toHaveTextContent('Save changes')
  })

  it('PATCHes on save and routes back to the child profile', async () => {
    render(
      <ChildForm mode="edit" sports={SPORTS} colour={COLOUR} initial={INITIAL} />,
    )
    fireEvent.change(screen.getByTestId('child-name-input'), {
      target: { value: 'Kiran S' },
    })
    fireEvent.click(screen.getByTestId('child-form-submit'))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/children/ch-1'))
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ]
    expect(url).toBe('/api/children/ch-1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string).full_name).toBe('Kiran S')
  })

  it('remove uses an inline two-button confirmation, never window.confirm', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm')
    render(
      <ChildForm mode="edit" sports={SPORTS} colour={COLOUR} initial={INITIAL} />,
    )
    expect(screen.queryByTestId('remove-confirm')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('remove-child-button'))
    expect(screen.getByTestId('remove-confirm')).toHaveTextContent(
      'Remove Kiran from your account?',
    )
    expect(screen.getByTestId('remove-confirm')).toHaveTextContent(
      'This cannot be undone.',
    )

    // Cancel dismisses without any request.
    fireEvent.click(screen.getByTestId('remove-confirm-cancel'))
    expect(screen.queryByTestId('remove-confirm')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()

    // Confirm deletes and routes to the dashboard.
    fireEvent.click(screen.getByTestId('remove-child-button'))
    fireEvent.click(screen.getByTestId('remove-confirm-yes'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/parent/dashboard'))
    expect(global.fetch).toHaveBeenCalledWith('/api/children/ch-1', {
      method: 'DELETE',
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })
})
