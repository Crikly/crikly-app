'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Check, User, RefreshCw, Users, Ban } from 'lucide-react'

interface EventBlockProps {
  top: number
  height: number
  type: 'confirmed' | 'programme' | 'pending' | 'blocked' | 'available'
  title: string
  subtitle?: string
}

function EventBlock({ top, height, type, title, subtitle }: EventBlockProps) {
  const router = useRouter()
  let bgClass = ''
  let textClass = 'text-white'
  let borderClass = ''
  let leftBorderClass = ''
  let extraStyles: React.CSSProperties = {}

  // CHANGE 3: Left border accent by status
  switch (type) {
    case 'confirmed':
      bgClass = 'bg-blue-100'
      textClass = 'text-blue-900'
      leftBorderClass = 'border-l-[3px] border-l-blue-500'
      break
    case 'programme':
      bgClass = 'bg-purple-100'
      textClass = 'text-purple-900'
      leftBorderClass = 'border-l-[3px] border-l-purple-600'
      break
    case 'pending':
      bgClass = 'bg-amber-100'
      textClass = 'text-amber-900'
      leftBorderClass = 'border-l-[3px] border-l-amber-400'
      break
    case 'blocked':
      // CHANGE 5: Lighter blocked state
      bgClass = ''
      textClass = 'text-gray-400'
      extraStyles = { backgroundImage: 'repeating-linear-gradient(45deg, #F4F3F0, #F4F3F0 4px, #ECEAE6 4px, #ECEAE6 8px)' }
      break
    case 'available':
      // CHANGE 4: Opportunity treatment for available slots
      bgClass = 'bg-[#E8F5F0]'
      textClass = 'text-[#0F6E56]'
      borderClass = 'border border-dashed border-[#1D9E75] hover:border-solid hover:bg-[#F0FAF6] cursor-pointer'
      break
  }

  // CHANGE 4: Available slot click handler
  const handleAvailableClick = () => {
    if (type === 'available') {
      // TODO CF-D02: wire Add session slot to availability or session creation flow
      router.push('/coach/availability')
    }
  }

  return (
    <div
      className={`session-card absolute left-1 right-1 rounded-lg p-2 overflow-visible flex flex-col justify-start group ${bgClass} ${textClass} ${borderClass} ${leftBorderClass}`}
      style={{ top: `${top}px`, height: `${height}px`, ...extraStyles }}
      onClick={handleAvailableClick}
    >
      {/* CHANGE 3: Hover quick actions */}
      {type !== 'available' && type !== 'blocked' && (
        <div className="quick-actions absolute top-1 right-1 flex gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
          <button onClick={() => {/* TODO CF-D02: wire View quick action */}} className="text-[8px] px-1 py-0.5 rounded-sm bg-white/75" style={{ color: 'inherit' }}>View</button>
          <button onClick={() => {/* TODO CF-D02: wire Message quick action */}} className="text-[8px] px-1 py-0.5 rounded-sm bg-white/75" style={{ color: 'inherit' }}>Msg</button>
        </div>
      )}
      {/* CHANGE 3: Typography refinement */}
      <div className="text-[10px] font-medium leading-tight truncate">{type === 'available' ? '+ Add session' : title}</div>
      {subtitle && type !== 'available' && <div className="text-[9px] leading-tight truncate mt-0.5" style={{ opacity: 0.75 }}>{subtitle}</div>}
      {type === 'blocked' && <div className="text-[9px] text-center mt-1">{title}</div>}
    </div>
  )
}

export function Schedule() {
  const router = useRouter()
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = 128
    }
  }, [])

  const hours = Array.from({ length: 17 }, (_, i) => i + 6)

  const days = [
    { name: 'Mon', date: '6' },
    { name: 'Tue', date: '7' },
    { name: 'Wed', date: '8', isToday: true },
    { name: 'Thu', date: '9' },
    { name: 'Fri', date: '10' },
    { name: 'Sat', date: '11' },
    { name: 'Sun', date: '12' },
  ]

  return (
    <div className="min-h-screen bg-white flex justify-center font-sans p-6" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-7xl relative flex flex-col lg:flex-row gap-8">

        {/* LEFT COLUMN */}
        <div className="flex-1 lg:w-[65%] flex flex-col">
          {/* CHANGE 1: Unified header control row */}
          <div className="bg-white border-b border-gray-100 pb-3 mb-4">
            {/* ROW 1 */}
            <div className="flex items-start justify-between mb-2 px-5 pt-4">
              <div>
                <h1 className="text-[20px] font-medium text-gray-900">Schedule</h1>
                <p className="text-[14px] text-gray-500 mt-0.5">8 – 14 April 2026 · <span className="text-[#0077CC] font-medium">6 sessions this week</span></p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-white border border-gray-200 rounded-full p-1">
                  <button className="px-3 py-1 rounded-full text-[12px] font-medium text-gray-600 hover:bg-gray-50">Day</button>
                  <button className="px-3 py-1 rounded-full text-[12px] font-medium bg-[#0077CC] text-white">Week</button>
                  <button className="px-3 py-1 rounded-full text-[12px] font-medium text-gray-600 hover:bg-gray-50">Month</button>
                </div>
                <button className="px-3 py-1 border border-gray-200 rounded-md text-[12px] font-medium text-gray-700 hover:bg-gray-50 h-[30px]">Today</button>
                <div className="flex border border-gray-200 rounded-md">
                  <button className="w-7 h-7 flex items-center justify-center border-r border-gray-200 hover:bg-gray-50 text-gray-600"><ChevronLeft size={16} /></button>
                  <button className="w-7 h-7 flex items-center justify-center hover:bg-gray-50 text-gray-600"><ChevronRight size={16} /></button>
                </div>
              </div>
            </div>
            {/* ROW 2 */}
            <div className="flex items-center justify-between px-5 pt-2">
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-medium hover:bg-blue-100 transition-colors">
                  🏏 Cricket <Check size={12} strokeWidth={3} />
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-[11px] font-medium hover:bg-green-100 transition-colors">
                  ⚽ Football <Check size={12} strokeWidth={3} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-blue-500" /><span className="text-[10px] text-gray-500">Confirmed</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-purple-600" /><span className="text-[10px] text-gray-500">Programme</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-amber-400" /><span className="text-[10px] text-gray-500">Pending</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-gray-300" /><span className="text-[10px] text-gray-500">Blocked</span></div>
              </div>
            </div>
          </div>

          {/* Week Grid */}
          <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col bg-white shadow-sm relative h-[700px] shrink-0">
            {/* CHANGE 2: Today column treatment */}
            <div className="flex border-b border-gray-200 bg-gray-50/50 relative z-20">
              <div className="w-16 shrink-0 border-r border-gray-200" />
              {days.map((day, idx) => (
                <div key={idx} className={`flex-1 py-3 text-center border-r last:border-r-0 border-gray-200 ${day.isToday ? 'bg-[#EFF7FF]' : ''}`}>
                  <div className={`text-[11px] font-bold uppercase tracking-wider ${day.isToday ? 'text-[#0077CC]' : 'text-gray-500'}`}>{day.name}</div>
                  {day.isToday ? (
                    <div className="flex justify-center mt-1">
                      <div className="w-7 h-7 rounded-full bg-[#0077CC] text-white flex items-center justify-center text-[14px] font-medium">{day.date}</div>
                    </div>
                  ) : (
                    <div className="text-[20px] font-light leading-tight mt-1 text-gray-900">{day.date}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto relative scroll-smooth" ref={gridRef}>
              <div className="relative w-full" style={{ height: `${hours.length * 64}px` }}>
                <div className="absolute inset-0 flex flex-col pointer-events-none z-0">
                  {hours.map((hour) => (
                    <div key={hour} className="h-[64px] border-b border-gray-100 flex w-full">
                      <div className="w-16 shrink-0 border-r border-gray-200 flex items-start justify-end pr-2 pt-1 relative">
                        <span className="text-[12px] text-gray-400 font-medium bg-white">{hour.toString().padStart(2, '0')}:00</span>
                      </div>
                      {days.map((day, idx) => (
                        <div key={idx} className={`flex-1 border-r last:border-r-0 border-gray-100 ${day.isToday ? 'bg-[#EFF7FF]' : ''}`} />
                      ))}
                    </div>
                  ))}
                </div>

                <div className="absolute inset-0 flex pointer-events-auto z-10">
                  <div className="w-16 shrink-0" />
                  {/* Mon */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(9 - 6) * 64} height={1 * 64} type="confirmed" title="James Okafor" subtitle="🏏 Cricket · 1-on-1" />
                    <EventBlock top={(14 - 6) * 64} height={1.5 * 64} type="programme" title="Junior Cricket Foundations" subtitle="🏏 4/6 spots" />
                  </div>
                  {/* Tue */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(10 - 6) * 64} height={1.5 * 64} type="available" title="Available" />
                  </div>
                  {/* Wed Today */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(10 - 6) * 64} height={1 * 64} type="confirmed" title="Marcus Trent" subtitle="⚽ Football · 1-on-1" />
                    <EventBlock top={(13 - 6) * 64} height={1 * 64} type="pending" title="David Chen" subtitle="🏏 Awaiting approval" />
                  </div>
                  {/* Thu */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(9 - 6) * 64} height={1.5 * 64} type="programme" title="Advanced Batting Masterclass" subtitle="🏏 6/6 FULL" />
                  </div>
                  {/* Fri */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(15 - 6) * 64} height={2 * 64} type="available" title="Available" />
                  </div>
                  {/* Sat */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(8 - 6) * 64} height={5 * 64} type="blocked" title="Blocked — Family Holiday" />
                  </div>
                  {/* Sun */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(10 - 6) * 64} height={1.5 * 64} type="programme" title="Open Net Session" subtitle="⚽ 2/8 spots" />
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-20 rounded-b-xl" />
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6 pt-[68px]">
          
          {/* Mini Month */}
          <div className="bg-white border border-gray-200 rounded-[16px] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-gray-900">April 2026</h3>
              <div className="flex gap-1">
                <button className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50"><ChevronLeft size={16} /></button>
                <button className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-50"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-2 text-center text-[12px] font-medium mb-2">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d} className="text-gray-400">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-[13px] relative z-0">
              <div className="absolute left-0 right-0 top-[28px] h-[28px] bg-[#EFF6FF] rounded-md -z-10" />
              {/* Row 1 */}
              <div className="py-1 text-gray-300">30</div><div className="py-1 text-gray-300">31</div>
              <div className="py-1 text-gray-700">1</div><div className="py-1 text-gray-700">2</div>
              <div className="py-1 text-gray-700">3</div><div className="py-1 text-gray-700">4</div><div className="py-1 text-gray-700">5</div>
              {/* Row 2 — current week */}
              <div className="py-1 text-[#0077CC] font-medium">6</div><div className="py-1 text-[#0077CC] font-medium">7</div>
              <div className="py-1 text-white font-bold relative flex justify-center items-center">
                <span className="relative z-10 w-6 h-6 border-2 border-[#0077CC] text-[#0077CC] bg-white rounded-full flex items-center justify-center">8</span>
              </div>
              <div className="py-1 text-[#0077CC] font-medium">9</div><div className="py-1 text-[#0077CC] font-medium">10</div>
              <div className="py-1 text-[#0077CC] font-medium">11</div><div className="py-1 text-[#0077CC] font-medium">12</div>
              {/* Row 3 */}
              <div className="py-1 text-gray-700">13</div><div className="py-1 text-gray-700">14</div><div className="py-1 text-gray-700">15</div>
              <div className="py-1 text-gray-700">16</div><div className="py-1 text-gray-700">17</div><div className="py-1 text-gray-700">18</div><div className="py-1 text-gray-700">19</div>
              {/* Row 4 */}
              <div className="py-1 text-gray-700">20</div><div className="py-1 text-gray-700">21</div><div className="py-1 text-gray-700">22</div>
              <div className="py-1 text-gray-700">23</div><div className="py-1 text-gray-700">24</div><div className="py-1 text-gray-700">25</div><div className="py-1 text-gray-700">26</div>
              {/* Row 5 */}
              <div className="py-1 text-gray-700">27</div><div className="py-1 text-gray-700">28</div><div className="py-1 text-gray-700">29</div>
              <div className="py-1 text-gray-700">30</div>
              <div className="py-1 text-gray-300">1</div><div className="py-1 text-gray-300">2</div><div className="py-1 text-gray-300">3</div>
            </div>
          </div>

          {/* This week summary */}
          <div>
            <h3 className="text-[16px] font-bold text-gray-900 mb-4">This week</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#0077CC] mt-1.5 shrink-0" />
                <div className="text-[14px] text-gray-700 leading-tight"><span className="font-bold text-gray-900">Mon</span> · James Okafor · 09:00 · Cricket</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#7C3AED] mt-1.5 shrink-0" />
                <div className="text-[14px] text-gray-700 leading-tight"><span className="font-bold text-gray-900">Mon</span> · Junior Cricket · 14:00</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] mt-1.5 shrink-0" />
                <div className="text-[14px] text-gray-700 leading-tight"><span className="font-bold text-gray-900">Wed</span> · David Chen · Approval needed</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[#0077CC] mt-1.5 shrink-0" />
                <div className="text-[14px] text-gray-700 leading-tight"><span className="font-bold text-gray-900">Wed</span> · Marcus Trent · 10:00 · Football</div>
              </div>
            </div>

            <div className="mt-6 bg-[#FEF3C7] border border-[#FDE68A] rounded-[12px] p-4 flex items-center justify-between shadow-sm">
              <div className="text-[14px] font-bold text-[#92400E]">1 booking needs your approval</div>
              <button onClick={() => router.push('/coach/bookings')} className="text-[14px] font-bold text-[#0077CC] hover:underline">Review →</button>
            </div>
          </div>
        </div>

        {/* CHANGE 7: FAB refined proportions */}
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="fixed bottom-8 right-8 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full px-5 py-2.5 flex items-center gap-2 transition-colors z-40"
          style={{ boxShadow: '0 2px 8px rgba(0,119,204,0.25)' }}
        >
          <Plus size={16} className="text-white" strokeWidth={2.5} />
          <span className="text-[13px] font-medium">Add to schedule</span>
        </button>
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-end sm:items-center justify-center" onClick={() => setIsAddModalOpen(false)}>
          <div className="bg-white w-full max-w-[420px] rounded-t-[24px] sm:rounded-[24px] shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-[20px] font-bold text-gray-900 mb-6">What would you like to add?</h3>
              <div className="space-y-3">
                {[
                  { icon: <User size={20} />, title: 'Ad hoc session', sub: 'One-off 1-on-1 or small group', blue: true },
                  { icon: <RefreshCw size={20} />, title: 'Recurring session', sub: 'Repeats weekly or custom schedule', blue: true },
                  { icon: <Users size={20} />, title: 'New programme', sub: 'Group sessions with fixed spots', blue: true },
                  { icon: <Ban size={20} />, title: 'Block time', sub: 'Mark time as unavailable', blue: false },
                ].map(({ icon, title, sub, blue }) => (
                  <button key={title} className={`w-full flex items-center text-left p-4 rounded-xl border transition-colors group ${blue ? 'border-gray-100 hover:border-[#0077CC] hover:bg-[#EFF6FF]' : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'}`}>
                    <div className={`w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mr-4 shrink-0 text-gray-600 transition-colors ${blue ? 'group-hover:bg-white group-hover:text-[#0077CC]' : 'group-hover:bg-white'}`}>{icon}</div>
                    <div>
                      <div className="text-[15px] font-bold text-gray-900">{title}</div>
                      <div className="text-[13px] text-gray-500 mt-0.5">{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="w-full mt-6 py-2 text-center text-[15px] font-medium text-gray-500 hover:text-gray-900 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
