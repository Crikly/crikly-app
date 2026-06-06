'use client'

import { useEffect, useRef, useState } from 'react'
import { useLoadScript } from '@react-google-maps/api'

// HERO-SEARCH-01: Google Places autocomplete for the landing hero search
// bar. Three render layers:
//   1. PlainInput — what every visitor sees on first paint. No Google
//      script loaded. Visitors who never touch the search bar pay zero
//      Google Maps cost.
//   2. PlacesEnabledInput — mounted only after the input first receives
//      focus. Lazy-loads the Maps script via useLoadScript. Renders the
//      plain input as a fallback while loading or on load error.
//   3. PlacesAutocompleteInput — wires google.maps.places.Autocomplete
//      to the input ref once the script is ready. Returns the picked
//      place's name (postal_town → locality → place.name) as a string
//      to the parent via onSelect — same string contract as the
//      hero's existing setLocation callback. lat/lng intentionally
//      ignored at this stage (future task).
//
// LIBRARIES is a module-scoped const so useLoadScript's identity check
// doesn't fire a re-load on every render (same pattern as
// src/components/coach/shared/LocationAutocomplete.tsx).
const LIBRARIES: ['places'] = ['places']

interface HeroLocationInputProps {
  value: string
  onChange: (v: string) => void
  // Called when the user picks a suggestion from the dropdown. The
  // string is the place's display name — e.g. "London", "Manchester".
  onSelect: (placeName: string) => void
  placeholder?: string
  className?: string
  id?: string
}

export function HeroLocationInput(props: HeroLocationInputProps) {
  const [activated, setActivated] = useState(false)

  if (!activated) {
    return (
      <PlainInput
        {...props}
        onFocus={() => setActivated(true)}
      />
    )
  }

  return <PlacesEnabledInput {...props} />
}

// ─── Layer 1: plain input until first focus ─────────────────────────────────

function PlainInput({
  value,
  onChange,
  placeholder,
  className,
  id,
  onFocus,
}: Omit<HeroLocationInputProps, 'onSelect'> & { onFocus: () => void }) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      autoComplete="off"
      className={className}
    />
  )
}

// ─── Layer 2: script loader (mounts only after activation) ──────────────────

function PlacesEnabledInput(props: HeroLocationInputProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? '',
    libraries: LIBRARIES,
  })

  if (loadError) {
    console.error('[HeroLocationInput] Google Maps script failed to load:', loadError)
  }

  if (loadError || !isLoaded) {
    // Fall back to a plain input while the script is loading or if it
    // failed. autoFocus restores focus the user had pre-activation.
    return (
      <input
        id={props.id}
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        autoComplete="off"
        className={props.className}
        autoFocus
      />
    )
  }

  return <PlacesAutocompleteInput {...props} />
}

// ─── Layer 3: Autocomplete wired to the input ───────────────────────────────

function PlacesAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  id,
}: HeroLocationInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  // Fix-94: keep onSelect in a ref so the Autocomplete instance only
  // initialises once on mount, regardless of parent re-renders. Pattern
  // mirrors src/components/coach/shared/LocationAutocomplete.tsx:34-37.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!inputRef.current) return

    autocompleteRef.current = new google.maps.places.Autocomplete(
      inputRef.current,
      {
        types: ['geocode'],
        componentRestrictions: { country: 'gb' },
        fields: ['name', 'address_components'],
      },
    )

    const listener = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      if (!place) return

      const components = place.address_components ?? []
      const find = (...types: string[]) =>
        components.find((c) => types.some((t) => c.types.includes(t)))
          ?.long_name ?? null

      // postal_town (UK convention) → locality → place name. If all three
      // are empty (rare — Google returned a partial result with no usable
      // labels), leave parent state untouched rather than clear the input
      // and lose what the user just picked.
      const placeName = find('postal_town') ?? find('locality') ?? place.name
      if (placeName) onSelectRef.current(placeName)
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [])

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      // defaultValue (not value) because Google's Autocomplete sets the
      // input's DOM value directly when a suggestion is picked; a
      // controlled value would fight that update.
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className={className}
      autoFocus
    />
  )
}
