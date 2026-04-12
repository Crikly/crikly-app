'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, MapPin, User, Medal, Check, X, AlertCircle, MessageCircle } from 'lucide-react'

type Tab = 'Upcoming' | 'Pending approval' | 'Past'
interface Booking { 
  id: string
  date: string
  time: string
  status: string
  statusBg: string
  statusText: string
  sport: string
  duration: string
  type: string
  client: string
  location: string
  price: string
  participants?: { name: string }[]
  spotsFilled?: number
  spotsTotal?: number
}

export function BookingsManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Upcoming')
  
  const upcomingBookings: Booking[] = [
    { id: '1', date: 'Thu 10 Apr', time: '14:00', status: 'Confirmed', statusBg: '#E0F6F8', statusText: '#0099AA', sport: 'Cricket', duration: '60 min', type: '1-on-1', client: 'James Okafor', location: 'Oval Cricket Ground', price: '50' },
    { 
      id: '2', 
      date: 'Sat 12 Apr', 
      time: '10:00', 
      status: 'Group', 
      statusBg: '#E6F3FB', 
      statusText: '#0077CC', 
      sport: 'Cricket', 
      duration: '90 min', 
      type: 'Group session', 
      client: 'Sarah Jenkins (Lead)', 
      location: 'Wandsworth Common', 
      price: '120',
      participants: [
        { name: 'Sarah Jenkins' },
        { name: 'Tom Baker' },
        { name: 'Emma Wilson' },
        { name: 'James Okafor' }
      ],
      spotsFilled: 4,
      spotsTotal: 6
    },
    { id: '3', date: 'Today', time: '16:30', status: 'Starting soon', statusBg: '#FEF3C7', statusText: '#B45309', sport: 'Cricket', duration: '60 min', type: '1-on-1', client: 'Marcus Trent', location: 'Indoor Nets, Battersea', price: '55' }
  ]
  
  const pendingBookings: Booking[] = [
    { id: '4', date: 'Mon 14 Apr', time: '18:00', status: 'Awaiting approval', statusBg: '#FEF3C7', statusText: '#B45309', sport: 'Cricket', duration: '60 min', type: '1-on-1', client: 'David Chen', location: 'Oval Cricket Ground', price: '50' },
    { id: '5', date: 'Wed 16 Apr', time: '17:00', status: 'Awaiting approval', statusBg: '#FEF3C7', statusText: '#B45309', sport: 'Cricket', duration: '120 min', type: '1-on-1', client: "Liam O'Connor", location: 'Tooting Bec', price: '90' }
  ]
  
  const pastBookings: Booking[] = [
    { id: '6', date: 'Tue 1 Apr', time: '15:00', status: 'Completed', statusBg: '#DCFCE7', statusText: '#15803D', sport: 'Cricket', duration: '60 min', type: '1-on-1', client: 'James Okafor', location: 'Oval Cricket Ground', price: '50' },
    { id: '7', date: 'Sun 30 Mar', time: '09:00', status: 'Completed', statusBg: '#DCFCE7', statusText: '#15803D', sport: 'Cricket', duration: '90 min', type: 'Group', client: 'Sarah Jenkins (Lead)', location: 'Wandsworth Common', price: '120' },
    { id: '8', date: 'Thu 27 Mar', time: '18:00', status: 'Cancelled', statusBg: '#FEE2E2', statusText: '#B91C1C', sport: 'Cricket', duration: '60 min', type: '1-on-1', client: 'Tom Baker', location: 'Oval Cricket Ground', price: '50' }
  ]
  
  const currentBookings = activeTab === 'Upcoming' ? upcomingBookings : activeTab === 'Pending approval' ? pendingBookings : pastBookings
  const upcomingCount = upcomingBookings.length
  const pendingCount = pendingBookings.length

  // CF-D03 CHANGE 4: Get left border color based on status
  const getLeftBorderColor = (status: string, type: string) => {
    if (status === 'Starting soon') return '#F59E0B' // amber-400
    if (status === 'Awaiting approval') return '#F59E0B' // amber-400
    if (type.includes('Group')) return '#7C3AED' // purple-600
    if (status === 'Confirmed') return '#3B82F6' // blue-500
    return '#3B82F6' // default blue
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col">
        {/* CF-D03 CHANGE 1: Page header with state-aware subtitle */}
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Bookings</h1>
          <p className="text-[13px] text-gray-500 mt-1 mb-4">
            {upcomingCount} upcoming{pendingCount > 0 ? ` · ${pendingCount} need action` : ''}
          </p>
          
          {/* CF-D03 CHANGE 2: Tabs with stronger active state + count badge */}
          <div className="flex items-center gap-6 border-b-[1.5px] border-gray-100">
            {(['Upcoming', 'Pending approval', 'Past'] as Tab[]).map((tab) => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={`pb-3 text-[15px] transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab 
                    ? 'text-[#0077CC] font-medium' 
                    : 'text-gray-500 font-normal hover:text-gray-700'
                }`}
              >
                {tab}
                {/* CF-D03 CHANGE 2: Count badge on Pending approval tab */}
                {tab === 'Pending approval' && pendingCount > 0 && (
                  <span className="w-[18px] h-[18px] rounded-full bg-[#E24B4A] text-white text-[9px] font-medium flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0077CC]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 px-5 py-5 pb-12 bg-gray-50/30">
          {/* CF-D03 CHANGE 3: Urgent banner for pending approvals (Upcoming tab only) */}
          {activeTab === 'Upcoming' && pendingCount > 0 && (
            <div className="mb-5 p-3 bg-[#FFFBEB] border-l-4 border-l-[#F59E0B] rounded-r-[10px] flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="w-[18px] h-[18px] rounded-full bg-[#F59E0B] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-white text-[11px] font-bold">!</span>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#78350F]">{pendingCount} booking{pendingCount > 1 ? 's' : ''} need{pendingCount === 1 ? 's' : ''} your approval</p>
                  <p className="text-[11px] text-[#92400E] mt-0.5">Parents are waiting — respond within 24 hours</p>
                </div>
              </div>
              <button 
                onClick={() => setActiveTab('Pending approval')}
                className="text-[12px] font-medium text-[#0077CC] hover:underline whitespace-nowrap"
              >
                Review now →
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3.5">
            {currentBookings.map((booking) => {
              const isGroup = booking.type.includes('Group')
              const isStartingSoon = booking.status === 'Starting soon'
              const leftBorderColor = getLeftBorderColor(booking.status, booking.type)
              
              return (
                <div 
                  key={booking.id} 
                  className={`relative bg-white rounded-[16px] shadow-sm cursor-pointer hover:border-[#0077CC]/30 transition-colors overflow-hidden ${
                    activeTab === 'Past' ? 'opacity-80' : ''
                  } ${isStartingSoon ? 'border-[1.5px] border-[#FCD34D]' : 'border border-[#E2E8F0]'}`}
                  style={{ borderLeft: `3px solid ${leftBorderColor}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                >
                  <div className="p-4" onClick={() => router.push(`/coach/bookings/${booking.id}`)}>
                    {/* CF-D03 CHANGE 4: Card content hierarchy */}
                    {/* 1. Date/time + status badge */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-[15px] font-bold text-gray-900">
                        {booking.date} <span className="text-gray-500 font-medium ml-1.5">{booking.time}</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-full text-[12px] font-bold flex items-center gap-1.5" style={{ backgroundColor: booking.statusBg, color: booking.statusText }}>
                        {isStartingSoon && (
                          <span className="w-[6px] h-[6px] rounded-full bg-[#F59E0B] pulse-dot" />
                        )}
                        {booking.status}
                      </div>
                    </div>

                    {/* 2. Session meta */}
                    <div className="text-[13px] text-gray-500 mb-2">
                      {booking.sport} · {booking.duration} · {booking.type}
                    </div>

                    {/* 3. Player/parent name */}
                    <div className="text-[13px] font-medium text-gray-900 mb-2">
                      {booking.client}
                    </div>

                    {/* CF-D03 CHANGE 6: Group booking presentation */}
                    {isGroup && booking.participants && (
                      <div className="mb-3">
                        {/* Participant avatar stack */}
                        <div className="flex items-center mb-2">
                          {booking.participants.slice(0, 3).map((participant, idx) => {
                            const initials = participant.name.split(' ').map(n => n[0]).join('')
                            return (
                              <div 
                                key={idx}
                                className="w-[18px] h-[18px] rounded-full bg-purple-100 text-purple-700 text-[8px] font-medium flex items-center justify-center border border-white"
                                style={{ marginLeft: idx > 0 ? '-5px' : '0' }}
                              >
                                {initials}
                              </div>
                            )
                          })}
                          {booking.participants.length > 3 && (
                            <div 
                              className="w-[18px] h-[18px] rounded-full bg-gray-100 text-gray-700 text-[8px] font-medium flex items-center justify-center border border-white"
                              style={{ marginLeft: '-5px' }}
                            >
                              +{booking.participants.length - 3}
                            </div>
                          )}
                        </div>
                        
                        {/* Spots progress bar */}
                        {booking.spotsFilled !== undefined && booking.spotsTotal !== undefined && (
                          <div>
                            <div className="w-full h-[4px] bg-gray-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-purple-500 rounded-full"
                                style={{ width: `${(booking.spotsFilled / booking.spotsTotal) * 100}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-purple-700 font-medium mt-1">
                              {booking.spotsFilled}/{booking.spotsTotal} spots filled
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. Location */}
                    <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-3">
                      <MapPin size={14} className="text-gray-400" />
                      <span className="truncate">{booking.location}</span>
                    </div>

                    {/* 5. Price + chevron */}
                    <div className="flex items-center justify-between pt-3 border-t-[0.5px] border-gray-100">
                      <span className="text-[16px] font-bold text-gray-900">£{booking.price}</span>
                      <ChevronRight size={20} className="text-gray-400" />
                    </div>
                  </div>

                  {/* CF-D03 CHANGE 5: Quick action row (Upcoming tab only) */}
                  {activeTab === 'Upcoming' && (
                    <div className="border-t-[0.5px] border-gray-100 px-4 py-2 flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D03: wire Message action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 transition-colors"
                      >
                        Message
                      </button>
                      {isGroup ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            // TODO CF-D03: wire Message group action
                          }}
                          className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 transition-colors"
                        >
                          Message group
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            // TODO CF-D03: wire Mark complete action
                          }}
                          className={`flex-1 rounded-md text-[11px] py-1.5 text-center transition-colors ${
                            isStartingSoon 
                              ? 'bg-[#0077CC] text-white hover:bg-[#0066AA]' 
                              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Mark complete
                        </button>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D03: wire View details to booking detail route
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 transition-colors"
                      >
                        View details
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {currentBookings.length === 0 && (
              <div className="text-center py-10">
                <p className="text-[15px] text-gray-500 font-medium">No {activeTab.toLowerCase()} bookings</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CF-D03 CHANGE 4: Pulse animation for starting soon badge */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .pulse-dot {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
