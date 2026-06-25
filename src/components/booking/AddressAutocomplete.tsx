'use client'

import React, { useRef, useEffect } from 'react'
import { useLoadScript } from '@react-google-maps/api'

// Shares the same ['places'] tuple shape used by LocationAutocomplete so the
// Maps script is loaded once across the app (useLoadScript dedupes by libraries).
const LIBRARIES: ['places'] = ['places']

export interface AddressSelection {
  /** street_number + route, e.g. "10 Downing Street". */
  addressLine: string
  /** postal_town, falling back to locality. */
  townCity: string
  /** postal_code. Empty string when Google returns no postcode. */
  postcode: string
}

interface AddressAutocompleteProps {
  label: string
  value: string
  /** Fired on every keystroke when the user types without picking a suggestion. */
  onChange: (value: string) => void
  /** Fired when a Places suggestion is selected — populates all three fields. */
  onSelect: (selection: AddressSelection) => void
  placeholder?: string
  'data-testid'?: string
}

// Mirrors src/components/ui/Input.tsx exactly so the field is visually identical
// to the rest of the checkout form. Input.tsx is controlled (value); Google's
// Autocomplete writes directly to the DOM .value on selection, which fights a
// controlled input — so this field is uncontrolled (defaultValue), matching the
// pattern already established in LocationAutocomplete.
const FIELD_CLASS = [
  'h-[48px] md:h-[44px] w-full px-[14px]',
  'bg-[#F8FAFC] border border-neutral-100 rounded-[10px]',
  'text-base text-neutral-900 placeholder:text-neutral-400',
  'transition-colors duration-fast',
  'focus:outline-none focus:border-brand-600 focus:shadow-[0_0_0_3px_rgba(0,119,204,0.18)] focus:bg-white',
].join(' ')

function FieldShell({
  label,
  inputId,
  children,
}: {
  label: string
  inputId: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-xs font-semibold text-[#64748B] uppercase tracking-label"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

function PlacesInput({
  label,
  value,
  onChange,
  onSelect,
  placeholder,
  'data-testid': testId,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const inputId = label.toLowerCase().replace(/\s+/g, '-')

  // Keep onSelect in a ref so the Autocomplete instance only initialises once on
  // mount, regardless of parent re-renders (mirrors LocationAutocomplete Fix-94).
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!inputRef.current) return

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'gb' },
      fields: ['address_components', 'formatted_address'],
    })

    const listener = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      // Google fires place_changed even when the user presses Enter without
      // picking a suggestion — getPlace() then returns an object with no
      // address data. Ignore it, otherwise we'd wipe the fields to empty.
      if (!place?.address_components?.length && !place?.formatted_address) return

      const components = place.address_components ?? []
      const find = (...types: string[]) =>
        components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? ''

      const streetNumber = find('street_number')
      const route = find('route')
      const addressLine =
        [streetNumber, route].filter(Boolean).join(' ') ||
        // Fallback for places that lack a discrete street_number/route: take the
        // first segment of the formatted address (before the town/postcode tail).
        (place.formatted_address?.split(',')[0]?.trim() ?? '')

      const townCity = find('postal_town') || find('locality')
      const postcode = find('postal_code')

      // Reflect the chosen street line back into the input the user sees. Google
      // sets the DOM value to the full formatted address by default; we override
      // it to just the street line so it matches what we store in `address`.
      if (inputRef.current && addressLine) {
        inputRef.current.value = addressLine
      }

      onSelectRef.current({ addressLine, townCity, postcode })
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, []) // empty deps — Autocomplete created once on mount; latest onSelect via ref

  return (
    <FieldShell label={label} inputId={inputId}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        data-testid={testId}
        className={FIELD_CLASS}
      />
    </FieldShell>
  )
}

function FallbackInput({
  label,
  value,
  onChange,
  placeholder,
  'data-testid': testId,
}: Omit<AddressAutocompleteProps, 'onSelect'>) {
  const inputId = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <FieldShell label={label} inputId={inputId}>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="street-address"
        data-testid={testId}
        className={FIELD_CLASS}
      />
    </FieldShell>
  )
}

/**
 * UK address autocomplete for the guest checkout form. Renders identically to the
 * shared Input. While the Maps script loads (or if it fails), degrades to a plain
 * text field so checkout is never blocked. Google's default suggestion dropdown
 * (.pac-container) is left untouched so the required "Powered by Google"
 * attribution stays visible.
 */
export function AddressAutocomplete(props: AddressAutocompleteProps) {
  if (
    process.env.NODE_ENV !== 'production' &&
    !process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY
  ) {
    console.error(
      '[AddressAutocomplete] NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is not set — falling back to plain input',
    )
  }

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? '',
    libraries: LIBRARIES,
  })

  if (loadError || !isLoaded) {
    return (
      <FallbackInput
        label={props.label}
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        data-testid={props['data-testid']}
      />
    )
  }

  return <PlacesInput {...props} />
}
