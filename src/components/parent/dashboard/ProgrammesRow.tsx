'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { gsap } from 'gsap'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import type { ProgrammeCardData } from './types'

// P-04-A (Screen 06): horizontal scroll row of active group programmes.
// "Near" is city-label only for now — real geo-distance filtering lands
// with P-08. Native overflow scrolling provides touch momentum on mobile;
// a pointer-drag handler with a GSAP momentum tween covers mouse drag.
// The whole section is hidden when there are no programmes (no empty
// state, per spec) — the parent component owns that check.

interface ProgrammesRowProps {
  programmes: ProgrammeCardData[]
  locationCity: string | null
  prefersReduced: boolean
}

export function ProgrammesRow({
  programmes,
  locationCity,
  prefersReduced,
}: ProgrammesRowProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startX: 0, startScroll: 0, velocity: 0, lastX: 0, lastT: 0 })

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current
    if (!scroller || event.pointerType === 'touch') return
    drag.current = {
      active: true,
      startX: event.clientX,
      startScroll: scroller.scrollLeft,
      velocity: 0,
      lastX: event.clientX,
      lastT: event.timeStamp,
    }
    gsap.killTweensOf(scroller)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current
    const state = drag.current
    if (!scroller || !state.active) return
    scroller.scrollLeft = state.startScroll - (event.clientX - state.startX)
    const dt = event.timeStamp - state.lastT
    if (dt > 0) {
      state.velocity = (event.clientX - state.lastX) / dt
      state.lastX = event.clientX
      state.lastT = event.timeStamp
    }
  }

  const onPointerEnd = () => {
    const scroller = scrollerRef.current
    const state = drag.current
    if (!scroller || !state.active) return
    state.active = false
    if (prefersReduced || Math.abs(state.velocity) < 0.1) return
    // Momentum: project the release velocity forward and ease out.
    gsap.to(scroller, {
      scrollLeft: scroller.scrollLeft - state.velocity * 300,
      duration: 0.6,
      ease: 'power2.out',
    })
  }

  return (
    <section data-testid="programmes-row">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-heading text-neutral-900">
          Cricket programmes {locationCity ? `near ${locationCity}` : 'near you'}
        </h2>
        <Link
          href="/coaches?sport=cricket&role=parent"
          className="text-sm font-medium text-brand-600 no-underline hover:text-brand-700"
        >
          See all
        </Link>
      </div>

      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerLeave={onPointerEnd}
        className="mt-4 flex select-none gap-4 overflow-x-auto pb-2"
      >
        {programmes.map((programme) => (
          <article
            key={programme.id}
            data-testid="programme-card"
            className="w-[260px] flex-shrink-0 rounded-lg bg-white p-4 shadow-sm"
          >
            <p className="truncate text-base font-bold text-neutral-900">
              {programme.title}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <CriklyAvatar
                seed={programme.coachName}
                style="personas"
                size={24}
                alt={programme.coachName}
              />
              <span className="truncate text-sm text-neutral-600">
                {programme.coachName}
              </span>
            </div>
            {programme.venueName && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-600">
                <MapPin size={13} className="flex-shrink-0 text-neutral-400" />
                <span className="truncate">{programme.venueName}</span>
              </p>
            )}
            {programme.nextDateLabel && (
              <p className="mt-1 text-sm text-neutral-600">
                Next: {programme.nextDateLabel}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                {programme.spotsRemaining}{' '}
                {programme.spotsRemaining === 1 ? 'spot' : 'spots'} left
              </span>
              <span className="text-sm font-semibold text-neutral-900">
                {programme.priceLabel}
              </span>
            </div>
            <Link
              href="/coaches?sport=cricket&role=parent"
              className="mt-3 block text-sm font-medium text-brand-600 no-underline hover:text-brand-700"
            >
              View programme
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
