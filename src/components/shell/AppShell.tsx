'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import { ProfilePopover } from '@/components/shared/ProfilePopover'
import { RolePill } from '@/components/shell/RolePill'
import {
  SHELL_ROLE_META,
  isShellRole,
  type ShellRole,
} from '@/components/shell/roles'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'
import { LANDING_NAV_LINKS } from '@/constants/landing-nav'

// P-04-C (Screen 01): the unified 64px app shell bar — the ONE identity +
// role-switching surface across every authenticated page. Logo left, role
// pill + avatar right (UI-FIX: the pill is an identity control, grouped with
// the avatar — not next to the logo). Sits above the coach sidebar, above the
// parent links, above everything. 64px, white, 1px #F1F5F9 bottom border.
// (Height raised 48→64px, text lockup swapped for logo.png, and pill scaled
// up per Lasith's post-review adjustments.)
//
// Data modes:
//   props     — coach + parent layouts fetch identity server-side and pass it
//   selfFetch — landing page ('use client', public) resolves auth on mount
//               and renders nothing while logged out (Fix-NAV-01 pattern)

interface ShellIdentity {
  name: string
  email: string
  avatarUrl: string | null
  activeRole: ShellRole
  roles: ShellRole[]
  /** BUG-58: account full_name for the popover header — the shell avatar may
   *  show a coach display_name (BUG-37) but the account menu never does. */
  fullName: string
  /** BUG-58: coach profile status for the popover's My Profile badge. */
  coachStatus: 'live' | 'paused' | null
}

interface AppShellProps extends Partial<ShellIdentity> {
  context: 'coach' | 'parent' | 'landing'
  /** Landing only: resolve identity client-side; render null when logged out. */
  selfFetch?: boolean
  className?: string
}

const PARENT_LINKS = [
  { href: '/coaches?sport=cricket&role=parent', match: '/coaches', label: 'Find a coach' },
  { href: '/parent/bookings', match: '/parent/bookings', label: 'My bookings' },
]

export function AppShell({
  context,
  selfFetch = false,
  name = '',
  email = '',
  avatarUrl = null,
  activeRole = 'parent',
  roles = [],
  fullName = '',
  coachStatus = null,
  className = '',
}: AppShellProps) {
  const pathname = usePathname()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [fetched, setFetched] = useState<ShellIdentity | null>(null)
  const [notificationCount, setNotificationCount] = useState(0)
  // Fix-COACH-UX-05 (carried from the old sidebar chrome): avatar + name kept
  // in state so a profile photo/name edit updates the shell live via the
  // crikly:profile-updated event — never by a mount fetch that could clobber
  // the fresh server prop with a stale cache entry.
  const [liveName, setLiveName] = useState<string | null>(null)
  const [liveAvatarUrl, setLiveAvatarUrl] = useState<string | null>(null)
  const avatarRef = useRef<HTMLDivElement>(null)

  // selfFetch (landing): resolve session + identity on mount.
  useEffect(() => {
    if (!selfFetch) return
    let cancelled = false

    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (cancelled || !user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('id, full_name, avatar_url, active_role')
        .eq('auth_user_id', user.id)
        .single()
      if (cancelled || !profile) return

      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_profile_id', profile.id)
      if (cancelled) return

      const heldRoles = (roleRows ?? [])
        .map((row) => row.role)
        .filter(isShellRole)
      if (heldRoles.length === 0) return

      const active =
        profile.active_role && isShellRole(profile.active_role)
          ? profile.active_role
          : heldRoles[0]!

      // BUG-58: active coach on the landing page — resolve profile status so
      // the popover's My Profile badge matches the coach dashboard.
      let status: 'live' | 'paused' | null = null
      if (active === 'coach') {
        const { data: coachProfile } = await supabase
          .from('coach_profiles')
          .select('is_profile_live, is_paused')
          .eq('user_profile_id', profile.id)
          .maybeSingle()
        if (cancelled) return
        if (coachProfile?.is_paused) status = 'paused'
        else if (coachProfile?.is_profile_live) status = 'live'
      }

      setFetched({
        name: profile.full_name || '',
        email: user.email ?? '',
        avatarUrl: profile.avatar_url ?? null,
        activeRole: active,
        roles: heldRoles,
        fullName: profile.full_name || '',
        coachStatus: status,
      })
    }

    run().catch(() => {})

    // BUG-60: signing out from the popover on the landing page pushes to '/'
    // (a no-op) and refresh() only re-renders server components — without this
    // listener the stale shell would stay up next to the returning
    // PublicHeader, recreating the double navbar.
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setFetched(null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [selfFetch])

  // Coach context: unread notification count on the avatar (moved here from
  // the old sidebar chrome — same query).
  useEffect(() => {
    if (context !== 'coach') return
    const fetchNotificationCount = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()
        if (!userProfile) return

        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_profile_id', userProfile.id)
          .eq('is_read', false)

        setNotificationCount(count || 0)
      } catch {
        // Fail silently
      }
    }
    fetchNotificationCount()
  }, [context])

  // Coach context: live avatar/name refresh after a profile edit
  // (BUG-37 precedence: public display_name over private full_name).
  useEffect(() => {
    if (context !== 'coach') return
    const handleProfileUpdated = () => {
      fetchCoachProfileCached()
        .then(
          (p: {
            avatar_url?: string | null
            full_name?: string
            display_name?: string | null
          } | null) => {
            if (!p) return
            setLiveAvatarUrl(p.avatar_url ?? null)
            const nextName = p.display_name || p.full_name
            if (nextName) setLiveName(nextName)
          },
        )
        .catch(() => {})
    }
    window.addEventListener('crikly:profile-updated', handleProfileUpdated)
    return () =>
      window.removeEventListener('crikly:profile-updated', handleProfileUpdated)
  }, [context])

  // Close popover on outside tap — container includes trigger + panel.
  useEffect(() => {
    if (!popoverOpen) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!avatarRef.current?.contains(event.target as Node)) {
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

  // Landing renders nothing until an authenticated identity resolves.
  if (selfFetch && !fetched) return null

  const identity: ShellIdentity = fetched ?? {
    name,
    email,
    avatarUrl,
    activeRole,
    roles,
    // Parent layout passes full_name as `name`; only the coach layout (where
    // `name` is the display_name) needs the separate fullName prop.
    fullName: fullName || name,
    coachStatus,
  }
  const shownName = liveName ?? identity.name
  const shownAvatarUrl = liveAvatarUrl ?? identity.avatarUrl
  const settingsHref =
    identity.activeRole === 'coach' ? '/coach/settings' : '/parent/settings'
  const notificationBadge =
    notificationCount > 9 ? '9+' : notificationCount.toString()

  return (
    <header
      data-testid="app-shell"
      className={`relative flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-100 bg-white px-3.5 md:gap-3.5 md:px-5 ${className}`}
    >
      {/* UI-FIX: logo always returns to the landing page — never a dashboard
          (Dashboard lives in the account popover). */}
      <Link href="/" aria-label="Crikly home" className="no-underline">
        <Image
          src="/logo.png"
          alt="Crikly"
          width={150}
          height={40}
          className="h-10 w-auto"
          priority
        />
      </Link>

      {context === 'parent' && (
        // P-07 fix: absolutely centred (same pattern as the landing nav
        // below / PublicHeader) instead of left-aligned beside the logo.
        // md: breakpoint for the same reason as landing — below 768px the
        // centred links collide with the pill+avatar cluster.
        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex"
        >
          {PARENT_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium no-underline transition-colors hover:text-neutral-900 ${
                pathname.startsWith(link.match)
                  ? 'text-neutral-900'
                  : 'text-neutral-600'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}

      {/* BUG-59: on the landing page the shell replaces the PublicHeader for
          logged-in users, so it carries the marketing links (same /#…
          targets). Hash links — no active-state highlight to compute.
          UI-FIX: absolutely centred (matches PublicHeader) so the links sit
          in the true middle regardless of logo/pill widths either side.
          md: breakpoint (not sm:) — same as PublicHeader, and below 768px
          the centred links would collide with the pill+avatar cluster. */}
      {context === 'landing' && (
        <nav
          aria-label="Primary"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex"
        >
          {LANDING_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-neutral-600 no-underline transition-colors hover:text-neutral-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}

      {/* UI-FIX: role pill grouped with the avatar on the right — both are
          account/identity controls. */}
      <div className="ml-auto flex items-center gap-2.5 md:gap-3.5">
        <RolePill activeRole={identity.activeRole} roles={identity.roles} />
        <div ref={avatarRef} className="relative">
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={popoverOpen}
            aria-label="Account menu"
            data-testid="parent-nav-avatar"
            className="relative flex items-center justify-center rounded-full transition-opacity hover:opacity-90"
          >
            <CriklyAvatar
              seed={shownName}
              style="personas"
              size={40}
              photoUrl={shownAvatarUrl}
              alt={shownName}
            />
            {context === 'coach' && notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-0.5 text-xs font-bold leading-none text-white shadow-sm">
                {notificationBadge}
              </span>
            )}
          </button>
          <ProfilePopover
            open={popoverOpen}
            onClose={() => setPopoverOpen(false)}
            name={identity.fullName || shownName}
            email={identity.email}
            dashboardHref={SHELL_ROLE_META[identity.activeRole].dashboardHref}
            settingsHref={settingsHref}
            myProfileStatus={
              identity.activeRole === 'coach' ? identity.coachStatus : undefined
            }
            onShareProfile={
              context === 'coach'
                ? () =>
                    window.dispatchEvent(
                      new CustomEvent('crikly:open-share-modal'),
                    )
                : undefined
            }
          />
        </div>
      </div>
    </header>
  )
}
