'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Home,
  Calendar,
  BookOpen,
  Users,
  Clock,
  User,
  TrendingUp,
  CreditCard,
  Settings,
  Bell,
  Share2,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Copy,
  MessageCircle,
  Camera,
  Share,
  Mail,
  QrCode,
  MapPin,
  MoreHorizontal,
} from 'lucide-react'

// Subcomponent: SidebarItem
interface SidebarItemProps {
  icon: React.ElementType
  label: string
  href: string
  active?: boolean
  badge?: number
  warningDot?: boolean
  onClick: () => void
}

function SidebarItem({ icon: Icon, label, active, badge, warningDot, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
        active
          ? 'bg-[#0077CC]/10 text-[#0077CC] font-bold'
          : 'text-gray-600 font-medium hover:bg-gray-50'
      }`}
    >
      <Icon size={20} />
      <span className="flex-1 text-left text-[15px]">{label}</span>
      {badge && badge > 0 ? (
        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
          {badge}
        </span>
      ) : null}
      {warningDot ? <div className="w-2 h-2 bg-amber-500 rounded-full" /> : null}
    </button>
  )
}

// Subcomponent: NavItem (mobile bottom nav)
interface NavItemProps {
  icon: React.ElementType
  label: string
  active?: boolean
  badge?: number
  onClick: () => void
}

function NavItem({ icon: Icon, label, active, badge, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center flex-1 py-2 relative ${
        active ? 'text-[#0077CC]' : 'text-gray-400'
      }`}
    >
      {active && <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#0077CC]" />}
      <div className="relative">
        <Icon size={24} />
        {badge && badge > 0 ? (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1 rounded-full min-w-[16px] h-4 flex items-center justify-center">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </div>
      <span className="text-[11px] font-medium mt-1">{label}</span>
    </button>
  )
}

// Subcomponent: ShareModal
interface ShareModalProps {
  onClose: () => void
}

function ShareModal({ onClose }: ShareModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-900 mb-6">Share your profile</h2>
        
        <div className="mb-6">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span className="flex-1 text-sm text-gray-600 font-mono truncate">crikly.app/ravi-kumar</span>
            <button className="px-4 py-2 bg-[#0077CC] text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors flex items-center gap-2">
              <Copy size={16} />
              Copy
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          <ShareOptionButton icon={MessageCircle} label="WhatsApp" color="bg-green-500" />
          <ShareOptionButton icon={Camera} label="Instagram" color="bg-pink-500" />
          <ShareOptionButton icon={Share} label="Facebook" color="bg-blue-600" />
          <ShareOptionButton icon={Mail} label="Email" color="bg-gray-600" />
          <ShareOptionButton icon={QrCode} label="QR Code" color="bg-gray-800" />
        </div>
      </div>
    </div>
  )
}

// Subcomponent: ShareOptionButton
interface ShareOptionButtonProps {
  icon: React.ElementType
  label: string
  color: string
}

function ShareOptionButton({ icon: Icon, label, color }: ShareOptionButtonProps) {
  return (
    <button className="flex flex-col items-center gap-2">
      <div className={`w-12 h-12 ${color} rounded-full flex items-center justify-center text-white`}>
        <Icon size={20} />
      </div>
      <span className="text-xs text-gray-600 font-medium">{label}</span>
    </button>
  )
}

// Subcomponent: ThisWeekStrip
function ThisWeekStrip() {
  const days = [
    { day: 'Mon', date: 13, hasSessions: false },
    { day: 'Tue', date: 14, hasSessions: true, active: true },
    { day: 'Wed', date: 15, hasSessions: true },
    { day: 'Thu', date: 16, hasSessions: false },
    { day: 'Fri', date: 17, hasSessions: true },
    { day: 'Sat', date: 18, hasSessions: true },
    { day: 'Sun', date: 19, hasSessions: false },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-4">This week</h3>
      <div className="flex justify-between">
        {days.map((d) => (
          <div key={d.day} className="flex flex-col items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">{d.day}</span>
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                d.active ? 'bg-[#0077CC] text-white' : 'text-gray-900'
              }`}
            >
              {d.date}
            </div>
            {d.hasSessions && <div className="w-1.5 h-1.5 bg-[#0077CC] rounded-full" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// Subcomponent: TodayLineup
function TodayLineup() {
  const sessions = [
    {
      time: '14:00',
      duration: '90m',
      title: 'U14 Fast Bowling Masterclass',
      location: "Lord's Indoor Centre",
      active: true,
      type: 'group',
    },
    {
      time: '16:00',
      duration: '60m',
      title: '1-on-1 with James T.',
      location: 'The Oval Nets',
      active: false,
      type: '1-on-1',
    },
    {
      time: '18:00',
      duration: '120m',
      title: "Senior Men's Net Session",
      location: 'Wandsworth CC',
      active: false,
      type: 'group',
    },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Today's lineup</h3>
      <div className="space-y-4">
        {sessions.map((session, idx) => (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-gray-900">{session.time}</span>
              {idx < sessions.length - 1 && (
                <div className="w-px h-full bg-gray-200 mt-2" />
              )}
            </div>
            <div
              className={`flex-1 p-3 rounded-xl border ${
                session.active
                  ? 'bg-blue-50 border-[#0077CC]'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className="text-sm font-bold text-gray-900">{session.title}</span>
                {session.type === '1-on-1' && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                    1:1
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <MapPin size={12} />
                <span>{session.location}</span>
                <span className="mx-1">•</span>
                <span>{session.duration}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Subcomponent: ProfileChecklistItem
interface ProfileChecklistItemProps {
  label: string
  completed: boolean
  optional?: boolean
}

function ProfileChecklistItem({ label, completed, optional }: ProfileChecklistItemProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={`w-5 h-5 rounded-full flex items-center justify-center ${
          completed ? 'bg-green-500' : 'bg-gray-200'
        }`}
      >
        {completed && <Check size={14} className="text-white" strokeWidth={3} />}
      </div>
      <span className={`text-sm ${completed ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
        {label}
        {optional && <span className="text-gray-400 ml-1">(optional)</span>}
      </span>
    </div>
  )
}

// Subcomponent: GroupCard
interface GroupCardProps {
  title: string
  participants: number
  imageUrl: string
}

function GroupCard({ title, participants, imageUrl }: GroupCardProps) {
  return (
    <div className="flex-shrink-0 w-64 bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="h-32 bg-gray-200 relative">
        <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
      </div>
      <div className="p-4">
        <h4 className="text-sm font-bold text-gray-900 mb-1">{title}</h4>
        <p className="text-xs text-gray-500">{participants} participants</p>
      </div>
    </div>
  )
}

// Main Component
export function CoachDashboard() {
  const router = useRouter()
  const [showShareModal, setShowShareModal] = useState(false)
  const [checklistExpanded, setChecklistExpanded] = useState(false)

  const navigate = (path: string) => {
    router.push(path)
  }

  return (
    <div
      className="min-h-screen bg-white text-gray-900 flex w-full"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-gray-100 flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-[#0077CC]">crikly</h1>
        </div>

        <div className="px-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
              RK
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Ravi Kumar</p>
              <p className="text-xs text-gray-500">Cricket Coach</p>
            </div>
          </div>
          <button className="w-full px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 transition-colors flex items-center justify-between">
            <span>Switch to Parent</span>
            <ChevronRight size={14} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-4 space-y-6">
          <div>
            <p className="text-xs font-bold text-gray-400 mb-2 px-4">MAIN</p>
            <div className="space-y-1">
              <SidebarItem icon={Home} label="Home" href="/coach/dashboard" active onClick={() => navigate('/coach/dashboard')} />
              <SidebarItem icon={Calendar} label="Schedule" href="/coach/schedule" onClick={() => navigate('/coach/schedule')} />
              <SidebarItem icon={BookOpen} label="Bookings" href="/coach/bookings" badge={2} onClick={() => navigate('/coach/bookings')} />
              <SidebarItem icon={Users} label="Programmes" href="/coach/programmes" onClick={() => navigate('/coach/programmes')} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 mb-2 px-4">MANAGE</p>
            <div className="space-y-1">
              <SidebarItem icon={Clock} label="Availability" href="/coach/availability" onClick={() => navigate('/coach/availability')} />
              <SidebarItem icon={User} label="My Profile" href="/coach/profile/edit" onClick={() => navigate('/coach/profile/edit')} />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-400 mb-2 px-4">ACCOUNT</p>
            <div className="space-y-1">
              <SidebarItem icon={TrendingUp} label="Earnings" href="/coach/earnings" onClick={() => navigate('/coach/earnings')} />
              <SidebarItem icon={CreditCard} label="Get Paid" href="/coach/get-paid" warningDot onClick={() => navigate('/coach/get-paid')} />
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <SidebarItem icon={Settings} label="Settings" href="/coach/settings" onClick={() => navigate('/coach/settings')} />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar */}
        <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <h1 className="text-xl font-bold text-[#0077CC]">crikly</h1>
          <div className="flex items-center gap-3">
            <button className="relative">
              <Bell size={20} className="text-gray-600" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
              RK
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[800px] mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
            {/* Desktop Greeting */}
            <div className="hidden md:flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-1">Good afternoon, Ravi 👋</h2>
                <p className="text-gray-500">Here's what's happening today</p>
              </div>
              <button
                onClick={() => setShowShareModal(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-sm text-gray-700 transition-colors flex items-center gap-2"
              >
                <Share2 size={16} />
                Share profile
              </button>
            </div>

            {/* Alert: Complete Profile */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <div className="relative w-12 h-12 flex-shrink-0">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle cx="24" cy="24" r="20" stroke="#FEF3C7" strokeWidth="4" fill="none" />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      stroke="#F59E0B"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray="125.6"
                      strokeDashoffset="81.64"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-amber-700">
                    35%
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-amber-900 mb-1">Complete your profile to go live</h3>
                  <p className="text-sm text-amber-800 mb-3">
                    Finish setting up your profile to start accepting bookings
                  </p>
                  <button
                    onClick={() => setChecklistExpanded(!checklistExpanded)}
                    className="text-sm font-bold text-amber-900 flex items-center gap-1 hover:text-amber-700 transition-colors"
                  >
                    {checklistExpanded ? 'Hide' : 'Show'} checklist
                    {checklistExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {checklistExpanded && (
                    <div className="mt-4 space-y-1">
                      <ProfileChecklistItem label="Basic profile" completed />
                      <ProfileChecklistItem label="Sport & pricing" completed={false} />
                      <ProfileChecklistItem label="Qualifications" completed={false} />
                      <ProfileChecklistItem label="Availability" completed={false} />
                      <ProfileChecklistItem label="Booking policy" completed={false} />
                      <ProfileChecklistItem label="Get paid" completed={false} optional />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Alert: Bookings Need Approval */}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-red-900 mb-1">Bookings need approval</h3>
                <p className="text-sm text-red-800 mb-3">Review and approve pending booking requests</p>
                <button
                  onClick={() => navigate('/coach/bookings')}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm transition-colors"
                >
                  Review bookings
                </button>
              </div>
            </div>

            {/* Up Next Hero Card */}
            <div className="relative bg-gray-900 rounded-2xl overflow-hidden h-64">
              <img
                src="https://images.unsplash.com/photo-1624526267942-ab0ff8a3e972?w=800&h=400&fit=crop"
                alt="Cricket session"
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute top-4 left-4">
                <span className="bg-[#0077CC] text-white px-3 py-1 rounded-full text-xs font-bold">
                  Starts in 45m
                </span>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <p className="text-sm font-medium mb-2">Up next</p>
                <h3 className="text-2xl font-bold mb-3">U14 Fast Bowling Masterclass</h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Clock size={16} />
                    14:00 • 90 min
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={16} />
                    Lord's Indoor Centre
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Only: This Week + Today's Lineup */}
            <div className="xl:hidden space-y-4">
              <ThisWeekStrip />
              <TodayLineup />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-sm text-gray-500 mb-2">This month</p>
                <p className="text-3xl font-bold text-gray-900 mb-1">£1,240</p>
                <p className="text-sm text-green-600 font-bold">+12% vs last month</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-sm text-gray-500 mb-2">Rating</p>
                <p className="text-3xl font-bold text-gray-900 mb-1">4.8</p>
                <p className="text-sm text-gray-500">Based on 24 reviews</p>
              </div>
            </div>

            {/* Group Programmes */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Group programmes</h3>
                <button
                  onClick={() => navigate('/coach/programmes')}
                  className="text-sm font-bold text-[#0077CC] hover:text-blue-700 transition-colors"
                >
                  View all
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                <GroupCard
                  title="Summer Youth Camp"
                  participants={18}
                  imageUrl="https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=400&h=200&fit=crop"
                />
                <GroupCard
                  title="Elite Spin Bowling"
                  participants={12}
                  imageUrl="https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=400&h=200&fit=crop"
                />
                <GroupCard
                  title="Weekend Warriors"
                  participants={15}
                  imageUrl="https://images.unsplash.com/photo-1593766787879-e8c78e09cec1?w=400&h=200&fit=crop"
                />
              </div>
            </div>
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="lg:hidden bg-white border-t border-gray-100 fixed bottom-0 left-0 right-0 z-10">
          <div className="flex items-center h-16">
            <NavItem icon={Home} label="Home" active onClick={() => navigate('/coach/dashboard')} />
            <NavItem icon={Calendar} label="Schedule" onClick={() => navigate('/coach/schedule')} />
            <NavItem icon={BookOpen} label="Bookings" badge={2} onClick={() => navigate('/coach/bookings')} />
            <NavItem icon={Users} label="Programmes" onClick={() => navigate('/coach/programmes')} />
            <NavItem icon={MoreHorizontal} label="More" onClick={() => navigate('/coach/more')} />
          </div>
        </nav>
      </div>

      {/* Desktop Right Panel */}
      <aside className="hidden xl:flex w-80 border-l border-gray-100 flex-col p-6 space-y-6">
        <ThisWeekStrip />
        <TodayLineup />
      </aside>

      {/* Share Modal */}
      {showShareModal && <ShareModal onClose={() => setShowShareModal(false)} />}
    </div>
  )
}
