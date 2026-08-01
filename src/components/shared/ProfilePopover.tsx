'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ArrowLeftRight, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

// P-04-A (Screen 05): glassmorphism account menu opened from the nav
// avatar. Anchored top-right, floats below the trigger. The panel stays
// mounted so the close animation can play; interactivity toggles via
// aria-hidden + pointer-events (same convention as nav/ProfileDropdown).
// Outside-click close is owned by the parent (it knows the trigger
// element); Escape close is handled here.

interface ProfilePopoverProps {
  open: boolean
  onClose: () => void
  name: string
  email: string
  avatarUrl: string | null
  /** "Switch to Coach" row renders only when the account holds a coach role. */
  hasCoachRole: boolean
}

export function ProfilePopover({
  open,
  onClose,
  name,
  email,
  avatarUrl,
  hasCoachRole,
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
      className={`absolute right-0 top-full z-50 mt-2 w-[280px] origin-top-right scale-[0.92] rounded-xl bg-white/75 opacity-0 shadow-md backdrop-blur-xl backdrop-saturate-150 ${
        open ? '' : 'pointer-events-none'
      }`}
    >
      {/* Header — avatar + name + email */}
      <div className="flex items-center gap-3 px-4 py-4" data-popover-row>
        <CriklyAvatar
          seed={name}
          style="personas"
          size={56}
          photoUrl={avatarUrl}
          alt={name}
        />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-neutral-900">
            {name || 'Your account'}
          </p>
          <p className="truncate text-sm text-neutral-400">{email}</p>
        </div>
      </div>

      <div className="mx-4 border-t border-neutral-100" data-popover-row />

      {hasCoachRole && (
        <PopoverRow
          icon={<ArrowLeftRight size={16} />}
          label="Switch to Coach"
          onClick={() => navigate('/coach/dashboard')}
        />
      )}
      <PopoverRow
        icon={<Settings size={16} />}
        label="Settings"
        onClick={() => navigate('/parent/settings')}
      />

      <div className="mx-4 border-t border-neutral-100" data-popover-row />

      <button
        type="button"
        role="menuitem"
        data-popover-row
        onClick={handleSignOut}
        className="mb-1 flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-danger transition-colors hover:bg-white/60"
      >
        <LogOut size={16} />
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
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-neutral-600 transition-colors hover:bg-white/60"
    >
      <span className="text-neutral-400">{icon}</span>
      {label}
    </button>
  )
}
