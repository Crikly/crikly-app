'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { Check, Circle, Heart } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

// Mirrors the response shape from GET /api/public/coaches. Kept in sync
// with src/app/api/public/coaches/route.ts PublicCoachListItem.
export interface PublicCoachListItem {
  coach_profile_id: string
  slug: string
  display_name: string
  location_city: string | null
  avatar_url: string | null
  sport_id: string
  sport_slug: string
  sport_name: string
  price_individual_pence: number | null
  currency: string
  rating_avg: number | null
  rating_count: number
}

// Card display model — what CoachCard actually renders. Decoupled from
// PublicCoachListItem so the landing page's hardcoded fallback mock can
// render the same component without going through the API path.
export interface Coach {
  name: string
  loc: string
  price: string
  rating: string
  reviews: number
  avail: string
  initials: string
  tag: string
}

// ─── Normaliser ──────────────────────────────────────────────────────────────

// Card displays whole pounds (Math.round). Sub-pound granularity
// (e.g. 5550 pence = £55.50) is truncated/rounded to £56. If we
// introduce sub-pound pricing, this display logic needs updating.
export function normaliseCoach(c: PublicCoachListItem): Coach {
  const parts = c.display_name.trim().split(/\s+/)
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : c.display_name.slice(0, 2).toUpperCase()
  return {
    name: c.display_name,
    loc: c.location_city ?? 'UK',
    price:
      c.price_individual_pence != null
        ? `£${Math.round(c.price_individual_pence / 100)}`
        : '—',
    rating: c.rating_avg != null ? c.rating_avg.toFixed(1) : '—',
    reviews: c.rating_count,
    avail: 'Book now',
    initials,
    tag: c.rating_avg != null && c.rating_avg >= 4.8 ? 'Top rated' : 'DBS checked',
  }
}

// ─── CoachCard ───────────────────────────────────────────────────────────────

interface CoachCardProps {
  coach: Coach
  photo: string
  // Sport name parameterises the alt text ("${name}, ${sport_name} coach").
  sportName: string
  // When `href` is provided, the card renders as a Next.js Link (proper
  // a11y, middle-click works). When omitted, falls back to onClick —
  // used by the landing fallback mock cards which fire a toast rather
  // than navigating.
  href?: string
  onClick?: () => void
}

export function CoachCard({ coach, photo, sportName, href, onClick }: CoachCardProps) {
  const [faved, setFaved] = useState(false)

  const inner = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-brand-50">
        <Image
          src={photo}
          alt={`${coach.name}, ${sportName} coach`}
          fill
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />
        <button
          type="button"
          aria-label={faved ? 'Remove from saved' : 'Save coach'}
          aria-pressed={faved}
          onClick={(e) => {
            // preventDefault stops the parent <Link> from navigating when
            // the heart is clicked; stopPropagation stops the parent
            // <button> onClick from firing in the fallback render mode.
            e.preventDefault()
            e.stopPropagation()
            setFaved((v) => !v)
          }}
          className={`absolute right-3 top-3 flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full border-0 bg-white/[0.92] backdrop-blur-[4px] transition-colors ${
            faved ? 'text-rose-600' : 'text-neutral-600'
          }`}
        >
          <Heart size={17} strokeWidth={2} fill={faved ? 'currentColor' : 'none'} />
        </button>
        <span className="absolute bottom-3 left-3 inline-flex h-[26px] items-center gap-1.5 rounded-full bg-white/[0.92] px-3 text-xs font-semibold text-teal-800 backdrop-blur-[4px]">
          <Check size={12} strokeWidth={2.4} />
          {coach.tag}
        </span>
      </div>
      <div className="px-[17px] pb-[17px] pt-[15px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-gray-900">{coach.name}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-gray-900">
            <span className="text-amber-700">★</span>
            {coach.rating}{' '}
            <span className="font-normal text-gray-500">({coach.reviews})</span>
          </span>
        </div>
        <div className="mt-0.5 text-[13px] text-gray-500">{coach.loc}</div>
        <div className="mt-3.5 flex items-baseline justify-between border-t border-neutral-100 pt-3">
          <span className="text-[15px] font-semibold text-gray-900">
            {coach.price}
            <small className="text-xs font-normal text-gray-500"> / hr</small>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
            <Circle size={12} strokeWidth={2.2} />
            {coach.avail}
          </span>
        </div>
      </div>
    </>
  )

  const baseClass =
    'group block cursor-pointer overflow-hidden rounded-2xl border border-neutral-100 bg-white no-underline transition-all hover:-translate-y-[3px] hover:border-neutral-200'

  if (href) {
    return (
      <Link href={href} className={baseClass}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={`${baseClass} w-full text-left`}>
      {inner}
    </button>
  )
}

// ─── CoachCardSkeleton ───────────────────────────────────────────────────────

// Inline placeholder dimensions mirror CoachCard's layout: 4:3 photo +
// three text rows. animate-pulse handles the shimmer.
export function CoachCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-100 bg-white">
      <div className="aspect-[4/3] animate-pulse bg-neutral-100" />
      <div className="px-[17px] pb-[17px] pt-[15px]">
        <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-100" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-neutral-100" />
        <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-neutral-100" />
      </div>
    </div>
  )
}
