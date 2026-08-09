'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { Check, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import {
  SHELL_ROLE_META,
  SHELL_ROLE_ORDER,
  type ShellRole,
} from '@/components/shell/roles'

// P-04-C (Screens 01–02): the role pill — the single place role switching
// lives. Outlined pill shows the active role; tapping opens a 200px dropdown:
// active role tinted + checked + bold, other held roles switch active_role
// via PATCH /api/auth/roles, and "+ Add parent mode" routes into the
// one-screen add-parent onboarding. "Add player mode" is deliberately not
// rendered — there is no designed add-player flow yet (flagged in P-04-C).

interface RolePillProps {
  /** The module the user is currently in — drives the pill face. */
  activeRole: ShellRole
  /** Roles the account holds (drives switch vs add rows). */
  roles: ShellRole[]
}

export function RolePill({ activeRole, roles }: RolePillProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const prefersReduced = usePrefersReducedMotion()

  const active = SHELL_ROLE_META[activeRole]
  const ActiveIcon = active.icon
  const heldRoles = SHELL_ROLE_ORDER.filter((role) => roles.includes(role))
  // Coach-only entry (review finding #1): the add-parent page redirects
  // non-coach accounts away, so a player-only account must not see a row
  // that dead-ends. Players get their own add flow when one is designed.
  const showAddParent = !roles.includes('parent') && roles.includes('coach')

  useGSAP(
    () => {
      const panel = panelRef.current
      if (!panel) return
      const rows = panel.querySelectorAll('[data-pill-row]')

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
    { dependencies: [open, prefersReduced], scope: containerRef },
  )

  // Close on outside tap/click — container includes trigger + panel.
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const switchRole = async (role: ShellRole) => {
    if (switching || role === activeRole) return
    setSwitching(true)
    setSwitchError(false)
    try {
      const res = await fetch('/api/auth/roles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const data = (await res.json()) as {
        success: boolean
        redirectTo?: string
      }
      if (!res.ok || !data.success) {
        setSwitchError(true)
        return
      }
      setOpen(false)
      router.push(data.redirectTo ?? SHELL_ROLE_META[role].dashboardHref)
      router.refresh()
    } catch {
      setSwitchError(true)
    } finally {
      setSwitching(false)
    }
  }

  const addParent = () => {
    setOpen(false)
    router.push('/onboarding/add-parent')
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Current role: ${active.label}. Switch role.`}
        data-testid="role-pill"
        className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-base font-medium text-brand-800 transition-colors ${
          open ? 'bg-brand-50' : 'bg-neutral-50 hover:bg-brand-50'
        }`}
      >
        <ActiveIcon size={15} aria-hidden />
        {active.label}
        {open ? (
          <ChevronUp size={13} aria-hidden className="text-slate-500" />
        ) : (
          <ChevronDown size={13} aria-hidden className="text-slate-500" />
        )}
      </button>

      {/* Stays mounted so the close animation can play (ProfilePopover
          convention); inert blocks focus while closed. */}
      <div
        ref={panelRef}
        role="menu"
        aria-hidden={!open}
        inert={!open}
        data-testid="role-pill-dropdown"
        className={`absolute left-0 top-full z-50 mt-2 w-[200px] origin-top-left scale-[0.92] rounded-[8px] bg-white p-1.5 opacity-0 shadow-[0_12px_32px_rgba(15,23,42,0.14)] ${
          open ? '' : 'pointer-events-none'
        }`}
      >
        {heldRoles.map((role) => {
          const meta = SHELL_ROLE_META[role]
          const RoleIcon = meta.icon
          if (role === activeRole) {
            return (
              <div
                key={role}
                role="menuitem"
                aria-current="true"
                data-pill-row
                data-testid={`role-row-${role}`}
                className="flex items-center gap-2 rounded-md bg-neutral-50 px-2.5 py-[9px] text-sm font-bold text-brand-800"
              >
                <Check size={14} aria-hidden className="text-brand-600" />
                <RoleIcon size={15} aria-hidden />
                {meta.modeLabel}
              </div>
            )
          }
          return (
            <button
              key={role}
              type="button"
              role="menuitem"
              data-pill-row
              data-testid={`role-row-${role}`}
              onClick={() => switchRole(role)}
              disabled={switching}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-[9px] text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <span className="w-3.5" aria-hidden />
              <RoleIcon size={15} aria-hidden className="text-slate-500" />
              {meta.modeLabel}
            </button>
          )
        })}

        {showAddParent && (
          <>
            <div className="mx-1 my-1.5 h-px bg-slate-100" data-pill-row />
            <button
              type="button"
              role="menuitem"
              data-pill-row
              data-testid="role-add-parent"
              onClick={addParent}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
            >
              <Plus size={14} aria-hidden className="text-neutral-400" />
              Add parent mode
            </button>
          </>
        )}

        {switchError && (
          <p
            data-pill-row
            className="px-2.5 pb-1 pt-1.5 text-xs text-danger"
            role="alert"
          >
            Couldn&apos;t switch roles. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
