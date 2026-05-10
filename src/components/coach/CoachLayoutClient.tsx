'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Home, Calendar, Inbox, Users, Clock, User,
  TrendingUp, CreditCard, Settings, Share2,
  X, Copy, QrCode, Mail
} from 'lucide-react'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'
import { createClient } from '@/lib/supabase/client'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'

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

  const isActive = (path: string) => pathname === path ||
    (path !== '/coach/dashboard' && pathname.startsWith(path))

  const nav = (path: string) => router.push(path)

  // Hide right panel on onboarding AND dashboard (dashboard renders its own with data)
  const showRightPanel = !pathname.includes('/onboarding') && pathname !== '/coach/dashboard'

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

  // AF-H-39: fetch coach slug for share URLs (cached helper — warm after onboarding)
  useEffect(() => {
    fetchCoachProfileCached()
      .then(p => { if (p?.slug) setCoachSlug(p.slug) })
      .catch(() => {})
  }, [])

  // AF-H-39/40: derive share URLs from coach slug
  const profileUrl = coachSlug ? `https://crikly.app/${coachSlug}` : 'https://crikly.app'
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Book a session with me on Crikly: ${profileUrl}`)}`
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`
  const emailUrl = `mailto:?subject=${encodeURIComponent('Book a session with me')}&body=${encodeURIComponent(`Hi! Book a session with me on Crikly: ${profileUrl}`)}`

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
            <SidebarItem icon={<User size={20} />} label="My Profile" active={isActive('/coach/profile')} onClick={() => nav('/coach/profile/edit')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-2">Account</div>
            <SidebarItem icon={<TrendingUp size={20} />} label="Earnings" active={isActive('/coach/earnings')} onClick={() => nav('/coach/earnings')} />
            <SidebarItem icon={<CreditCard size={20} />} label="Get Paid" warningDot active={isActive('/coach/get-paid')} onClick={() => nav('/coach/get-paid')} />
            {/* C-Settings-01-UI: Settings entry — placed at end of Account cluster (Ambiguity 3) */}
            <SidebarItem icon={<Settings size={20} />} label="Settings" active={isActive('/coach/settings')} onClick={() => nav('/coach/settings')} />
          </div>
        </nav>

      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto relative bg-white">
        {children}
      </main>

      {/* Right Panel */}
      {showRightPanel && <CoachRightPanel />}

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
            <div className="flex flex-col gap-2.5 mb-8">
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-[14px] p-2 pl-4">
                <span className="text-[15px] text-gray-600 font-medium truncate mr-3">crikly.app{coachSlug ? `/${coachSlug}` : ''}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(profileUrl).catch(() => { /* clipboard may be blocked */ })
                  }}
                  className="bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-[10px] font-bold text-[13px] shadow-sm hover:bg-gray-50 flex items-center gap-1.5 shrink-0"
                >
                  <Copy size={14} />Copy
                </button>
              </div>
            </div>
            <div className="flex justify-between items-start">
              <button
                key="WhatsApp"
                type="button"
                onClick={() => window.open(whatsappUrl, '_blank', 'noopener')}
                className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
              >
                <div className="w-[52px] h-[52px] rounded-2xl bg-green-50 hover:bg-green-100 flex items-center justify-center transition-colors shadow-sm">
                  <div className="group-hover:scale-110 transition-transform duration-300">
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                    </svg>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">WhatsApp</span>
              </button>
              <button
                key="Instagram"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(profileUrl).catch(() => {})
                }}
                title="Link copied — paste on Instagram"
                className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
              >
                <div className="w-[52px] h-[52px] rounded-2xl bg-pink-50 hover:bg-pink-100 flex items-center justify-center transition-colors shadow-sm">
                  <div className="group-hover:scale-110 transition-transform duration-300">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-600">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                    </svg>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">Instagram</span>
              </button>
              <button
                key="Facebook"
                type="button"
                onClick={() => window.open(facebookUrl, '_blank', 'noopener')}
                className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
              >
                <div className="w-[52px] h-[52px] rounded-2xl bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors shadow-sm">
                  <div className="group-hover:scale-110 transition-transform duration-300">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-blue-600">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">Facebook</span>
              </button>
              <button
                key="Email"
                type="button"
                onClick={() => window.open(emailUrl)}
                className="flex flex-col items-center gap-2.5 cursor-pointer group w-[64px] bg-transparent p-0 border-0"
              >
                <div className="w-[52px] h-[52px] rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors shadow-sm">
                  <div className="group-hover:scale-110 transition-transform duration-300">
                    <Mail size={24} className="text-gray-700" />
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">Email</span>
              </button>
              <button
                key="QRCode"
                type="button"
                disabled
                title="QR Code coming soon"
                className="flex flex-col items-center gap-2.5 cursor-not-allowed group w-[64px] bg-transparent p-0 border-0 opacity-50"
              >
                <div className="w-[52px] h-[52px] rounded-2xl bg-purple-50 flex items-center justify-center shadow-sm">
                  <div>
                    <QrCode size={24} className="text-purple-600" />
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">QR Code</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SidebarItem({ icon, label, active, badge, warningDot, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; badge?: number; warningDot?: boolean; onClick?: () => void
}) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-[#0077CC]/10 text-[#0077CC] font-bold' : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'}`}>
      <div className="flex items-center gap-3.5">
        <div className="relative">
          {icon}
          {warningDot && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white" />}
        </div>
        <span className="text-[15px]">{label}</span>
      </div>
      {badge && <div className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[11px] font-bold shadow-sm">{badge}</div>}
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
