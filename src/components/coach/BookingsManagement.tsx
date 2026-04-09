'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, MapPin, User, Medal, Check, X, AlertCircle } from 'lucide-react'

type Tab = 'Upcoming' | 'Pending approval' | 'Past'
interface Booking { id: string; date: string; time: string; status: string; statusBg: string; statusText: string; sport: string; duration: string; type: string; client: string; location: string; price: string }

export function BookingsManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Upcoming')
  const upcomingBookings: Booking[] = [
    { id: '1', date: 'Thu 10 Apr', time: '14:00', status: 'Confirmed', statusBg: '#E0F6F8', statusText: '#0099AA', sport: 'Cricket', duration: '60 min', type: '1-on-1', client: 'James Okafor', location: 'Oval Cricket Ground', price: '50' },
    { id: '2', date: 'Sat 12 Apr', time: '10:00', status: 'Group', statusBg: '#E6F3FB', statusText: '#0077CC', sport: 'Cricket', duration: '90 min', type: 'Group session (4/6)', client: 'Sarah Jenkins (Lead)', location: 'Wandsworth Common', price: '120' },
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

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col">
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 mb-6 tracking-tight">Bookings</h1>
          <div className="flex items-center gap-6 border-b border-gray-100">
            {(['Upcoming', 'Pending approval', 'Past'] as Tab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-[15px] font-bold transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-[#0077CC]' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0077CC]" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 px-5 py-5 pb-12 bg-gray-50/30">
          {activeTab === 'Pending approval' && (
            <div className="mb-5 p-3.5 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
              <AlertCircle size={18} className="text-[#B45309] mt-0.5 shrink-0" />
              <p className="text-[14px] text-[#B45309] font-medium leading-snug">Respond within 24 hours or bookings will be auto-approved</p>
            </div>
          )}
          <div className="flex flex-col gap-3.5">
            {currentBookings.map((booking) => (
              <div key={booking.id} onClick={() => router.push(`/coach/bookings/${booking.id}`)} className={`relative bg-white border border-[#E2E8F0] rounded-[16px] p-4 shadow-sm cursor-pointer hover:border-[#0077CC]/30 transition-colors ${activeTab === 'Past' ? 'opacity-80' : ''}`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="text-[15px] font-bold text-gray-900">{booking.date} <span className="text-gray-500 font-medium ml-1.5">{booking.time}</span></div>
                  <div className="px-2.5 py-1 rounded-full text-[12px] font-bold" style={{ backgroundColor: booking.statusBg, color: booking.statusText }}>{booking.status}</div>
                </div>
                <div className="flex items-center gap-2 text-[14px] text-gray-600 mb-4 font-medium">
                  <Medal size={15} className="text-gray-400" />
                  <span>{booking.sport} · {booking.duration} · {booking.type}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[14px] text-gray-600"><User size={15} className="text-gray-400" /><span className="font-bold text-gray-900">{booking.client}</span></div>
                    <div className="flex items-center gap-2 text-[14px] text-gray-600"><MapPin size={15} className="text-gray-400" /><span className="truncate max-w-[180px] font-medium">{booking.location}</span></div>
                  </div>
                  <div className="flex items-center gap-1"><span className="text-[16px] font-bold text-gray-900 mr-2">£{booking.price}</span><ChevronRight size={20} className="text-gray-400" /></div>
                </div>
                {activeTab === 'Pending approval' && (
                  <div className="mt-5 pt-4 border-t border-gray-100 flex gap-3">
                    <button className="flex-1 py-2.5 flex items-center justify-center gap-2 border border-green-600 text-green-700 rounded-xl text-[14px] font-bold hover:bg-green-50 transition-colors bg-white"><Check size={18} /> Approve</button>
                    <button className="flex-1 py-2.5 flex items-center justify-center gap-2 border border-red-600 text-red-700 rounded-xl text-[14px] font-bold hover:bg-red-50 transition-colors bg-white"><X size={18} /> Decline</button>
                  </div>
                )}
              </div>
            ))}
            {currentBookings.length === 0 && <div className="text-center py-10"><p className="text-[15px] text-gray-500 font-medium">No {activeTab.toLowerCase()} bookings</p></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
