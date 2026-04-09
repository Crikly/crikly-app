'use client'

import React, { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  Home, Calendar, Inbox, Users, Clock, User,
  TrendingUp, CreditCard, Settings, Share2,
  MoreHorizontal, X, Copy, QrCode, Mail, Link2
} from 'lucide-react'

const avatarUrl = "https://images.unsplash.com/photo-1741363863033-2d68f0bd9fde?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRpYW4lMjBtYW4lMjBzbWlsaW5nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzc1NDg3OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080"

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)

  const isActive = (path: string) => pathname === path ||
    (path !== '/coach/dashboard' && pathname.startsWith(path))

  const nav = (path: string) => router.push(path)

  return (
    <div
      className="min-h-screen bg-white text-gray-900 flex w-full"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Desktop Sidebar — stays mounted always */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white border-r border-gray-100 p-6 sticky top-0 h-screen z-10">
        <div className="w-[160px] h-[40px] border border-dashed border-gray-300 rounded-lg flex items-center justify-center relative mb-6">
          <span className="absolute -top-1.5 left-2 bg-white px-1 text-[10px] text-gray-400 font-medium uppercase tracking-wider leading-none">Logo</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#0077CC] text-white flex items-center justify-center font-bold text-xs shadow-sm">C</div>
            <span className="text-lg font-bold text-[#0077CC] tracking-tight">Crikly</span>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors border border-transparent hover:border-gray-100">
            <div className="relative">
              <img src={avatarUrl} alt="Ravi" className="w-10 h-10 rounded-full object-cover shadow-sm" />
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm">3</span>
            </div>
            <div className="flex items-center justify-between flex-1 pr-1">
              <p className="text-base font-bold text-gray-900 leading-tight">Ravi Patel</p>
              <button
                onClick={(e) => { e.stopPropagation(); setIsShareModalOpen(true) }}
                className="text-gray-400 hover:text-[#0077CC] transition-colors p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm group"
              >
                <Share2 size={14} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>

          <div className="bg-gray-100 p-1 rounded-lg flex items-center w-full">
            <button className="flex-1 bg-white shadow-sm rounded-md py-1.5 text-xs font-bold text-gray-900 transition-all">Coach</button>
            <button onClick={() => nav('/parent/dashboard')} className="flex-1 rounded-md py-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-all">Parent</button>
          </div>
        </div>

        <nav className="flex flex-col gap-6 flex-1 overflow-y-auto pb-6">
          <div className="flex flex-col gap-1.5">
            <SidebarItem icon={<Home size={20} />} label="Home" active={isActive('/coach/dashboard')} onClick={() => nav('/coach/dashboard')} />
            <SidebarItem icon={<Calendar size={20} />} label="Schedule" active={isActive('/coach/schedule')} onClick={() => nav('/coach/schedule')} />
            <SidebarItem icon={<Inbox size={20} />} label="Bookings" badge={2} active={isActive('/coach/bookings')} onClick={() => nav('/coach/bookings')} />
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
          </div>
        </nav>

        <div className="mt-auto pt-6 border-t border-gray-100">
          <SidebarItem icon={<Settings size={20} />} label="Settings" active={isActive('/coach/settings')} onClick={() => nav('/coach/settings')} />
        </div>
      </aside>

      {/* Main content — swaps on navigation */}
      <main className="flex-1 min-h-screen overflow-y-auto relative">
        {children}
      </main>

      {/* Mobile Bottom Nav — stays mounted always */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-6 pt-3 px-6 flex justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
        <MobileNavItem icon={<Home size={24} />} label="Home" active={isActive('/coach/dashboard')} onClick={() => nav('/coach/dashboard')} />
        <MobileNavItem icon={<Calendar size={24} />} label="Schedule" active={isActive('/coach/schedule')} onClick={() => nav('/coach/schedule')} />
        <MobileNavItem icon={<Inbox size={24} />} label="Bookings" badge={2} active={isActive('/coach/bookings')} onClick={() => nav('/coach/bookings')} />
        <MobileNavItem icon={<Users size={24} />} label="Programmes" active={isActive('/coach/programmes')} onClick={() => nav('/coach/programmes')} />
        <MobileNavItem icon={<MoreHorizontal size={24} />} label="More" active={false} onClick={() => {}} />
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
                <span className="text-[15px] text-gray-600 font-medium truncate mr-3">crikly.app/ravi-patel</span>
                <button className="bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-[10px] font-bold text-[13px] shadow-sm hover:bg-gray-50 flex items-center gap-1.5 shrink-0">
                  <Copy size={14} />Copy
                </button>
              </div>
            </div>
            <div className="flex justify-between items-start">
              {[
                { icon: <Mail size={24} className="text-gray-700" />, label: 'Email', bg: 'bg-gray-100', hover: 'hover:bg-gray-200' },
                { icon: <QrCode size={24} className="text-purple-600" />, label: 'QR Code', bg: 'bg-purple-50', hover: 'hover:bg-purple-100' },
                { icon: <Link2 size={24} className="text-blue-600" />, label: 'Copy link', bg: 'bg-blue-50', hover: 'hover:bg-blue-100' },
              ].map(({ icon, label, bg, hover }) => (
                <div key={label} className="flex flex-col items-center gap-2.5 cursor-pointer group w-[80px]">
                  <div className={`w-[52px] h-[52px] rounded-2xl ${bg} ${hover} flex items-center justify-center transition-colors shadow-sm`}>
                    <div className="group-hover:scale-110 transition-transform">{icon}</div>
                  </div>
                  <span className="text-[11px] font-bold text-gray-600 text-center leading-tight">{label}</span>
                </div>
              ))}
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

function MobileNavItem({ icon, label, active, badge, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; badge?: number; onClick: () => void
}) {
  return (
    <div onClick={onClick} className="flex flex-col items-center gap-1.5 p-2 relative cursor-pointer min-w-[60px]">
      <div className={`transition-colors ${active ? 'text-[#0077CC]' : 'text-gray-400'}`}>{icon}</div>
      <span className={`text-[11px] font-bold transition-colors ${active ? 'text-[#0077CC]' : 'text-gray-400'}`}>{label}</span>
      {badge && <div className="absolute top-1 right-2 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold border-[1.5px] border-white shadow-sm">{badge}</div>}
    </div>
  )
}
