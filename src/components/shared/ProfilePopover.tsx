'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  LayoutDashboard,
  LogOut,
  Settings,
  Share2,
  UserCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

// P-04-C (Account popover): account menu opened from the app shell avatar.
// BUG-58: brought to parity with the ProfileDropdown used on public pages —
// full_name + email header, Dashboard (active role's dashboard), Settings,
// My Profile with Live/Paused badge (coach active role only), Share profile
// (coach), Sign out. Role switching stays in the RolePill exclusively.
// 220px, solid white, 8px radius, soft drop shadow. The panel stays mounted
// so the close animation can play; interactivity toggles via aria-hidden +
// inert. Outside-click close is owned by the parent (it knows the trigger
// element); Escape close is handled here.

interface ProfilePopoverProps {
  open: boolean
  onClose: () => void
  /** BUG-58: the account's full_name from user_profiles — never a coach
   *  display_name (that rule covers public surfaces, not the account menu). */
  name: string
  email: string
  /** Active role's dashboard — /coach/dashboard or /parent/dashboard. */
  dashboardHref: string
  /** Role-aware settings destination — /coach/settings or /parent/settings. */
  settingsHref: string
  /**
   * Coach active role only: renders the "My Profile" row. 'live'/'paused'
   * shows the matching status badge; null shows the row without a badge.
   * Omit the prop entirely to hide the row (parent/player).
   */
  myProfileStatus?: 'live' | 'paused' | null
  /**
   * Coach context only (P-04-C Decision 1): renders a "Share profile" row —
   * the sidebar share button's new home.
   */
  onShareProfile?: () => void
}

export function ProfilePopover({
  open,
  onClose,
  name,
  email,
  dashboardHref,
  settingsHref,
  myProfileStatus,
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

      <PopoverRow
        icon={<LayoutDashboard size={15} aria-hidden />}
        label="Dashboard"
        onClick={() => navigate(dashboardHref)}
      />
      <PopoverRow
        icon={<Settings size={15} aria-hidden />}
        label="Settings"
        onClick={() => navigate(settingsHref)}
      />
      {myProfileStatus !== undefined && (
        <PopoverRow
          icon={<UserCircle size={15} aria-hidden />}
          label="My Profile"
          badge={myProfileStatus}
          onClick={() => navigate('/coach/profile/edit')}
        />
      )}
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
  badge,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  /** BUG-58: coach profile status badge — Live/Paused only, no % rollup. */
  badge?: 'live' | 'paused' | null
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
      <span className="flex-1">{label}</span>
      {badge === 'live' && (
        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
          Live
        </span>
      )}
      {badge === 'paused' && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Paused
        </span>
      )}
    </button>
  )
}
