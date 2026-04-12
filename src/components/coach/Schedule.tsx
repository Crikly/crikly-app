'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Check, User, RefreshCw, Users, Ban, X, Calendar, MapPin, PoundSterling, AlertCircle, Info } from 'lucide-react'

interface EventBlockProps {
  top: number
  height: number
  type: 'confirmed' | 'programme' | 'pending' | 'blocked' | 'available'
  title: string
  subtitle?: string
  sessionId?: string
  onCardClick?: (e: React.MouseEvent, sessionId: string, type: string) => void
}

function EventBlock({ top, height, type, title, subtitle, sessionId, onCardClick }: EventBlockProps) {
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

  // CF-D02b CHANGE 1 & 2: Handle card click
  const handleClick = (e: React.MouseEvent) => {
    if (sessionId && onCardClick) {
      onCardClick(e, sessionId, type)
    }
  }

  return (
    <div
      className={`session-card absolute left-1 right-1 rounded-lg p-2 overflow-visible flex flex-col justify-start group ${bgClass} ${textClass} ${borderClass} ${leftBorderClass}`}
      style={{ top: `${top}px`, height: `${height}px`, ...extraStyles }}
      onClick={handleClick}
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
  const [popoverState, setPopoverState] = useState<{ x: number; y: number; sessionId: string; type: string } | null>(null)
  const [creationPopover, setCreationPopover] = useState<{ x: number; y: number; date: string; time: string } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const scheduleContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = 128
    }
  }, [])

  // CF-D02b: Close popovers on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.session-popover') && !target.closest('.session-card')) {
        setPopoverState(null)
        setCreationPopover(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPopoverState(null)
        setCreationPopover(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  // CF-D02b CHANGE 1: Handle session card click
  const handleCardClick = (e: React.MouseEvent, sessionId: string, type: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const containerRect = scheduleContainerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    
    setPopoverState({
      x: rect.right - containerRect.left + 8,
      y: rect.top - containerRect.top,
      sessionId,
      type
    })
  }

  // CF-D02b CHANGE 2: Handle empty/available slot click
  const handleSlotClick = (e: React.MouseEvent, date: string, time: string) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const containerRect = scheduleContainerRef.current?.getBoundingClientRect()
    if (!containerRect) return
    
    setCreationPopover({
      x: rect.right - containerRect.left + 8,
      y: rect.top - containerRect.top,
      date,
      time
    })
  }

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
      <div className="w-full max-w-7xl relative flex flex-col lg:flex-row gap-8" ref={scheduleContainerRef}>

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
                    <EventBlock top={(9 - 6) * 64} height={1 * 64} type="confirmed" title="James Okafor" subtitle="🏏 Cricket · 1-on-1" sessionId="session-1" onCardClick={handleCardClick} />
                    <EventBlock top={(14 - 6) * 64} height={1.5 * 64} type="programme" title="Junior Cricket Foundations" subtitle="🏏 4/6 spots" sessionId="session-2" onCardClick={handleCardClick} />
                  </div>
                  {/* Tue */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(10 - 6) * 64} height={1.5 * 64} type="available" title="Available" sessionId="slot-tue-10" onCardClick={(e) => handleSlotClick(e, 'Tue 7 Apr', '10:00')} />
                  </div>
                  {/* Wed Today */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(10 - 6) * 64} height={1 * 64} type="confirmed" title="Marcus Trent" subtitle="⚽ Football · 1-on-1" sessionId="session-3" onCardClick={handleCardClick} />
                    <EventBlock top={(13 - 6) * 64} height={1 * 64} type="pending" title="David Chen" subtitle="🏏 Awaiting approval" sessionId="session-4" onCardClick={handleCardClick} />
                  </div>
                  {/* Thu */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(9 - 6) * 64} height={1.5 * 64} type="programme" title="Advanced Batting Masterclass" subtitle="🏏 6/6 FULL" sessionId="session-5" onCardClick={handleCardClick} />
                  </div>
                  {/* Fri */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(15 - 6) * 64} height={2 * 64} type="available" title="Available" sessionId="slot-fri-15" onCardClick={(e) => handleSlotClick(e, 'Fri 10 Apr', '15:00')} />
                  </div>
                  {/* Sat */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(8 - 6) * 64} height={5 * 64} type="blocked" title="Blocked — Family Holiday" sessionId="block-1" onCardClick={handleCardClick} />
                  </div>
                  {/* Sun */}
                  <div className="flex-1 relative border-r border-transparent">
                    <EventBlock top={(10 - 6) * 64} height={1.5 * 64} type="programme" title="Open Net Session" subtitle="⚽ 2/8 spots" sessionId="session-6" onCardClick={handleCardClick} />
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none z-20 rounded-b-xl" />
          </div>
          
          {/* CF-D02b CHANGE 3: Add button below grid */}
          <button
            onClick={(e) => {
              // TODO CF-D02b: wire Add to schedule button to creation flow
              const rect = e.currentTarget.getBoundingClientRect()
              const containerRect = scheduleContainerRef.current?.getBoundingClientRect()
              if (!containerRect) return
              setCreationPopover({
                x: rect.left - containerRect.left,
                y: rect.top - containerRect.top - 300,
                date: 'Wed 8 Apr',
                time: '09:00'
              })
            }}
            className="self-end mt-3 mb-2 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full px-[18px] py-2 flex items-center gap-2 transition-colors text-[13px] font-medium"
            style={{ boxShadow: '0 2px 8px rgba(0,119,204,0.20)' }}
          >
            <Plus size={14} />
            <span>Add to schedule</span>
          </button>
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

        {/* CF-D02b CHANGE 1: Session popovers */}
        {popoverState && <SessionPopover {...popoverState} onClose={() => setPopoverState(null)} />}
        
        {/* CF-D02b CHANGE 2: Creation popover */}
        {creationPopover && <CreationPopover {...creationPopover} onClose={() => setCreationPopover(null)} />}
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

// CF-D02b CHANGE 1: Session Popover Component (4 types)
function SessionPopover({ x, y, sessionId, type, onClose }: { x: number; y: number; sessionId: string; type: string; onClose: () => void }) {
  const getPopoverContent = () => {
    switch (type) {
      case 'confirmed':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">James Okafor</h3>
              <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[11px] font-medium">Confirmed</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>Mon 7 Apr · 09:00 – 10:00</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <User size={14} />
                <span>Cricket · 1-on-1</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <MapPin size={14} />
                <span>Oval Cricket Ground</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-900 font-medium">
                <PoundSterling size={14} />
                <span>£45.00 (you receive)</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire View booking popover action */}} className="flex-1 bg-[#0077CC] text-white rounded-lg py-2 text-[13px] font-medium hover:bg-[#0066AA]">View booking →</button>
              <button onClick={() => {/* TODO CF-D02b: wire Message popover action */}} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg py-2 text-[13px] font-medium hover:bg-gray-50">Message</button>
            </div>
          </>
        )
      
      case 'programme':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">{sessionId === 'session-2' ? 'Junior Cricket Foundations' : 'Open Net Session'}</h3>
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[11px] font-medium">Active</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>{sessionId === 'session-2' ? 'Mon 7 Apr · 14:00 – 15:30' : 'Sun 12 Apr · 10:00 – 11:30'}</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <User size={14} />
                <span>Cricket · Group</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Users size={14} />
                <span>{sessionId === 'session-2' ? '4 / 6 spots filled' : '2 / 8 spots filled'}</span>
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: sessionId === 'session-2' ? '66.67%' : '25%' }} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire View programme popover action */}} className="flex-1 bg-purple-600 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-purple-700">View prog. →</button>
              <button onClick={() => {/* TODO CF-D02b: wire Message popover action */}} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg py-2 text-[13px] font-medium hover:bg-gray-50">Message</button>
            </div>
          </>
        )
      
      case 'pending':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">David Chen</h3>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[11px] font-medium">Awaiting approval</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>Wed 8 Apr · 13:00 – 14:00</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <User size={14} />
                <span>Cricket · 1-on-1</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-amber-700 font-medium">
                <AlertCircle size={14} className="text-amber-500" />
                <span>Respond within 24 hours</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire Approve action to booking approval API */}} className="flex-1 bg-green-600 text-white rounded-lg py-2 text-[13px] font-medium hover:bg-green-700 flex items-center justify-center gap-1">
                <Check size={14} /> Approve
              </button>
              <button onClick={() => {/* TODO CF-D02b: wire Decline action to booking decline API */}} className="flex-1 bg-white border border-red-200 text-red-600 rounded-lg py-2 text-[13px] font-medium hover:bg-red-50 flex items-center justify-center gap-1">
                <X size={14} /> Decline
              </button>
            </div>
          </>
        )
      
      case 'blocked':
        return (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-[15px] font-medium text-gray-900">Blocked — Family Holiday</h3>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[11px] font-medium">Blocked</span>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} />
                <span>Sat 11 Apr · 08:00 – 13:00</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-gray-500">
                <Info size={14} />
                <span>You are unavailable during this time</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => {/* TODO CF-D02b: wire Edit block action */}} className="flex-1 bg-white border border-gray-200 text-gray-700 rounded-lg py-2 text-[13px] font-medium hover:bg-gray-50">Edit block</button>
              <button onClick={() => {/* TODO CF-D02b: wire Remove block action */}} className="flex-1 bg-white border border-red-200 text-red-600 rounded-lg py-2 text-[13px] font-medium hover:bg-red-50">Remove</button>
            </div>
          </>
        )
      
      default:
        return null
    }
  }

  return (
    <div 
      className="session-popover absolute bg-white rounded-xl border border-gray-100 p-4 z-50 w-[280px] animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
      }}
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
        <X size={14} />
      </button>
      {getPopoverContent()}
    </div>
  )
}

// CF-D02b CHANGE 2: Creation Popover Component
function CreationPopover({ x, y, date, time, onClose }: { x: number; y: number; date: string; time: string; onClose: () => void }) {
  const [sessionType, setSessionType] = useState<'1-on-1' | 'Group'>('1-on-1')
  const [startTime, setStartTime] = useState(time)
  const [endTime, setEndTime] = useState(() => {
    const [hours, mins] = time.split(':').map(Number)
    const endHour = (hours + 1).toString().padStart(2, '0')
    return `${endHour}:${mins.toString().padStart(2, '0')}`
  })

  const timeOptions = Array.from({ length: 17 }, (_, i) => {
    const hour = (i + 6).toString().padStart(2, '0')
    return [`${hour}:00`, `${hour}:30`]
  }).flat()

  return (
    <div 
      className="session-popover absolute bg-white rounded-xl border border-gray-100 p-4 z-50 w-[280px] animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ 
        left: `${x}px`, 
        top: `${y}px`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
      }}
    >
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
        <X size={14} />
      </button>
      
      <h3 className="text-[14px] font-medium text-gray-900 mb-3">New session</h3>
      
      <div className="space-y-2.5">
        <input 
          type="text" 
          placeholder="Session title or player name"
          className="w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-brand-600"
        />
        
        <div className="flex gap-2">
          <div className="text-[13px] text-gray-600 py-2">{date}</div>
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-600">
            {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-600">
            {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        
        <select className="w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-brand-600">
          <option>Cricket</option>
          <option>Football</option>
          <option>Tennis</option>
          <option>Swimming</option>
          <option>Basketball</option>
          <option>Other</option>
        </select>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setSessionType('1-on-1')}
            className={`flex-1 py-1.5 px-3 rounded-md text-[12px] font-medium transition-colors ${
              sessionType === '1-on-1' 
                ? 'bg-[#0077CC] text-white' 
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            1-on-1
          </button>
          <button 
            onClick={() => setSessionType('Group')}
            className={`flex-1 py-1.5 px-3 rounded-md text-[12px] font-medium transition-colors ${
              sessionType === 'Group' 
                ? 'bg-[#0077CC] text-white' 
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Group
          </button>
        </div>
        
        <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <PoundSterling size={12} />
          <span>45.00 (you receive)</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => {/* TODO CF-D02b: wire Cancel to dismiss popover */onClose()}} className="text-[12px] text-gray-500 hover:text-gray-900">
          Cancel
        </button>
        <button onClick={() => {/* TODO CF-D02b: wire Create session to booking/session creation API */}} className="bg-[#0077CC] text-white rounded-lg px-4 py-1.5 text-[13px] font-medium hover:bg-[#0066AA]">
          Create →
        </button>
      </div>
    </div>
  )
}
