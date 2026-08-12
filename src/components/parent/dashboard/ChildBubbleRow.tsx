'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { gsap } from 'gsap'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import type { ChildSummary } from './types'

// P-04-A (Screen 06): child bubbles at the bottom of the hero, overlapping
// the white content below. Active child gets a 3px identity ring + bold
// name; inactive 1.5px + normal weight. The + bubble routes to the P-07
// add-child screen.
// P-07 (Screen 07): tapping the ALREADY-ACTIVE bubble opens that child's
// profile card; tapping an inactive bubble keeps the P-04 behaviour of
// switching the dashboard context.

interface ChildBubbleRowProps {
  childrenList: ChildSummary[]
  activeChildId: string | null
  onSelect: (childId: string) => void
  prefersReduced: boolean
}

export function ChildBubbleRow({
  childrenList,
  activeChildId,
  onSelect,
  prefersReduced,
}: ChildBubbleRowProps) {
  const router = useRouter()

  const handleTap = (
    childId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (childId === activeChildId) {
      router.push(`/parent/children/${childId}`)
      return
    }
    // Scale pulse 1 → 1.08 → 1 on the tapped bubble (200ms total).
    if (!prefersReduced) {
      gsap.fromTo(
        event.currentTarget,
        { scale: 1 },
        {
          scale: 1.08,
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        },
      )
    }
    onSelect(childId)
  }

  return (
    <div
      className="flex items-start gap-5 overflow-x-auto pb-1"
      data-testid="child-bubble-row"
    >
      {childrenList.map((child) => {
        const active = child.id === activeChildId
        return (
          <button
            key={child.id}
            type="button"
            data-bubble
            data-testid={`child-bubble-${child.id}`}
            aria-pressed={active}
            onClick={(event) => handleTap(child.id, event)}
            className="flex flex-col items-center gap-2"
          >
            <CriklyAvatar
              seed={child.firstName}
              style="adventurer"
              size={64}
              ringColor={child.colour}
              ringWidth={active ? 3 : 1.5}
              alt={child.fullName}
            />
            <span
              className={`text-sm text-neutral-900 ${
                active ? 'font-bold' : 'font-regular'
              }`}
            >
              {child.firstName}
            </span>
          </button>
        )
      })}

      <Link
        href="/parent/children/new"
        data-bubble
        data-testid="add-child-bubble"
        aria-label="Add child"
        className="flex flex-col items-center gap-2 no-underline"
      >
        {/* 69px = 64px avatar + 2px gap + 1.5px ring, so the dashed circle
            aligns with the ringed CriklyAvatar bubbles beside it. */}
        {/* P-07 fix: solid 2px border (dashed 1.5px let the dark hero
            gradient show through the dash gaps at the perimeter, reading
            as a non-solid disc) + explicit bg-white so the circle stays a
            clean white disc over any background. */}
        <span className="flex h-[69px] w-[69px] items-center justify-center rounded-full border-2 border-solid border-neutral-300 bg-white">
          <Plus size={22} className="text-neutral-400" aria-hidden />
        </span>
        <span className="text-sm text-neutral-600">Add child</span>
      </Link>
    </div>
  )
}
