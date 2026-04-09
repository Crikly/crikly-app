'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MapPin, User, Clock, Phone, Mail, MessageSquare, CalendarDays, Activity } from 'lucide-react'

export function BookingDetail() {
  const router = useRouter()
  const [status, setStatus] = useState<'Confirmed' | 'Pending'>('Confirmed')

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md bg-gray-50 min-h-screen relative flex flex-col pb-12">
        <div className="px-5 py-4 bg-white sticky top-0 z-10 border-b border-gray-100 flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-gray-900 hover:bg-gray-50 rounded-full transition-colors"><ArrowLeft size={24} /></button>
          <h1 className="text-[17px] font-bold text-gray-900 absolute left-1/2 -translate-x-1/2">Booking Detail</h1>
          {status === 'Confirmed'
            ? <div className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-[#E0F6F8] text-[#0099AA] cursor-pointer" onClick={() => setStatus('Pending')}>Confirmed</div>
            : <div className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-[#FEF3C7] text-[#B45309] cursor-pointer" onClick={() => setStatus('Confirmed')}>Awaiting approval</div>
          }
        </div>
        <div className="flex-1 px-5 py-6 space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm space-y-4">
            <div className="flex items-start gap-3"><CalendarDays size={18} className="text-gray-400 mt-0.5 shrink-0" /><div><div className="text-[15px] font-bold text-gray-900">Thu 10 Apr</div><div className="text-[14px] text-gray-500 font-medium mt-0.5">14:00 – 15:00</div></div></div>
            <div className="flex items-center gap-3"><Activity size={18} className="text-gray-400 shrink-0" /><span className="text-[15px] text-gray-900 font-medium">Cricket</span></div>
            <div className="flex items-center gap-3"><User size={18} className="text-gray-400 shrink-0" /><span className="text-[15px] text-gray-900 font-medium">1-on-1</span></div>
            <div className="flex items-center gap-3"><Clock size={18} className="text-gray-400 shrink-0" /><span className="text-[15px] text-gray-900 font-medium">60 min</span></div>
            <div className="flex items-start gap-3"><MapPin size={18} className="text-gray-400 mt-0.5 shrink-0" /><span className="text-[15px] text-gray-900 font-medium leading-snug">Oval Cricket Ground</span></div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-0 shadow-sm overflow-hidden">
            <div className="p-5 flex items-center gap-4 border-b border-gray-100">
              <div className="w-12 h-12 rounded-full bg-[#E6F3FB] text-[#0077CC] flex items-center justify-center text-[16px] font-bold shrink-0">JO</div>
              <div><div className="text-[16px] font-bold text-gray-900">James Okafor</div><div className="text-[13px] text-gray-500 font-medium mt-1 leading-snug">Parent · Booking for: Ethan Okafor (age 10)</div></div>
            </div>
            <button className="w-full p-4 px-5 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100 text-left"><Phone size={18} className="text-[#0077CC] shrink-0" /><span className="text-[15px] font-medium text-gray-900">07700 900123</span></button>
            <button className="w-full p-4 px-5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"><Mail size={18} className="text-[#0077CC] shrink-0" /><span className="text-[15px] font-medium text-gray-900">james@email.com</span></button>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between"><span className="text-[15px] text-gray-600 font-medium">Session price</span><span className="text-[15px] text-gray-900 font-medium">£50.00</span></div>
            <div className="flex items-center justify-between"><span className="text-[15px] text-gray-500 font-medium">Platform fee</span><span className="text-[15px] text-gray-500 font-medium">– £5.00</span></div>
            <div className="h-px bg-gray-100 w-full" />
            <div className="flex items-center justify-between"><span className="text-[16px] font-bold text-gray-900">You receive</span><span className="text-[18px] font-bold text-[#0077CC]">£45.00</span></div>
            <div className="pt-1"><p className="text-[12px] text-gray-400 italic">Payment released 48 hours after session</p></div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm space-y-3">
            <div className="text-[14px] text-gray-700 font-medium">Cancellation policy: <span className="text-gray-900">24 hours notice required</span></div>
            <div className="text-[14px] text-gray-500 font-medium">Booked on: Mon 7 Apr at 09:14</div>
          </div>
          <div className="pt-4 pb-6 space-y-3">
            {status === 'Confirmed' ? (
              <>
                <button className="w-full py-3.5 flex items-center justify-center gap-2 border-2 border-[#0077CC] text-[#0077CC] rounded-xl text-[15px] font-bold hover:bg-[#E6F3FB] transition-colors bg-white"><MessageSquare size={18} /> Message James</button>
                <button className="w-full py-3.5 flex items-center justify-center gap-2 border border-red-200 text-red-600 rounded-xl text-[15px] font-bold hover:bg-red-50 transition-colors bg-white">Cancel Booking</button>
              </>
            ) : (
              <>
                <button className="w-full py-3.5 flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl text-[15px] font-bold hover:bg-green-700 transition-colors">Approve</button>
                <button className="w-full py-3.5 flex items-center justify-center gap-2 border border-red-200 text-red-600 rounded-xl text-[15px] font-bold hover:bg-red-50 transition-colors bg-white">Decline</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
