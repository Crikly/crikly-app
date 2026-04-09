'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, MapPin, Calendar, Clock, ArrowRight, Plus, Eye, Bell } from 'lucide-react'
import { CoachSidebar } from '@/components/coach/CoachSidebar'
import { CoachBottomNav } from '@/components/coach/CoachBottomNav'
import { Avatar } from '@/components/ui/Avatar'

export function CoachDashboard() {
  const router = useRouter()

  // Mock data - will be replaced with real API calls later
  const coachData = {
    name: 'Ravi Kumar',
    role: 'Cricket Coach',
    photoUrl: undefined,
    hasIncompleteProfile: true,
    pendingBookingsCount: 2,
    hasStripeWarning: true,
  }

  const upcomingSession = {
    date: 'Today',
    time: '2:00 PM',
    sport: 'Cricket',
    clientName: 'James Wilson',
    clientInitials: 'JW',
    location: 'Lords Cricket Ground',
    price: '£50',
    duration: '60 min',
  }

  const monthStats = {
    sessions: 12,
    earnings: '£840',
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const handleRoleSwitch = () => {
    router.push('/parent/dashboard')
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <CoachSidebar
          activePath="/coach/dashboard"
          coachName={coachData.name}
          coachRole={coachData.role}
          coachPhotoUrl={coachData.photoUrl}
          pendingBookingsCount={coachData.pendingBookingsCount}
          hasStripeWarning={coachData.hasStripeWarning}
          onRoleSwitch={handleRoleSwitch}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Top Bar */}
        <div className="lg:hidden bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-brand-600">Crikly</span>
          <div className="flex items-center gap-4">
            <button className="relative">
              <Bell size={20} className="text-neutral-600" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-danger rounded-full" />
            </button>
            <Avatar src={coachData.photoUrl} name={coachData.name} size="sm" />
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-8">
          <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Greeting */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                {getGreeting()}, {coachData.name.split(' ')[0]} 👋
              </h1>
              <p className="text-base text-neutral-500 font-medium">Here's what's happening today</p>
            </div>

            {/* Alert Card - Incomplete Profile */}
            {coachData.hasIncompleteProfile && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
                <AlertCircle size={24} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-amber-900 mb-1">Complete your profile</h3>
                  <p className="text-sm text-amber-800 font-medium mb-3">
                    Finish setting up your profile to start accepting bookings
                  </p>
                  <button
                    onClick={() => router.push('/coach/onboarding/profile')}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-sm transition-colors"
                  >
                    Complete profile
                  </button>
                </div>
              </div>
            )}

            {/* Upcoming Session Card */}
            <div className="mb-6 bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-neutral-900">Next session</h2>
                <span className="text-sm font-bold text-brand-600">{upcomingSession.date}</span>
              </div>
              <div className="flex items-start gap-4">
                <Avatar
                  src={undefined}
                  name={upcomingSession.clientName}
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-neutral-900 mb-1">{upcomingSession.clientName}</h3>
                  <div className="flex flex-col gap-2 text-sm text-neutral-600">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-neutral-400" />
                      <span className="font-medium">{upcomingSession.time} • {upcomingSession.duration}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-neutral-400" />
                      <span className="font-medium">{upcomingSession.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-neutral-400" />
                      <span className="font-medium">{upcomingSession.sport}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-lg font-bold text-neutral-900">{upcomingSession.price}</span>
                    <button
                      onClick={() => router.push('/coach/bookings')}
                      className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                    >
                      View details <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Row */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
                <p className="text-sm font-medium text-neutral-500 mb-2">This month</p>
                <p className="text-3xl font-bold text-neutral-900 mb-1">{monthStats.sessions}</p>
                <p className="text-sm font-medium text-neutral-600">Sessions completed</p>
              </div>
              <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
                <p className="text-sm font-medium text-neutral-500 mb-2">This month</p>
                <p className="text-3xl font-bold text-neutral-900 mb-1">{monthStats.earnings}</p>
                <p className="text-sm font-medium text-neutral-600">Total earnings</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white border border-neutral-100 rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-neutral-900 mb-4">Quick actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => router.push('/coach/availability')}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-brand-50 hover:bg-brand-100 text-brand-600 rounded-xl font-bold text-sm transition-colors"
                >
                  <Plus size={18} />
                  Add availability
                </button>
                <button
                  onClick={() => router.push('/coach/bookings')}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 rounded-xl font-bold text-sm transition-colors"
                >
                  <Eye size={18} />
                  View bookings
                </button>
              </div>
            </div>
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <div className="lg:hidden">
          <CoachBottomNav
            activePath="/coach/dashboard"
            pendingBookingsCount={coachData.pendingBookingsCount}
          />
        </div>
      </div>
    </div>
  )
}
