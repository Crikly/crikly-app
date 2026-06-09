'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Settings, UserCircle, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  readStripeStatusCache,
  writeStripeStatusCache,
  type StripeConnectStatus,
} from '@/lib/stripe-status-cache'
import {
  readProfileCompletenessCache,
  writeProfileCompletenessCache,
  type ProfileCompleteness,
} from '@/lib/profile-completeness-cache'
import { scoreCompleteness } from '@/lib/profile-completeness-score'

// Fix-NAV-01: landing-page nav identity control. Renders the logged-out
// Log in / Get started buttons by default (the common visitor case), and swaps
// to the avatar + dropdown once an authenticated session resolves. Desktop nav
// only — the mobile menu keeps its own links.

type AuthState = 'loading' | 'logged-out' | 'logged-in'

type Badge =
  | { kind: 'live' }
  | { kind: 'paused' }
  | { kind: 'pct'; pct: number }
  | null

interface ProfileView {
  fullName: string
  email: string
  avatarUrl: string | null
  badge: Badge
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function ProfileDropdown() {
  const router = useRouter()
  const [state, setState] = useState<AuthState>('loading')
  const [view, setView] = useState<ProfileView | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // A. + B. + C. — resolve auth + profile + status badge on mount.
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        setState('logged-out')
        return
      }

      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url, location_city')
        .eq('auth_user_id', user.id)
        .single()
      if (cancelled) return
      if (!userProfile) {
        setState('logged-out')
        return
      }

      const { data: coachProfile } = await supabase
        .from('coach_profiles')
        .select('bio, cancellation_window_hours, is_profile_live, is_paused')
        .eq('user_profile_id', userProfile.id)
        .maybeSingle()
      if (cancelled) return

      let badge: Badge = null
      if (coachProfile) {
        if (coachProfile.is_paused) {
          badge = { kind: 'paused' }
        } else if (coachProfile.is_profile_live) {
          badge = { kind: 'live' }
        } else {
          // Same 6-check rollup the coach dashboard shows (shared scorer).
          // Reuse the Stripe + completeness caches the right panel populates.
          const stripe = readStripeStatusCache() ?? (await fetchStripeStatus())
          const comp = readProfileCompletenessCache() ?? (await fetchCompleteness())
          if (cancelled) return
          const { pct } = scoreCompleteness({
            basicProfile: !!(
              userProfile.full_name &&
              coachProfile.bio &&
              userProfile.location_city
            ),
            bookingPolicy: (coachProfile.cancellation_window_hours ?? 0) > 0,
            stripe: !!(stripe?.charges_enabled && stripe?.payouts_enabled),
            sports: comp?.sports ?? false,
            qualifications: comp?.qualifications ?? false,
            availability: comp?.availability ?? false,
          })
          badge = { kind: 'pct', pct }
        }
      }

      setView({
        fullName: userProfile.full_name || '',
        email: user.email ?? '',
        avatarUrl: userProfile.avatar_url,
        badge,
      })
      setState('logged-in')
    }

    run().catch(() => {
      if (!cancelled) setState('logged-out')
    })

    return () => {
      cancelled = true
    }
  }, [])

  // F. — close on outside click.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  // Logged-out (and the brief-approved default while auth resolves): the
  // original Log in / Get started buttons, markup-identical to page.tsx.
  if (state !== 'logged-in' || !view) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/login"
          className="whitespace-nowrap rounded-[10px] px-3.5 py-2.5 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
        >
          Log in
        </Link>
        <Link
          href="/register"
          className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-5 text-[15px] font-medium text-white no-underline transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          Get started
        </Link>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      {/* D. — avatar trigger (36px circle). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {view.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          initials(view.fullName)
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[260px] overflow-hidden rounded-[14px] border-[0.5px] border-neutral-100 bg-white shadow-sm"
        >
          {/* Header — name + email */}
          <div className="px-4 py-3">
            <p className="truncate text-[14px] font-medium text-gray-900">
              {view.fullName || 'Your account'}
            </p>
            <p className="truncate text-[13px] text-neutral-500">{view.email}</p>
          </div>

          <div className="border-t border-neutral-100" />

          <MenuItem
            icon={<LayoutDashboard size={15} />}
            label="Dashboard"
            onClick={() => {
              setOpen(false)
              router.push('/coach/dashboard')
            }}
          />
          <MenuItem
            icon={<Settings size={15} />}
            label="Settings"
            onClick={() => {
              setOpen(false)
              router.push('/coach/settings')
            }}
          />
          <MenuItem
            icon={<UserCircle size={15} />}
            label="My Profile"
            badge={view.badge}
            onClick={() => {
              setOpen(false)
              router.push('/coach/profile/edit')
            }}
          />

          <div className="border-t border-neutral-100" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              handleSignOut()
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14px] text-danger transition-colors hover:bg-neutral-50"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  badge?: Badge
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[14px] text-gray-700 transition-colors hover:bg-neutral-50"
    >
      <span className="text-neutral-500">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge && <StatusBadge badge={badge} />}
    </button>
  )
}

function StatusBadge({ badge }: { badge: Badge }) {
  if (!badge) return null
  if (badge.kind === 'live') {
    return (
      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
        Live
      </span>
    )
  }
  if (badge.kind === 'paused') {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        Paused
      </span>
    )
  }
  return (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">
      {badge.pct}%
    </span>
  )
}

// Cache-miss fetchers — mirror CoachRightPanel's sources so the dropdown's
// numbers match the coach dashboard.
async function fetchStripeStatus(): Promise<StripeConnectStatus | null> {
  try {
    const res = await fetch('/api/payments/connect/onboard')
    if (!res.ok) return null
    const data = (await res.json()) as StripeConnectStatus
    writeStripeStatusCache(data)
    return data
  } catch {
    return null
  }
}

async function fetchCompleteness(): Promise<ProfileCompleteness | null> {
  try {
    const res = await fetch('/api/coaches/profile-completeness')
    if (!res.ok) return null
    const data = (await res.json()) as ProfileCompleteness
    writeProfileCompletenessCache(data)
    return data
  } catch {
    return null
  }
}
