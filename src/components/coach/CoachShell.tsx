'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { 
  Home, Calendar, Inbox, Users, MoreHorizontal, 
  Clock, TrendingUp, Settings, CreditCard, User, Share2
} from 'lucide-react'

const avatarUrl = "https://images.unsplash.com/photo-1741363863033-2d68f0bd9fde?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRpYW4lMjBtYW4lMjBzbWlsaW5nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzc1NDg3OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080"

type ActiveItem = 'home' | 'schedule' | 'bookings' | 'programmes' | 'availability' | 'profile' | 'earnings' | 'get-paid'

interface CoachShellProps {
  children: React.ReactNode
  activeItem?: ActiveItem
}

export function CoachShell({ children, activeItem = 'home' }: CoachShellProps) {
  const router = useRouter()
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-white text-gray-900 flex w-full" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      
      {/* Desktop Sidebar */}
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
                title="Share profile"
              >
                <Share2 size={14} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
          
          <div className="bg-gray-100 p-1 rounded-lg flex items-center w-full">
            <button className="flex-1 bg-white shadow-sm rounded-md py-1.5 text-xs font-bold text-gray-900 transition-all">Coach</button>
            <button onClick={() => router.push('/parent/dashboard')} className="flex-1 rounded-md py-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-all">Parent</button>
          </div>
        </div>
        
        <nav className="flex flex-col gap-6 flex-1 overflow-y-auto pb-6">
          <div className="flex flex-col gap-1.5">
            <SidebarItem icon={<Home size={20} />} label="Home" active={activeItem === 'home'} onClick={() => router.push('/coach/dashboard')} />
            <SidebarItem icon={<Calendar size={20} />} label="Schedule" active={activeItem === 'schedule'} onClick={() => router.push('/coach/schedule')} />
            <SidebarItem icon={<Inbox size={20} />} label="Bookings" active={activeItem === 'bookings'} badge={2} onClick={() => router.push('/coach/bookings')} />
            <SidebarItem icon={<Users size={20} />} label="Programmes" active={activeItem === 'programmes'} onClick={() => router.push('/coach/programmes')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-2">Manage</div>
            <SidebarItem icon={<Clock size={20} />} label="Availability" active={activeItem === 'availability'} onClick={() => router.push('/coach/availability')} />
            <SidebarItem icon={<User size={20} />} label="My Profile" active={activeItem === 'profile'} onClick={() => router.push('/coach/profile/edit')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1 mt-2">Account</div>
            <SidebarItem icon={<TrendingUp size={20} />} label="Earnings" active={activeItem === 'earnings'} onClick={() => router.push('/coach/earnings')} />
            <SidebarItem icon={<CreditCard size={20} />} label="Get Paid" active={activeItem === 'get-paid'} warningDot onClick={() => router.push('/coach/get-paid')} />
          </div>
        </nav>
        
        <div className="mt-auto pt-6 border-t border-gray-100">
          <SidebarItem icon={<Settings size={20} />} label="Settings" onClick={() => router.push('/coach/settings')} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full min-h-screen bg-white overflow-y-auto">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 pb-6 pt-3 px-6 flex justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
        <NavItem icon={<Home size={24} />} label="Home" active={activeItem === 'home'} onClick={() => router.push('/coach/dashboard')} />
        <NavItem icon={<Calendar size={24} />} label="Schedule" active={activeItem === 'schedule'} onClick={() => router.push('/coach/schedule')} />
        <NavItem icon={<Inbox size={24} />} label="Bookings" active={activeItem === 'bookings'} badge={2} onClick={() => router.push('/coach/bookings')} />
        <NavItem icon={<Users size={24} />} label="Programmes" active={activeItem === 'programmes'} onClick={() => router.push('/coach/programmes')} />
        <NavItem icon={<MoreHorizontal size={24} />} label="More" onClick={() => {}} />
      </div>
    </div>
  )
}

function SidebarItem({ icon, label, active, badge, warningDot, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; badge?: number; warningDot?: boolean; onClick?: () => void
}) {
  return (
    <div onClick={onClick} className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-[#0077CC]/10 text-[#0077CC] font-bold' : 'text-gray-600 font-medium hover:bg-gray-50 hover:text-gray-900'}`}>
      <div className="flex items-center gap-3">
        <div className={`${active ? 'text-[#0077CC]' : 'text-gray-400'}`}>{icon}</div>
        <span className="text-[15px]">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge !== undefined && badge > 0 && (
          <div className="min-w-[20px] h-5 px-1.5 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-[11px] font-bold text-white">{badge}</span>
          </div>
        )}
        {warningDot && <div className="w-2 h-2 bg-amber-500 rounded-full" />}
      </div>
    </div>
  )
}

function NavItem({ icon, label, active, badge, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; badge?: number; onClick?: () => void
}) {
  return (
    <div onClick={onClick} className="flex flex-col items-center gap-1 cursor-pointer group relative">
      <div className={`${active ? 'text-[#0077CC]' : 'text-gray-400 group-hover:text-gray-600'} transition-colors relative`}>
        {icon}
        {badge !== undefined && badge > 0 && (
          <div className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center border-2 border-white">
            <span className="text-[10px] font-bold text-white">{badge}</span>
          </div>
        )}
      </div>
      <span className={`text-[11px] font-medium ${active ? 'text-[#0077CC]' : 'text-gray-500 group-hover:text-gray-700'} transition-colors`}>{label}</span>
    </div>
  )
}
