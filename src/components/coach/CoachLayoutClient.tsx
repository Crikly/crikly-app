'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Home, Calendar, Inbox, Users, Clock, User,
  TrendingUp, Star, CreditCard, Settings, Share2,
  X
} from 'lucide-react'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'
// DS-RIGHT-PANEL-01: BookingsProvider is now mounted on EVERY coach route
// because the universal right-panel command-centre reads sessions from it.
// Previously gated to /coach/bookings only. The cost is 4 parallel fetches
// per coach page load (~200ms) — acceptable for the consistency win.
// Follow-up: PERF-RIGHT-PANEL-DASHBOARD-DEDUPE.
import { BookingsProvider } from '@/contexts/BookingsContext'
import { createClient } from '@/lib/supabase/client'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'
import { ShareLinkPanel } from '@/components/coach/shared/ShareLinkPanel'

interface CoachLayoutClientProps {
  children: React.ReactNode
  initialCoachName: string
  initialAvatarUrl: string | null
}

export function CoachLayoutClient({
  children,
  initialCoachName,
  initialAvatarUrl,
}: CoachLayoutClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)
  // AF-H-39: real coach slug from DB (was: name-derived single-replace)
  const [coachSlug, setCoachSlug] = useState('')
  // BUG-GO-LIVE-PATH: profile status drives the My Profile sidebar pulse dot.
  // null = unknown (don't render dot until fetch resolves to avoid flash).
  const [profileLive, setProfileLive] = useState<boolean | null>(null)
  const [profilePaused, setProfilePaused] = useState(false)

  const isActive = (path: string) => pathname === path ||
    (path !== '/coach/dashboard' && pathname.startsWith(path))

  const nav = (path: string) => router.push(path)

  // DS-RIGHT-PANEL-01: panel renders on every coach route EXCEPT onboarding.
  // The dashboard inclusion was added by this task — dashboard previously
  // mounted CoachRightPanel from inside CoachHomeClient to pass dashboardData
  // as a prop, but the universal panel reads from contexts directly now.
  const showRightPanel = !pathname.includes('/onboarding')

  // Extract initials from coach name (same logic as OnboardingPreviewPanel)
  const initials = initialCoachName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2) || initialCoachName.charAt(0).toUpperCase() || 'C'

  // Fetch notification count
  useEffect(() => {
    const fetchNotificationCount = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
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
  }, [])

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
  // crikly:open-share-modal listener pattern at L86–90. Handler body is a
  // verbatim duplicate of the mount-fetch above — if that shape changes,
  // this handler must change too (drift risk noted in commit body).
  useEffect(() => {
    const handleProfileUpdated = () => {
      fetchCoachProfileCached()
        .then((p: { slug?: string; is_profile_live?: boolean; is_paused?: boolean } | null) => {
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

  // BUG-GO-LIVE-MODAL-SHARE: share URLs derived inside ShareLinkPanel from slug.
  // (Previously profileUrl/whatsappUrl/facebookUrl/emailUrl were derived here.)

  // Format notification badge
  const notificationBadge = notificationCount > 9 ? '9+' : notificationCount.toString()

  return (
    <div className="h-screen overflow-hidden bg-white text-gray-900 flex w-full max-w-[1600px] mx-auto">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col bg-white border-r border-gray-100 p-6 sticky top-0 h-screen z-10">
        <Link href="/coach/dashboard" className="mb-6 flex justify-center">
          <img
            src="/logo.png"
            alt="Crikly"
            className="w-36 h-auto object-contain"
          />
        </Link>

        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
            <Link href="/coach/dashboard" className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative">
                {initialAvatarUrl && initialAvatarUrl.trim() !== '' ? (
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 shadow-sm">
                    <img src={initialAvatarUrl} alt={initialCoachName} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-[#E6F1FB] rounded-full flex items-center justify-center shrink-0">
                    <span className="text-[#0C447C] text-[14px] font-bold">{initials}</span>
                  </div>
                )}
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                    {notificationBadge}
                  </span>
                )}
              </div>
              <p className="text-base font-bold text-gray-900 leading-tight truncate">{initialCoachName}</p>
            </Link>
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="text-gray-400 hover:text-[#0077CC] transition-colors p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm group shrink-0"
            >
              <Share2 size={14} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>

          <div className="bg-gray-100 p-1 rounded-lg flex items-center w-full">
            <button className="flex-1 bg-white shadow-sm rounded-md py-1.5 text-xs font-bold text-gray-900 transition-all">Coach</button>
            <button
              disabled
              title="Parent module coming soon"
              className="flex-1 rounded-md py-1.5 text-xs font-bold text-gray-500 opacity-40 cursor-not-allowed transition-all"
            >
              Parent
            </button>
          </div>
        </div>

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
            {/* BUG-GO-LIVE-PATH: pulse dot signals action-needed (green = go live) or status (orange = paused) */}
            <SidebarItem
              icon={<User size={20} />}
              label="My Profile"
              active={isActive('/coach/profile')}
              pulseDot={profileLive === false ? 'success' : (profileLive && profilePaused ? 'warning' : undefined)}
              pulseTitle={profileLive === false ? 'Your profile is not live yet' : (profileLive && profilePaused ? 'Your profile is paused' : undefined)}
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
        <main className="flex-1 overflow-y-auto relative bg-white">
          {children}
        </main>
        {showRightPanel && <CoachRightPanel />}
      </BookingsProvider>

      {/* Mobile Bottom Nav */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-6 pt-3 px-6 flex justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
        <MobileNavItem icon={<Home size={24} />} label="Home" active={isActive('/coach/dashboard')} onClick={() => nav('/coach/dashboard')} />
        <MobileNavItem icon={<Calendar size={24} />} label="Schedule" active={isActive('/coach/schedule')} onClick={() => nav('/coach/schedule')} />
        <MobileNavItem icon={<Inbox size={24} />} label="Bookings" active={isActive('/coach/bookings')} onClick={() => nav('/coach/bookings')} />
        <MobileNavItem icon={<Users size={24} />} label="Programmes" active={isActive('/coach/programmes')} onClick={() => nav('/coach/programmes')} />
        {/* C-Settings-01-UI: replaces the AF-H-Wave-4 "More" stub now that Settings exists */}
        <MobileNavItem
          icon={<Settings size={24} />}
          label="Settings"
          active={isActive('/coach/settings')}
          onClick={() => nav('/coach/settings')}
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
  // BUG-GO-LIVE-PATH: animated dot for action-needed (success = go live) / paused (warning = paused).
  // Distinct from the static `warningDot` (e.g. Get Paid Stripe-pending) by both colour and pulse animation.
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
