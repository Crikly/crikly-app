'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Home, Calendar, Inbox, Users, Clock, User,
  TrendingUp, Star, CreditCard, Settings,
  MoreHorizontal, X
} from 'lucide-react'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'
// DS-RIGHT-PANEL-01: BookingsProvider is now mounted on EVERY coach route
// because the universal right-panel command-centre reads sessions from it.
// Previously gated to /coach/bookings only. The cost is 4 parallel fetches
// per coach page load (~200ms) — acceptable for the consistency win.
// Follow-up: PERF-RIGHT-PANEL-DASHBOARD-DEDUPE.
import { BookingsProvider } from '@/contexts/BookingsContext'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'
import { shouldNudgeToWizard } from '@/lib/coach-onboarding-gate'
import { ShareLinkPanel } from '@/components/coach/shared/ShareLinkPanel'

interface CoachLayoutClientProps {
  children: React.ReactNode
  hasCoachProfile: boolean
  // BUG-34: wizard step 1 completed (coach_profiles.display_name set) —
  // replaces isProfileLive as the onboarding-nudge signal.
  hasWizardProgress: boolean
}

// P-04-C: the sidebar chrome (logo, avatar + notification badge, Coach|Parent
// tabs, share button) moved into the unified AppShell rendered by
// src/app/coach/layout.tsx. This component now owns ONLY the content
// navigation + main/right-panel composition + the share modal (still opened
// via the crikly:open-share-modal event, now dispatched from the shell's
// account popover as well as the Go Live celebration).

export function CoachLayoutClient({
  children,
  hasCoachProfile,
  hasWizardProgress,
}: CoachLayoutClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  // AF-H-39: real coach slug from DB (was: name-derived single-replace)
  const [coachSlug, setCoachSlug] = useState('')
  // BUG-GO-LIVE-PATH: profile status drives the My Profile sidebar pulse dot.
  // null = unknown (don't render dot until fetch resolves to avoid flash).
  const [profileLive, setProfileLive] = useState<boolean | null>(null)
  const [profilePaused, setProfilePaused] = useState(false)

  const isActive = (path: string) => pathname === path ||
    (path !== '/coach/dashboard' && pathname.startsWith(path))

  // BUG-42: the mobile "More" tab is the entry point for every surface that has
  // no tab of its own — highlight it while the coach is anywhere inside them.
  const isMoreSectionActive = [
    '/coach/more',
    '/coach/availability',
    '/coach/profile',
    '/coach/earnings',
    '/coach/reviews',
    '/coach/get-paid',
    '/coach/settings',
  ].some(isActive)

  const nav = (path: string) => router.push(path)

  // DS-RIGHT-PANEL-01: panel renders on every coach route EXCEPT onboarding.
  // The dashboard inclusion was added by this task — dashboard previously
  // mounted CoachRightPanel from inside CoachHomeClient to pass dashboardData
  // as a prop, but the universal panel reads from contexts directly now.
  const showRightPanel = !pathname.includes('/onboarding')

  // Fix-36b: Listen for custom event to open share modal from celebration modal
  useEffect(() => {
    const handleOpenShare = () => setIsShareModalOpen(true)
    window.addEventListener('crikly:open-share-modal', handleOpenShare)
    return () => window.removeEventListener('crikly:open-share-modal', handleOpenShare)
  }, [])

  // AF-H-39: fetch coach slug for share URLs (cached helper — warm after onboarding).
  // BUG-GO-LIVE-PATH: also captures is_profile_live + is_paused for the sidebar pulse dot.
  useEffect(() => {
    fetchCoachProfileCached()
      .then((p: { slug?: string; is_profile_live?: boolean; is_paused?: boolean } | null) => {
        if (p?.slug) setCoachSlug(p.slug)
        if (p) {
          setProfileLive(!!p.is_profile_live)
          setProfilePaused(!!p.is_paused)
        }
      })
      .catch(() => {})
  }, [])

  // BUG-SIDEBAR-PULSE-STALE: listen for in-session profile cache invalidation
  // from ProfileEdit (Go Live, mount-freshen, photo upload) and re-read so the
  // pulse dot reflects the current is_profile_live + is_paused. Without this,
  // the [] deps fetch above runs once at layout mount and never recomputes,
  // leaving the sidebar dot frozen until full page reload. Matches the
  // crikly:open-share-modal listener pattern above. Handler body is a
  // verbatim duplicate of the mount-fetch above — if that shape changes,
  // this handler must change too (drift risk noted in commit body).
  // P-04-C: avatar/name live-refresh (Fix-COACH-UX-05) moved to AppShell with
  // the avatar itself — this handler keeps only the pulse-dot + slug reads.
  useEffect(() => {
    const handleProfileUpdated = () => {
      fetchCoachProfileCached()
        .then((p: {
          slug?: string
          is_profile_live?: boolean
          is_paused?: boolean
        } | null) => {
          if (p?.slug) setCoachSlug(p.slug)
          if (p) {
            setProfileLive(!!p.is_profile_live)
            setProfilePaused(!!p.is_paused)
          }
        })
        .catch(() => {})
    }
    window.addEventListener('crikly:profile-updated', handleProfileUpdated)
    return () => window.removeEventListener('crikly:profile-updated', handleProfileUpdated)
  }, [])

  // Fix-LAYOUT-02 / 02b: onboarding-completeness redirect, moved here from the
  // server layout (a server-side redirect() was cached in the production RSC
  // payload → 153-request loop). Fires ONCE on first entry into /coach/*: this
  // layout persists across sibling /coach/* navigations and does not remount, so
  // [] deps nudge an incomplete coach to onboarding once without bouncing every
  // later navigation (REQ-C-001, dashboard-first). Reads mount-time props +
  // pathname by design. UX-only gate — role + terms stay server-side; API routes
  // use requireCoachContext.
  // BUG-34: the nudge keys on wizard progress, not is_profile_live — see
  // shouldNudgeToWizard for the full rationale.
  useEffect(() => {
    if (shouldNudgeToWizard({ hasCoachProfile, hasWizardProgress, pathname })) {
      router.push('/coach/onboarding/profile')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // BUG-GO-LIVE-MODAL-SHARE: share URLs derived inside ShareLinkPanel from slug.
  // (Previously profileUrl/whatsappUrl/facebookUrl/emailUrl were derived here.)

  // BUG-40b: the document never scrolls — the shell fills the viewport and
  // <main> scrolls internally. flex-col on mobile puts the bottom nav IN FLOW
  // below <main>, so no page content can ever sit behind it.
  // P-04-C: viewport sizing (h-dvh) moved up to the flex-col wrapper in
  // src/app/coach/layout.tsx — this shell now fills the height remaining
  // below the 64px app shell bar (flex-1 min-h-0).
  return (
    <div className="flex-1 min-h-0 overflow-hidden overflow-x-clip bg-white text-gray-900 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto">
      {/* Desktop Sidebar — P-04-C: pure content navigation. Logo, avatar and
          the Coach|Parent toggle moved into the AppShell bar above. */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-white border-r border-gray-100 p-6 h-full z-10">
        <nav className="flex flex-col gap-6 flex-1 overflow-y-auto pb-6">
          <div className="flex flex-col gap-1.5">
            <SidebarItem icon={<Home size={20} />} label="Home" active={isActive('/coach/dashboard')} onClick={() => nav('/coach/dashboard')} />
            <SidebarItem icon={<Calendar size={20} />} label="Schedule" active={isActive('/coach/schedule')} onClick={() => nav('/coach/schedule')} />
            <SidebarItem icon={<Inbox size={20} />} label="Bookings" active={isActive('/coach/bookings')} onClick={() => nav('/coach/bookings')} />
            <SidebarItem icon={<Users size={20} />} label="Programmes" active={isActive('/coach/programmes')} onClick={() => nav('/coach/programmes')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-2">Manage</div>
            <SidebarItem icon={<Clock size={20} />} label="Availability" active={isActive('/coach/availability')} onClick={() => nav('/coach/availability')} />
            {/* BUG-QA-04: dot is a STATUS indicator — green when live, amber when live+paused,
                no dot when draft. The Profile page already shows a Go Live banner for draft state. */}
            <SidebarItem
              icon={<User size={20} />}
              label="My Profile"
              active={isActive('/coach/profile')}
              pulseDot={profileLive === true && profilePaused ? 'warning' : (profileLive === true ? 'success' : undefined)}
              pulseTitle={profileLive === true && profilePaused ? 'Your profile is paused' : (profileLive === true ? 'Your profile is live' : undefined)}
              onClick={() => nav('/coach/profile/edit')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-2">Account</div>
            <SidebarItem icon={<TrendingUp size={20} />} label="Earnings" active={isActive('/coach/earnings')} onClick={() => nav('/coach/earnings')} />
            <SidebarItem icon={<Star size={20} />} label="Reviews" active={isActive('/coach/reviews')} onClick={() => nav('/coach/reviews')} />
            <SidebarItem icon={<CreditCard size={20} />} label="Get Paid" warningDot active={isActive('/coach/get-paid')} onClick={() => nav('/coach/get-paid')} />
            {/* C-Settings-01-UI: Settings entry — placed at end of Account cluster (Ambiguity 3) */}
            <SidebarItem icon={<Settings size={20} />} label="Settings" active={isActive('/coach/settings')} onClick={() => nav('/coach/settings')} />
          </div>
        </nav>

      </aside>

      {/* DS-RIGHT-PANEL-01: BookingsProvider wraps every coach route so the
          universal right-panel command-centre can read sessions everywhere.
          Both <main> and the right panel are inside the same provider. */}
      <BookingsProvider>
        {/* BUG-40b: min-h-0 — in the mobile flex-col shell, flex items refuse to
            shrink below their content height without it, which would break the
            inner scroll and push the bottom nav offscreen. No-op on lg (row). */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto relative bg-white">
          {children}
        </main>
        {showRightPanel && <CoachRightPanel />}
      </BookingsProvider>

      {/* Mobile Bottom Nav — BUG-40b: in-flow (shrink-0), NOT fixed. As the last
          item of the mobile flex-col shell it sits below <main>'s scrollport, so
          page content and sticky save bars always end above it. z-30 keeps the
          top shadow above main's content. */}
      <div className="lg:hidden shrink-0 bg-white border-t border-gray-100 pb-6 pt-3 px-6 flex justify-between items-center z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
        <MobileNavItem icon={<Home size={24} />} label="Home" active={isActive('/coach/dashboard')} onClick={() => nav('/coach/dashboard')} />
        <MobileNavItem icon={<Calendar size={24} />} label="Schedule" active={isActive('/coach/schedule')} onClick={() => nav('/coach/schedule')} />
        <MobileNavItem icon={<Inbox size={24} />} label="Bookings" active={isActive('/coach/bookings')} onClick={() => nav('/coach/bookings')} />
        <MobileNavItem icon={<Users size={24} />} label="Programmes" active={isActive('/coach/programmes')} onClick={() => nav('/coach/programmes')} />
        {/* BUG-42: "More" hub replaces the Settings tab — Availability, My Profile,
            Earnings, Reviews, Get Paid and Settings had no mobile entry point.
            Active whenever the current page lives inside the More section. */}
        <MobileNavItem
          icon={<MoreHorizontal size={24} />}
          label="More"
          active={isMoreSectionActive}
          onClick={() => nav('/coach/more')}
        />
      </div>

      {isShareModalOpen && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setIsShareModalOpen(false)}>
          <div className="bg-white rounded-3xl w-full max-w-[400px] p-6 md:p-8 shadow-xl relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsShareModalOpen(false)} className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors">
              <X size={18} />
            </button>
            <h2 className="text-[22px] font-bold text-gray-900 mb-6 pr-8 leading-tight">Share your profile</h2>
            {/* BUG-GO-LIVE-MODAL-SHARE: URL strip + Copy + 5 social icons extracted to
                ShareLinkPanel so the Go Live modal can render the same UI. */}
            <ShareLinkPanel slug={coachSlug} />
          </div>
        </div>
      )}
    </div>
  )
}

function SidebarItem({ icon, label, active, badge, warningDot, pulseDot, pulseTitle, onClick }: {
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: number
  warningDot?: boolean
  // BUG-QA-04: animated dot is a STATUS indicator — success = profile is live, warning = profile is paused.
  // No dot when draft (is_profile_live=false). Distinct from the static `warningDot` (e.g. Get Paid Stripe-pending)
  // by both colour and pulse animation.
  pulseDot?: 'success' | 'warning'
  pulseTitle?: string
  onClick?: () => void
}) {
  return (
    <div onClick={onClick} className={`relative flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-[#0077CC]/10 text-[#0077CC] font-bold' : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'}`}>
      <div className="flex items-center gap-3.5">
        <div className="relative">
          {icon}
          {warningDot && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white" />}
        </div>
        <span className="text-[15px]">{label}</span>
      </div>
      {badge && <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[11px] font-bold shadow-sm">{badge}</div>}
      {/* FIX-PULSE-DOT-POSITION: pulse dot moved out of icon wrapper to row level,
          flush right + vertically centred. The 10px wrapper / 8px dot / animate-ping
          ring structure from BUG-PULSE-DOT-VISIBILITY is preserved verbatim. */}
      {pulseDot && (
        <span
          title={pulseTitle}
          className="absolute right-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5"
        >
          <span
            className={`absolute inset-0 rounded-full opacity-75 animate-ping ${pulseDot === 'success' ? 'bg-green-600' : 'bg-amber-600'}`}
          />
          <span
            className={`absolute inset-px rounded-full ${pulseDot === 'success' ? 'bg-green-600' : 'bg-amber-600'}`}
          />
        </span>
      )}
    </div>
  )
}

function MobileNavItem({ icon, label, active, badge, onClick, disabled, title }: {
  icon: React.ReactNode; label: string; active: boolean; badge?: number; onClick: () => void
  disabled?: boolean; title?: string
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      title={title}
      className={`flex flex-col items-center gap-1.5 p-2 relative min-w-[60px] ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className={`transition-colors ${active ? 'text-[#0077CC]' : 'text-gray-400'}`}>{icon}</div>
      <span className={`text-[11px] font-bold transition-colors ${active ? 'text-[#0077CC]' : 'text-gray-400'}`}>{label}</span>
      {badge && <div className="absolute top-1 right-2 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold border-[1.5px] border-white shadow-sm">{badge}</div>}
    </div>
  )
}
