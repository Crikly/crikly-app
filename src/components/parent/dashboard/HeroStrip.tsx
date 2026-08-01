'use client'

import { ChildBubbleRow } from './ChildBubbleRow'
import type { ChildSummary } from './types'

// P-04-A (Screen 06): full-width hero. Dark slate base with a teal
// gradient wash to the right edge (neutral-900 #0F172A → teal-800 tokens).
// Greeting + subline update when the active child changes; the bubble row
// overlaps the white content below via negative margin on the row wrapper.

interface HeroStripProps {
  firstName: string
  playerMode: boolean
  childrenList: ChildSummary[]
  activeChild: ChildSummary | null
  onSelectChild: (childId: string) => void
  prefersReduced: boolean
}

export function HeroStrip({
  firstName,
  playerMode,
  childrenList,
  activeChild,
  onSelectChild,
  prefersReduced,
}: HeroStripProps) {
  return (
    <section className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-teal-800">
      <div className="mx-auto max-w-5xl px-4 pb-6 pt-10 md:px-8 md:pt-14">
        <h1 className="text-[36px] font-bold leading-tight tracking-heading text-white md:text-[52px]">
          Hi {firstName}
        </h1>
        {playerMode ? (
          <p className="mt-2 text-base text-white" data-testid="hero-subline">
            Ready to find a coach? Search and book below.
          </p>
        ) : (
          <p className="mt-2 text-base text-white" data-testid="hero-subline">
            {activeChild
              ? `You're booking for ${activeChild.firstName} today.`
              : 'Add your child to start booking sessions.'}
          </p>
        )}

        {!playerMode && (
          <div className="mt-8 -mb-12 translate-y-4">
            <ChildBubbleRow
              childrenList={childrenList}
              activeChildId={activeChild?.id ?? null}
              onSelect={onSelectChild}
              prefersReduced={prefersReduced}
            />
          </div>
        )}
      </div>
    </section>
  )
}
