'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { LogOut, Settings, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

// P-04-C (Account popover): minimal account menu opened from the app shell
// avatar — name, email, Settings, Sign out ONLY. Role switching moved to the
// RolePill exclusively. Restyled from the P-04-A glassmorphism panel to the
// approved P-04-C design: 220px, solid white, 8px radius, soft drop shadow.
// The panel stays mounted so the close animation can play; interactivity
// toggles via aria-hidden + inert. Outside-click close is owned by the parent
// (it knows the trigger element); Escape close is handled here.

interface ProfilePopoverProps {
  open: boolean
  onClose: () => void
  name: string
  email: string
  /** Role-aware settings destination — /coach/settings or /parent/settings. */
  settingsHref: string
  /**
   * Coach context only (P-04-C Decision 1): renders a "Share profile" row
   * above Settings — the sidebar share button's new home.
   */
  onShareProfile?: () => void
}

export function ProfilePopover({
  open,
  onClose,
  name,
  email,
  settingsHref,
  onShareProfile,
}: ProfilePopoverProps) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const prefersReduced = usePrefersReducedMotion()

  useGSAP(
    () => {
      const panel = panelRef.current
      if (!panel) return
      const rows = panel.querySelectorAll('[data-popover-row]')

      if (prefersReduced) {
        gsap.set(panel, { scale: 1, opacity: open ? 1 : 0 })
        gsap.set(rows, { opacity: open ? 1 : 0, y: 0 })
        return
      }

      if (open) {
        gsap.fromTo(
          panel,
          { scale: 0.92, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.2, ease: 'back.out(1.6)' },
        )
        gsap.fromTo(
          rows,
          { opacity: 0, y: 6 },
          { opacity: 1, y: 0, duration: 0.18, stagger: 0.025, delay: 0.05 },
        )
      } else {
        gsap.to(panel, {
          scale: 0.92,
          opacity: 0,
          duration: 0.15,
          ease: 'power2.in',
        })
      }
    },
    { dependencies: [open, prefersReduced], scope: panelRef },
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSignOut = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } finally {
      onClose()
      router.push('/')
      router.refresh()
    }
  }

  const navigate = (href: string) => {
    onClose()
    router.push(href)
  }

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-hidden={!open}
      // inert blocks keyboard focus while closed — pointer-events-none
      // alone leaves the hidden rows Tab-reachable (WCAG 4.1.2).
      inert={!open}
      data-testid="profile-popover"
      className={`absolute right-0 top-full z-50 mt-2 w-[220px] origin-top-right scale-[0.92] rounded-[8px] bg-white p-1.5 opacity-0 shadow-[0_12px_32px_rgba(15,23,42,0.14)] ${
        open ? '' : 'pointer-events-none'
      }`}
    >
      {/* Header — name + email */}
      <div
        className="mb-1.5 border-b border-slate-100 px-3 pb-3 pt-2.5"
        data-popover-row
      >
        <p className="truncate text-sm font-bold text-neutral-900">
          {name || 'Your account'}
        </p>
        <p className="mt-px truncate text-xs text-neutral-400">{email}</p>
      </div>

      {onShareProfile && (
        <PopoverRow
          icon={<Share2 size={15} aria-hidden />}
          label="Share profile"
          onClick={() => {
            onClose()
            onShareProfile()
          }}
        />
      )}
      <PopoverRow
        icon={<Settings size={15} aria-hidden />}
        label="Settings"
        onClick={() => navigate(settingsHref)}
      />

      <button
        type="button"
        role="menuitem"
        data-popover-row
        onClick={handleSignOut}
        className="flex w-full items-center gap-2 rounded-md px-3 py-[9px] text-left text-sm font-medium text-danger transition-colors hover:bg-red-100"
      >
        <LogOut size={15} aria-hidden />
        Sign out
      </button>
    </div>
  )
}

function PopoverRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-popover-row
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-3 py-[9px] text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
    >
      <span className="text-neutral-400">{icon}</span>
      {label}
    </button>
  )
}
