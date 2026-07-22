/** @jest-environment jsdom */
// Tests for the PlacesInput branch of AddressAutocomplete — the path that
// executes when the Google Maps script has loaded successfully.
//
// Strategy: mock @react-google-maps/api at module-level (jest.mock is hoisted)
// to return {isLoaded:true, loadError:undefined}. Stub the global
// google.maps.places.Autocomplete constructor so we can capture the
// place_changed listener and fire it with controlled place objects.
//
// The fallback-path and accessibility tests live in
// AddressAutocomplete.test.tsx — kept separate so the top-level mock here
// does not bleed into the real useLoadScript fallback behaviour exercised there.

import React from 'react'
import { render, screen, act } from '@testing-library/react'
import type { AddressSelection } from '@/components/booking/AddressAutocomplete'

// Mock @react-google-maps/api BEFORE importing the component so that when
// AddressAutocomplete calls useLoadScript it gets the stub immediately.
jest.mock('@react-google-maps/api', () => ({
  useLoadScript: () => ({ isLoaded: true, loadError: undefined }),
}))

// Import AFTER mocks are in place.
import { AddressAutocomplete } from '@/components/booking/AddressAutocomplete'

// Silence the "API key not set" console.error — it fires in non-production
// when NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is absent. Expected in CI/test env.
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterAll(() => {
  jest.restoreAllMocks()
})

// ── Google Maps global stub ────────────────────────────────────────────────
//
// PlacesInput calls `new google.maps.places.Autocomplete(...)` and
// `google.maps.event.removeListener(listener)` inside a useEffect.
// We create a fresh stub before each test so every test starts clean.

type PlaceChangedCallback = () => void

// Typed handle on the global so we can install/remove the google.maps stub
// without an `any` cast (project rule: no `any`, ever). The mock is a partial
// shape, so we go through `unknown` to satisfy the full google namespace type.
const globalWithGoogle = globalThis as unknown as { google?: typeof google }

let capturedListener: PlaceChangedCallback | null = null
let mockGetPlace: jest.Mock

beforeEach(() => {
  capturedListener = null
  mockGetPlace = jest.fn()

  globalWithGoogle.google = {
    maps: {
      places: {
        Autocomplete: jest.fn().mockImplementation(() => ({
          addListener: jest.fn().mockImplementation(
            (event: string, callback: PlaceChangedCallback) => {
              if (event === 'place_changed') {
                capturedListener = callback
              }
              // Return a listener handle (the component passes this to removeListener)
              return { remove: jest.fn() }
            },
          ),
          getPlace: mockGetPlace,
        })),
      },
      event: {
        removeListener: jest.fn(),
      },
    },
  } as unknown as typeof google
})

afterEach(() => {
  delete globalWithGoogle.google
  jest.clearAllMocks()
})

// ── Helper ─────────────────────────────────────────────────────────────────

function renderLoaded(
  onSelect: jest.Mock,
  onChange: jest.Mock = jest.fn(),
) {
  return render(
    <AddressAutocomplete
      label="Address"
      value=""
      onChange={onChange}
      onSelect={onSelect}
      data-testid="guest-address-input"
    />,
  )
}

// ── B. Loaded-path tests ───────────────────────────────────────────────────

describe('AddressAutocomplete — loaded path (Maps ready)', () => {
  it('renders the input when Maps is loaded', () => {
    renderLoaded(jest.fn())
    expect(screen.getByTestId('guest-address-input')).toBeInTheDocument()
  })

  it('associates the label with the input in the loaded path', () => {
    renderLoaded(jest.fn())
    expect(screen.getByLabelText('Address')).toBeInTheDocument()
  })

  it('attaches a place_changed listener on mount', () => {
    renderLoaded(jest.fn())
    // The useEffect runs after render; listener must be captured by now.
    expect(capturedListener).not.toBeNull()
  })

  it('calls onSelect with correct addressLine, townCity, and postcode for a full place', () => {
    const onSelect = jest.fn()
    renderLoaded(onSelect)

    mockGetPlace.mockReturnValue({
      address_components: [
        { long_name: '10', short_name: '10', types: ['street_number'] },
        { long_name: 'Downing Street', short_name: 'Downing St', types: ['route'] },
        { long_name: 'Westminster', short_name: 'Westminster', types: ['postal_town'] },
        { long_name: 'SW1A 2AA', short_name: 'SW1A 2AA', types: ['postal_code'] },
      ],
      formatted_address: '10 Downing Street, Westminster, London SW1A 2AA, UK',
    })

    act(() => {
      capturedListener?.()
    })

    expect(onSelect).toHaveBeenCalledTimes(1)
    const selection = onSelect.mock.calls[0][0] as AddressSelection
    expect(selection.addressLine).toBe('10 Downing Street')
    expect(selection.townCity).toBe('Westminster')
    expect(selection.postcode).toBe('SW1A 2AA')
  })

  it('falls back to locality when postal_town is absent', () => {
    const onSelect = jest.fn()
    renderLoaded(onSelect)

    mockGetPlace.mockReturnValue({
      address_components: [
        { long_name: '5', short_name: '5', types: ['street_number'] },
        { long_name: 'Park Lane', short_name: 'Park Ln', types: ['route'] },
        // No postal_town; only locality
        { long_name: 'Mayfair', short_name: 'Mayfair', types: ['locality'] },
        { long_name: 'W1K 1QA', short_name: 'W1K 1QA', types: ['postal_code'] },
      ],
      formatted_address: '5 Park Lane, Mayfair, London W1K 1QA, UK',
    })

    act(() => {
      capturedListener?.()
    })

    expect(onSelect).toHaveBeenCalledTimes(1)
    const selection = onSelect.mock.calls[0][0] as AddressSelection
    expect(selection.townCity).toBe('Mayfair')
  })

  it('falls back to first comma-segment of formatted_address when no street_number/route', () => {
    const onSelect = jest.fn()
    renderLoaded(onSelect)

    mockGetPlace.mockReturnValue({
      // address_components present but no street_number or route
      address_components: [
        { long_name: 'Sheffield', short_name: 'Sheffield', types: ['locality'] },
        { long_name: 'S1 2BJ', short_name: 'S1 2BJ', types: ['postal_code'] },
      ],
      formatted_address: 'Sheffield Station, Sheaf Square, Sheffield S1 2BJ, UK',
    })

    act(() => {
      capturedListener?.()
    })

    expect(onSelect).toHaveBeenCalledTimes(1)
    const selection = onSelect.mock.calls[0][0] as AddressSelection
    // Extraction: no street_number + route → first comma-segment of formatted_address
    expect(selection.addressLine).toBe('Sheffield Station')
  })

  it('does NOT call onSelect when place_changed fires on Enter-without-select (empty place object)', () => {
    const onSelect = jest.fn()
    renderLoaded(onSelect)

    // getPlace() returns an object with neither address_components nor formatted_address
    mockGetPlace.mockReturnValue({})

    act(() => {
      capturedListener?.()
    })

    // Guard must prevent onSelect from being called — otherwise the form fields
    // would be wiped to empty strings on Enter keypress.
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does NOT call onSelect when address_components is empty and formatted_address is absent', () => {
    const onSelect = jest.fn()
    renderLoaded(onSelect)

    mockGetPlace.mockReturnValue({
      address_components: [],
      // no formatted_address
    })

    act(() => {
      capturedListener?.()
    })

    expect(onSelect).not.toHaveBeenCalled()
  })
})
