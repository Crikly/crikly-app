'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { Check, Plus } from 'lucide-react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'

// P-07: reusable "Who is this session for?" picker (REQ-P-004). Pure
// presentation — the booking flow (P-10) owns the data and wires onSelect;
// nothing here fetches. Radio-group semantics so the selection is
// screen-reader correct. The "Add a child" option routes to the Screen 08
// form (REQ-P-004's inline-create lands with P-10's booking-flow wiring).

export interface ChildSelectorOption {
  id: string
  firstName: string
  /** Identity colour (index-derived — childIdentityColour). */
  colour: string
  age: number
}

interface ChildSelectorProps {
  childrenList: ChildSelectorOption[]
  selectedChildId: string | null
  onSelect: (childId: string) => void
  /** Where the "Add a child" tile routes; defaults to the add-child form. */
  addChildHref?: string
  label?: string
  /** BUG-77: tile label — booking flow passes "Add player" (its capture
   * intercept repurposes the tile); management screens keep the default. */
  addLabel?: string
}

export function ChildSelector({
  childrenList,
  selectedChildId,
  onSelect,
  addChildHref = '/parent/children/new',
  label = 'Who is this session for?',
  addLabel = 'Add a child',
}: ChildSelectorProps) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = childrenList.findIndex((child) => child.id === selectedChildId)

  // Native radiogroup keyboard contract: arrow keys move AND select
  // (roving tabindex — only the selected option, or the first when none
  // is selected, sits in the tab order).
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % childrenList.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + childrenList.length) % childrenList.length
    } else {
      return
    }
    event.preventDefault()
    const next = childrenList[nextIndex]
    if (next) {
      onSelect(next.id)
      optionRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid="child-selector"
      className="flex flex-col gap-3"
    >
      <span className="text-base font-medium text-neutral-900">{label}</span>
      <div className="flex items-start gap-4 overflow-x-auto pb-1">
        {childrenList.map((child, index) => {
          const selected = child.id === selectedChildId
          const inTabOrder = selected || (selectedIndex === -1 && index === 0)
          return (
            <button
              key={child.id}
              ref={(element) => {
                optionRefs.current[index] = element
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={inTabOrder ? 0 : -1}
              data-testid={`child-selector-option-${child.id}`}
              onClick={() => onSelect(child.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="flex min-w-[72px] flex-col items-center gap-2"
            >
              <span className="relative inline-block">
                <CriklyAvatar
                  seed={child.firstName}
                  style="adventurer"
                  size={56}
                  ringColor={child.colour}
                  ringWidth={selected ? 3 : 1.5}
                  alt={`${child.firstName}, age ${child.age}`}
                />
                {selected && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white"
                    style={{ backgroundColor: child.colour }}
                    aria-hidden
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span
                className={`text-sm text-neutral-900 ${selected ? 'font-bold' : 'font-normal'}`}
              >
                {child.firstName}
              </span>
            </button>
          )
        })}

        <Link
          href={addChildHref}
          data-testid="child-selector-add"
          className="flex min-w-[72px] flex-col items-center gap-2 no-underline"
        >
          <span className="flex h-[61px] w-[61px] items-center justify-center rounded-full border-[1.5px] border-dashed border-neutral-400 bg-white">
            <Plus size={22} className="text-neutral-400" aria-hidden />
          </span>
          <span className="text-sm text-neutral-600">{addLabel}</span>
        </Link>
      </div>
    </div>
  )
}

export function ChildSelectorSkeleton() {
  return (
    <div className="flex animate-pulse items-start gap-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-full bg-neutral-100" />
          <div className="h-3 w-10 rounded bg-neutral-100" />
        </div>
      ))}
    </div>
  )
}
