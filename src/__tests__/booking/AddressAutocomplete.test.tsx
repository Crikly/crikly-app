/** @jest-environment jsdom */
// Tests for src/components/booking/AddressAutocomplete.tsx — fallback path and
// accessibility. The loaded-path (Google Maps ready) tests live in
// AddressAutocomplete.loaded.test.tsx, which mocks @react-google-maps/api at
// the module level using jest.mock hoisting.
//
// In jsdom the Maps script never loads, so useLoadScript returns
// {isLoaded:false, loadError:undefined}. AddressAutocomplete renders
// FallbackInput — a plain controlled <input autoComplete="street-address">.
// No mock of @react-google-maps/api is needed here.

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddressAutocomplete } from '@/components/booking/AddressAutocomplete'
import type { AddressSelection } from '@/components/booking/AddressAutocomplete'

// Silence the "API key not set" console.error that fires in non-production
// when NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is absent. This is expected behaviour
// in the test environment — we suppress it so test output stays clean.
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterAll(() => {
  jest.restoreAllMocks()
})

// ── A. Fallback path — useLoadScript returns {isLoaded:false} ─────────────

describe('AddressAutocomplete — fallback path (Maps not loaded)', () => {
  it('renders a labelled input', () => {
    render(
      <AddressAutocomplete
        label="Address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByLabelText('Address')).toBeInTheDocument()
  })

  it('renders the data-testid attribute on the input', () => {
    render(
      <AddressAutocomplete
        label="Address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
        data-testid="guest-address-input"
      />,
    )

    expect(screen.getByTestId('guest-address-input')).toBeInTheDocument()
  })

  it('calls onChange on every keystroke with the current input value', async () => {
    const onChange = jest.fn()
    const user = userEvent.setup()

    render(
      <AddressAutocomplete
        label="Address"
        value=""
        onChange={onChange}
        onSelect={jest.fn()}
      />,
    )

    const input = screen.getByLabelText('Address')
    // Type a single character so the uncontrolled → controlled interplay does
    // not affect the assertion. onChange must be called with the event value.
    await user.type(input, 'a')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('reflects the controlled value prop in the input', () => {
    render(
      <AddressAutocomplete
        label="Address"
        value="10 Downing Street"
        onChange={jest.fn()}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByLabelText('Address')).toHaveValue('10 Downing Street')
  })

  it('uses autoComplete="street-address" on the fallback input', () => {
    render(
      <AddressAutocomplete
        label="Address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
      />,
    )

    expect(screen.getByLabelText('Address')).toHaveAttribute('autocomplete', 'street-address')
  })

  it('renders the placeholder text', () => {
    render(
      <AddressAutocomplete
        label="Address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
        placeholder="Start typing your address"
      />,
    )

    expect(screen.getByPlaceholderText('Start typing your address')).toBeInTheDocument()
  })
})

// ── C. Accessibility ───────────────────────────────────────────────────────
//
// The label must be associated with the input via htmlFor/id so screen readers
// announce the field name. The id is derived by lower-casing the label and
// replacing spaces with hyphens — asserted here for clarity.

describe('AddressAutocomplete — accessibility', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(
      <AddressAutocomplete
        label="Address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
      />,
    )

    // getByLabelText proves htmlFor resolves to the input's id.
    const input = screen.getByLabelText('Address')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('id', 'address')
  })

  it('derives hyphenated id from multi-word labels', () => {
    render(
      <AddressAutocomplete
        label="Home Address"
        value=""
        onChange={jest.fn()}
        onSelect={jest.fn()}
      />,
    )

    const input = screen.getByLabelText('Home Address')
    expect(input).toHaveAttribute('id', 'home-address')
  })
})

// ── GuestBookingFlow integration note ─────────────────────────────────────
//
// The address field in GuestBookingFlow uses data-testid="guest-address-input".
// That assertion is covered in AddressAutocomplete.loaded.test.tsx (loaded path)
// and the fallback test above. The GuestBookingFlow.test.tsx suite also
// exercises the address field implicitly via the form render tests.
// One targeted assertion is added to GuestBookingFlow.test.tsx to confirm the
// integration wires the testid correctly — see the "renders the address field"
// test in that file.

// Dummy export to keep TypeScript from treating this as a non-module file when
// AddressSelection is only imported for its type.
export type { AddressSelection }
