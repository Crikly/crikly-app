'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin, Search } from 'lucide-react'

// P-04-A (Screen 06): search entry point below the hero. Sport is
// pre-filled with Cricket (Phase 1 is cricket-only — the /coaches page
// hardcodes sport=cricket on its side too). The Where field feeds the
// /coaches ?location param, which is that page's real search driver.

interface SearchBarProps {
  /** Active child's first name — CTA reads "…for [child]". Null hides the suffix. */
  activeChildName: string | null
}

export function SearchBar({ activeChildName }: SearchBarProps) {
  const router = useRouter()
  const [location, setLocation] = useState('')

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams({ sport: 'cricket', role: 'parent' })
    const trimmed = location.trim()
    if (trimmed) params.set('location', trimmed)
    router.push(`/coaches?${params.toString()}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-white p-4 shadow-md md:p-5"
      data-testid="parent-search-bar"
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="flex flex-1 items-center gap-3 rounded-md bg-neutral-50 px-4 py-3">
          <Search size={18} className="flex-shrink-0 text-neutral-400" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-label text-neutral-400">
              Sport
            </p>
            <p className="text-base font-medium text-neutral-900">Cricket</p>
          </div>
        </div>
        <label className="flex flex-1 items-center gap-3 rounded-md bg-neutral-50 px-4 py-3">
          <MapPin size={18} className="flex-shrink-0 text-neutral-400" />
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-label text-neutral-400">
              Where
            </span>
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Postcode or area"
              className="w-full border-none bg-transparent text-base font-medium text-neutral-900 outline-none placeholder:font-regular placeholder:text-neutral-400"
              data-testid="search-where-input"
            />
          </div>
        </label>
        <button
          type="submit"
          className="h-btn-mobile flex-shrink-0 rounded-md bg-brand-600 px-6 text-base font-medium text-white transition-colors hover:bg-brand-700 md:h-auto"
          data-testid="search-cta"
        >
          {activeChildName
            ? `Find a cricket coach for ${activeChildName}`
            : 'Find a cricket coach'}
        </button>
      </div>
      <p className="mt-3 text-sm text-neutral-400">
        Find verified coaches near you.
      </p>
    </form>
  )
}
