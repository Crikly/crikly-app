'use client'

// P-00b: parent-facing group-programmes carousel for the public coach profile.
// Horizontal snap-scroll on mobile with edge fades; 2/3-col grid on desktop.
// Data is fetched server-side in page.tsx (RLS-respecting SSR client) and passed
// in — this component is presentational + handles the scroll-fade interaction only.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Calendar, Clock, MapPin, ArrowRight } from 'lucide-react'

export interface ProgrammeCardData {
  id: string
  title: string
  sportName: string
  ageGroups: string[]
  schedule: string
  starting: string | null
  venueName: string | null
  pricePence: number
  per: string
  filled: number
  total: number
  isFull: boolean
}

// Header gradients use brand/teal Tailwind tokens (no raw hex) — cycled per card.
const GRADIENTS = [
  'from-brand-600 to-brand-800',
  'from-teal-600 to-teal-800',
  'from-brand-400 to-brand-800',
]

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

export function ProgrammesCarousel({
  programmes,
  coachId,
}: {
  programmes: ProgrammeCardData[]
  coachId: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fades, setFades] = useState<{ left: boolean; right: boolean }>({ left: false, right: false })

  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const update = () => {
      const max = sc.scrollWidth - sc.clientWidth
      setFades({ left: sc.scrollLeft > 4, right: max > 4 && sc.scrollLeft < max - 4 })
    }
    update()
    sc.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      sc.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1 lg:grid lg:grid-cols-2 lg:gap-4 lg:overflow-visible xl:grid-cols-3"
        data-testid="programmes-carousel"
      >
        {programmes.map((p, i) => {
          const left = p.total - p.filled
          const pct = p.total > 0 ? Math.min(100, Math.round((p.filled / p.total) * 100)) : 0
          const low = left <= 3
          return (
            <div
              key={p.id}
              className="snap-start flex-none w-[280px] lg:w-auto bg-white rounded-2xl overflow-hidden flex flex-col shadow-sm border border-gray-100"
            >
              <div className={`relative h-[140px] overflow-hidden flex items-center justify-center bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`}>
                {p.isFull ? (
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/90 backdrop-blur text-gray-600">
                    Full
                  </span>
                ) : (
                  <span className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/90 backdrop-blur ${low ? 'text-amber-700' : 'text-gray-900'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${low ? 'bg-amber-600' : 'bg-green-600'}`} />
                    {left} spot{left !== 1 ? 's' : ''} left
                  </span>
                )}
                <span className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur text-brand-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {p.sportName}
                </span>
              </div>
              <div className="p-4 flex flex-col gap-2 flex-1">
                <h3 className="text-[16px] font-bold text-gray-900 tracking-tight leading-tight">{p.title}</h3>
                {p.ageGroups.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {p.ageGroups.map(a => (
                      <span key={a} className="bg-gray-100 text-gray-600 text-[11px] font-semibold px-2 py-0.5 rounded-full">{a}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-gray-700 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                  <span>{p.schedule}</span>
                </div>
                {p.starting && (
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    <span>{p.starting}</span>
                  </div>
                )}
                {p.venueName && (
                  <div className="flex items-center gap-1.5 text-[13px] text-gray-500">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                    <span>{p.venueName}</span>
                  </div>
                )}
                <div className="mt-1.5">
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    {/* Dynamic width: Tailwind cannot express a runtime % — inline style is the only option (same pattern as RatingBreakdown). */}
                    <div className={`h-full rounded-full ${pct >= 90 ? 'bg-amber-700' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-[15px] font-bold text-gray-900">
                      {formatPence(p.pricePence)}<span className="text-[12px] font-normal text-gray-500"> {p.per}</span>
                    </span>
                    <span className="text-[12px] text-gray-500 font-medium">{p.filled} of {p.total} booked</span>
                  </div>
                </div>
                {p.isFull ? (
                  <span className="mt-2 flex items-center justify-center w-full h-11 rounded-xl bg-gray-100 text-gray-500 font-semibold text-sm cursor-not-allowed">
                    Full
                  </span>
                ) : (
                  <Link
                    href={`/book/${coachId}?programme=${p.id}`}
                    className="mt-2 flex items-center justify-center gap-1.5 w-full h-11 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 active:scale-[0.99] transition-all"
                    data-testid="programme-enrol-cta"
                  >
                    Reserve a spot <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* Edge fades — mobile carousel only (desktop is a grid) */}
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 lg:hidden ${fades.left ? 'opacity-100' : 'opacity-0'}`} />
      <div className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 lg:hidden ${fades.right ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  )
}
