'use client'

import React, { useRef, useEffect } from 'react'
import { useLoadScript } from '@react-google-maps/api'
import { MapPin } from 'lucide-react'

const LIBRARIES: ['places'] = ['places']

export interface LocationSelection {
  city: string
  lat: number
  lng: number
}

interface LocationAutocompleteProps {
  value: string
  onSelect: (location: LocationSelection) => void
  onChange: (value: string) => void
  placeholder?: string
  'data-testid'?: string
}

function PlacesInput({
  value,
  onSelect,
  onChange,
  placeholder,
  'data-testid': testId,
}: LocationAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    if (!inputRef.current) return

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['geocode'],
      componentRestrictions: { country: 'gb' },
      fields: ['name', 'geometry'],
    })

    const listener = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      if (!place?.geometry?.location || !place.name) return

      onSelect({
        city: place.name,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      })
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [onSelect])

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <MapPin size={18} className="text-gray-400" />
      </div>
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
      />
    </div>
  )
}

function FallbackInput({
  value,
  onChange,
  placeholder,
  'data-testid': testId,
}: Omit<LocationAutocompleteProps, 'onSelect'>) {
  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
        <MapPin size={18} className="text-gray-400" />
      </div>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all"
      />
    </div>
  )
}

export function LocationAutocomplete(props: LocationAutocompleteProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? '',
    libraries: LIBRARIES,
  })

  if (loadError || !isLoaded) {
    return (
      <FallbackInput
        value={props.value}
        onChange={props.onChange}
        placeholder={props.placeholder}
        data-testid={props['data-testid']}
      />
    )
  }

  return <PlacesInput {...props} />
}

// ─── VenueAutocomplete ────────────────────────────────────────────────────────
// Establishments + geocode, UK only. Used in availability blocks.
// Shares LIBRARIES reference with LocationAutocomplete — script loads once.

export interface VenueSelection {
  name: string
  address: string
  lat: number
  lng: number
}

interface VenueAutocompleteProps {
  value: string
  onSelect: (venue: VenueSelection) => void
  onChange: (value: string) => void
  placeholder?: string
  'data-testid'?: string
}

const VENUE_INPUT_CLASS =
  'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0077CC]'

function VenuePlacesInput({
  value,
  onSelect,
  onChange,
  placeholder,
  'data-testid': testId,
}: VenueAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    if (!inputRef.current) return

    autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['establishment', 'geocode'],
      componentRestrictions: { country: 'gb' },
      fields: ['name', 'formatted_address', 'geometry'],
    })

    const listener = autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current?.getPlace()
      if (!place?.geometry?.location) return

      onSelect({
        name: place.name ?? '',
        address: place.formatted_address ?? '',
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      })
    })

    return () => {
      google.maps.event.removeListener(listener)
    }
  }, [onSelect])

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      data-testid={testId}
      className={VENUE_INPUT_CLASS}
    />
  )
}

export function VenueAutocomplete(props: VenueAutocompleteProps) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY ?? '',
    libraries: LIBRARIES,
  })

  if (loadError || !isLoaded) {
    return (
      <input
        type="text"
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        data-testid={props['data-testid']}
        className={VENUE_INPUT_CLASS}
      />
    )
  }

  return <VenuePlacesInput {...props} />
}
