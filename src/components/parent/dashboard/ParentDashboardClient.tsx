'use client'

import { useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { childIdentityColour } from '@/constants/childIdentity'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { HeroStrip } from './HeroStrip'
import { SearchBar } from './SearchBar'
import { UpcomingSessions } from './UpcomingSessions'
import { ProgrammesRow } from './ProgrammesRow'
import { HowBookingWorks } from './HowBookingWorks'
import type { ParentDashboardData } from './types'

// P-04-A (Screen 06): client orchestrator for the parent dashboard.
// Holds the active-child selection (local state — hero subline, search
// CTA and sessions all follow it) and owns the page-level GSAP choreo:
// hero instant, bubbles stagger up, content rows fade up, content
// cross-fade on child switch. All skipped under reduced motion.

interface ParentDashboardClientProps {
  data: ParentDashboardData
}

export function ParentDashboardClient({ data }: ParentDashboardClientProps) {
  const prefersReduced = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [activeChildId, setActiveChildId] = useState<string | null>(
    data.children[0]?.id ?? null,
  )

  const activeChild = useMemo(
    () => data.children.find((child) => child.id === activeChildId) ?? null,
    [data.children, activeChildId],
  )

  const visibleSessions = useMemo(() => {
    if (data.playerMode) {
      // Players book for themselves — their bookings carry no child id.
      return data.sessions.filter((s) => s.childProfileId === null)
    }
    return data.sessions.filter((s) => s.childProfileId === activeChildId)
  }, [data.playerMode, data.sessions, activeChildId])

  const activeColour = activeChild?.colour ?? childIdentityColour(0)

  // Page-load choreography: hero renders instantly; bubbles stagger up
  // 60ms apart; content rows below the hero fade up 24px, 120ms apart.
  useGSAP(
    () => {
      if (prefersReduced || !rootRef.current) return
      gsap.from('[data-bubble]', {
        y: 16,
        opacity: 0,
        duration: 0.4,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'all',
      })
      gsap.from('[data-dash-row]', {
        y: 24,
        opacity: 0,
        duration: 0.5,
        stagger: 0.12,
        delay: 0.1,
        ease: 'power2.out',
        clearProps: 'all',
      })
    },
    { scope: rootRef },
  )

  const handleSelectChild = (childId: string) => {
    if (childId === activeChildId) return
    if (prefersReduced || !contentRef.current) {
      setActiveChildId(childId)
      return
    }
    // Content below the hero cross-fades (180ms out → swap → fade in).
    gsap.to(contentRef.current, {
      opacity: 0,
      duration: 0.09,
      onComplete: () => {
        setActiveChildId(childId)
        gsap.to(contentRef.current, { opacity: 1, duration: 0.09 })
      },
    })
  }

  return (
    // overflow-x-clip (not hidden) so the hero bubble overlap can't create
    // a horizontal scrollbar while sticky positioning still works.
    <div ref={rootRef} className="overflow-x-clip bg-white pb-16">
      <HeroStrip
        firstName={data.firstName}
        playerMode={data.playerMode}
        childrenList={data.children}
        activeChild={activeChild}
        onSelectChild={handleSelectChild}
        prefersReduced={prefersReduced}
      />

      {/* P-07 fix: pt-20 (was pt-16) — the bubble row now floats 32px below
          the hero edge (design geometry), so the content needs the extra
          headroom to keep clear daylight under the bubble labels. */}
      <div
        ref={contentRef}
        className={`mx-auto flex max-w-5xl flex-col gap-10 px-4 md:px-8 ${
          data.playerMode ? 'pt-8' : 'pt-20'
        }`}
      >
        <div data-dash-row>
          <SearchBar
            activeChildName={
              data.playerMode ? null : (activeChild?.firstName ?? null)
            }
          />
        </div>

        <div data-dash-row>
          <UpcomingSessions
            sessions={visibleSessions}
            subjectName={
              data.playerMode ? data.firstName : (activeChild?.firstName ?? '')
            }
            colour={activeColour}
            prefersReduced={prefersReduced}
          />
        </div>

        {data.programmes.length > 0 && (
          <div data-dash-row>
            <ProgrammesRow
              programmes={data.programmes}
              locationCity={data.locationCity}
              prefersReduced={prefersReduced}
            />
          </div>
        )}

        {data.lifetimeBookingsCount === 0 && (
          <div data-dash-row>
            <HowBookingWorks />
          </div>
        )}
      </div>
    </div>
  )
}
