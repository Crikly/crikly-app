'use client'

import React from 'react'
import { X, Calendar, MapPin, PoundSterling, Users, Clock, Info } from 'lucide-react'

export function SchedulePopovers() {
  return (
    <div className="min-h-screen bg-gray-50/50 flex items-center justify-center p-8 overflow-x-auto" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="flex flex-row gap-6 w-max items-start">

        {/* POPOVER 1 — CONFIRMED 1-ON-1 */}
        <div className="w-[280px] bg-white rounded-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.1)] relative border-t-[4px] border-[#0077CC] flex flex-col overflow-hidden">
          <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          <div className="p-4 flex flex-col gap-2">
            <h3 className="text-[18px] font-bold text-gray-900 pr-6 leading-tight">James Okafor</h3>
            <div><span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#E0F6F8] text-[#0099AA] text-[12px] font-bold tracking-wide">Confirmed</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex flex-col gap-3 text-[13px] text-gray-600">
            <div className="flex items-start gap-3"><Calendar size={16} className="shrink-0 mt-0.5" /><span>Mon 7 Apr · 09:00 – 10:00</span></div>
            <div className="flex items-start gap-3"><span className="text-[14px] leading-none shrink-0 mt-0.5 grayscale">🏏</span><span>Cricket · 1-on-1</span></div>
            <div className="flex items-start gap-3"><MapPin size={16} className="shrink-0 mt-0.5" /><span>Oval Cricket Ground</span></div>
            <div className="flex items-start gap-3"><PoundSterling size={16} className="shrink-0 mt-0.5" /><span>£45.00 (you receive)</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex gap-2">
            <button className="flex-1 py-2 px-3 bg-[#0077CC] text-white text-[13px] font-bold rounded-lg hover:bg-[#005FA3] transition-colors text-center">View booking →</button>
            <button className="flex-1 py-2 px-3 border border-[#0077CC] text-[#0077CC] text-[13px] font-bold rounded-lg hover:bg-[#EFF6FF] transition-colors text-center">Message</button>
          </div>
        </div>

        {/* POPOVER 2 — PROGRAMME */}
        <div className="w-[280px] bg-white rounded-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.1)] relative border-t-[4px] border-[#7C3AED] flex flex-col overflow-hidden">
          <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          <div className="p-4 flex flex-col gap-2">
            <h3 className="text-[18px] font-bold text-gray-900 pr-6 leading-tight">Junior Cricket Foundations</h3>
            <div><span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#DCFCE7] text-[#15803D] text-[12px] font-bold tracking-wide">Active</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex flex-col gap-3 text-[13px] text-gray-600">
            <div className="flex items-start gap-3"><Calendar size={16} className="shrink-0 mt-0.5" /><span>Mon 7 Apr · 14:00 – 15:30</span></div>
            <div className="flex items-start gap-3"><span className="text-[14px] leading-none shrink-0 mt-0.5 grayscale">🏏</span><span>Cricket · Group</span></div>
            <div className="flex items-start gap-3">
              <Users size={16} className="shrink-0 mt-0.5" />
              <div className="flex flex-col gap-2 w-full">
                <span>4 / 6 spots filled</span>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#7C3AED] w-[66%]" /></div>
              </div>
            </div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex gap-2">
            <button className="flex-1 py-2 px-3 bg-[#7C3AED] text-white text-[13px] font-bold rounded-lg hover:bg-[#6D28D9] transition-colors text-center">View prog. →</button>
            <button className="flex-1 py-2 px-3 border border-[#7C3AED] text-[#7C3AED] text-[13px] font-bold rounded-lg hover:bg-purple-50 transition-colors text-center">Message</button>
          </div>
        </div>

        {/* POPOVER 3 — PENDING */}
        <div className="w-[280px] bg-white rounded-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.1)] relative border-t-[4px] border-[#F59E0B] flex flex-col overflow-hidden">
          <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          <div className="p-4 flex flex-col gap-2">
            <h3 className="text-[18px] font-bold text-gray-900 pr-6 leading-tight">David Chen</h3>
            <div><span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#D97706] text-[12px] font-bold tracking-wide">Awaiting approval</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex flex-col gap-3 text-[13px] text-gray-600">
            <div className="flex items-start gap-3"><Calendar size={16} className="shrink-0 mt-0.5" /><span>Wed 8 Apr · 13:00 – 14:00</span></div>
            <div className="flex items-start gap-3"><span className="text-[14px] leading-none shrink-0 mt-0.5 grayscale">🏏</span><span>Cricket · 1-on-1</span></div>
            <div className="flex items-start gap-3"><Clock size={16} className="shrink-0 mt-0.5 text-[#DC2626]" /><span className="text-[#DC2626]">Respond within 24 hours</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex gap-2">
            <button className="flex-1 py-2 px-3 bg-[#15803D] text-white text-[13px] font-bold rounded-lg hover:bg-[#166534] transition-colors flex items-center justify-center gap-1.5">✓ Approve</button>
            <button className="flex-1 py-2 px-3 border border-[#DC2626] text-[#DC2626] text-[13px] font-bold rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">✗ Decline</button>
          </div>
        </div>

        {/* POPOVER 4 — BLOCKED */}
        <div className="w-[280px] bg-white rounded-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.1)] relative border-t-[4px] border-[#9CA3AF] flex flex-col overflow-hidden">
          <button className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          <div className="p-4 flex flex-col gap-2">
            <h3 className="text-[18px] font-bold text-gray-900 pr-6 leading-tight">Blocked — Family Holiday</h3>
            <div><span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#6B7280] text-[12px] font-bold tracking-wide">Blocked</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex flex-col gap-3 text-[13px] text-gray-600">
            <div className="flex items-start gap-3"><Calendar size={16} className="shrink-0 mt-0.5" /><span>Sat 11 Apr · 08:00 – 13:00</span></div>
            <div className="flex items-start gap-3"><Info size={16} className="shrink-0 mt-0.5" /><span className="leading-snug">You are unavailable during this time</span></div>
          </div>
          <div className="w-full h-px bg-gray-100" />
          <div className="p-4 flex gap-2">
            <button className="flex-1 py-2 px-3 border border-[#0077CC] text-[#0077CC] text-[13px] font-bold rounded-lg hover:bg-[#EFF6FF] transition-colors text-center">Edit block</button>
            <button className="flex-1 py-2 px-3 border border-[#DC2626] text-[#DC2626] text-[13px] font-bold rounded-lg hover:bg-red-50 transition-colors text-center">Remove</button>
          </div>
        </div>

      </div>
    </div>
  )
}
