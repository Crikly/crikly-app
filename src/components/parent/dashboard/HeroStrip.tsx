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
          // P-07 fix: the approved design floats the bubbles ACROSS the
          // hero/content boundary — translateY(34px) in the design source;
          // translate-y-8 (32px) is the closest Tailwind step. translate-y-4
          // left the avatars almost entirely inside the banner ("cut off").
          // relative z-10 guarantees the row paints above the white content
          // that follows in the DOM, whatever the font metrics/scaling.
          <div className="relative z-10 mt-8 -mb-12 translate-y-8">
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
