'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import { ProfilePopover } from '@/components/shared/ProfilePopover'

// P-04-A (Screen 06): parent-facing top nav. Logo left, text links centre,
// avatar top-right toggling the ProfilePopover. White background with a
// subtle bottom border. Text links collapse on mobile — the bottom of the
// dashboard still carries "Find a coach" via the search CTA.

interface ParentNavProps {
  name: string
  email: string
  avatarUrl: string | null
  hasCoachRole: boolean
}

export function ParentNav({
  name,
  email,
  avatarUrl,
  hasCoachRole,
}: ParentNavProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on tap/click outside — the container includes both the trigger
  // and the popover panel.
  useEffect(() => {
    if (!popoverOpen) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [popoverOpen])

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-neutral-100 bg-white px-4 md:px-8">
      <Link
        href="/parent/dashboard"
        aria-label="Crikly home"
        className="no-underline"
      >
        <Image
          src="/logo.png"
          alt="Crikly"
          width={120}
          height={32}
          className="h-8 w-auto"
          priority
        />
      </Link>

      <nav aria-label="Primary" className="hidden items-center gap-1.5 sm:flex">
        <Link
          href="/coaches?sport=cricket&role=parent"
          className="rounded-md px-3.5 py-2.5 text-base font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-neutral-900"
        >
          Find a coach
        </Link>
        <Link
          href="/parent/bookings"
          className="rounded-md px-3.5 py-2.5 text-base font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-neutral-900"
        >
          My bookings
        </Link>
      </nav>

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={popoverOpen}
          aria-label="Account menu"
          data-testid="parent-nav-avatar"
          className="flex items-center justify-center rounded-full transition-opacity hover:opacity-90"
        >
          <CriklyAvatar
            seed={name}
            style="personas"
            size={36}
            photoUrl={avatarUrl}
            alt={name}
          />
        </button>
        <ProfilePopover
          open={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          name={name}
          email={email}
          avatarUrl={avatarUrl}
          hasCoachRole={hasCoachRole}
        />
      </div>
    </header>
  )
}
