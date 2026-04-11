'use client'

import Link from 'next/link'
import { ChevronRight, MapPin, Star, PoundSterling } from 'lucide-react'

export function CoachRightPanel() {
  return (
    <aside className="hidden xl:flex w-96 shrink-0 flex-col gap-10 bg-white p-8 sticky top-0 h-screen overflow-y-auto border-l border-gray-100">
      <ThisWeekStrip isDesktop />
      <TodayLineup isDesktop />
      <YourRatingCard />
      <TotalEarningsCard />
    </aside>
  )
}

function ThisWeekStrip({ isDesktop }: { isDesktop?: boolean }) {
  const days = [
    { label: 'M', date: '13' },
    { label: 'T', date: '14', active: true, hasSession: true },
    { label: 'W', date: '15', hasSession: true },
    { label: 'T', date: '16' },
    { label: 'F', date: '17', hasSession: true },
    { label: 'S', date: '18', hasSession: true },
    { label: 'S', date: '19' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className={`${isDesktop ? 'text-[22px]' : 'text-[19px]'} font-bold text-gray-900`}>This week</h3>
        <div className="flex items-center gap-1 text-sm font-bold text-gray-500 cursor-pointer hover:text-gray-900 transition-colors">
          May <ChevronRight size={16} />
        </div>
      </div>
      <div className="flex justify-between items-center bg-gray-50 rounded-[20px] p-2.5 border border-gray-100/80 shadow-sm">
        {days.map((day, i) => (
          <div key={i} className="flex flex-col items-center gap-2 cursor-pointer group">
            <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{day.label}</span>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[15px] font-bold transition-all ${day.active ? 'bg-[#0077CC] text-white shadow-md' : 'text-gray-700 group-hover:bg-gray-200'}`}>
              {day.date}
            </div>
            <div className="h-1.5 flex justify-center w-full">
              {day.hasSession && <div className={`w-1.5 h-1.5 rounded-full ${day.active ? 'bg-[#0077CC]' : 'bg-gray-300'}`}></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TodayLineup({ isDesktop }: { isDesktop?: boolean }) {
  const sessions = [
    { time: '14:00', duration: '90m', title: 'U14 Fast Bowling Masterclass', location: "Lord's Indoor Centre", active: true },
    { time: '16:00', duration: '60m', title: '1-on-1 with James T.', location: 'The Oval Nets', type: 'Private' },
    { time: '18:00', duration: '120m', title: "Senior Men's Net Session", location: 'Wandsworth CC' },
  ]
  return (
    <div className="flex flex-col gap-6 flex-1">
      <div className="flex justify-between items-center">
        <h3 className={`${isDesktop ? 'text-[22px]' : 'text-[19px]'} font-bold text-gray-900`}>Today's lineup</h3>
        {isDesktop && <span className="text-[#0077CC] text-sm font-bold cursor-pointer hover:underline">View all</span>}
      </div>
      <div className="flex flex-col relative">
        <div className="absolute left-[60px] top-4 bottom-8 w-[1.5px] bg-gray-100 -translate-x-1/2"></div>
        {sessions.map((session, i) => (
          <div key={i} className="flex gap-6 mb-7 relative group cursor-pointer">
            <div className="flex flex-col items-center pt-3.5 z-10 w-12 shrink-0">
              <span className={`text-[15px] font-bold ${session.active ? 'text-[#0077CC]' : 'text-gray-600'}`}>{session.time}</span>
              <span className="text-[11px] text-gray-400 font-bold mt-1 uppercase tracking-wider">{session.duration}</span>
            </div>
            <div className={`absolute left-[60px] top-[26px] w-3.5 h-3.5 rounded-full border-[3px] bg-white z-20 transition-all -translate-x-1/2 -translate-y-1/2 ${session.active ? 'border-[#0077CC] shadow-[0_0_0_4px_rgba(0,119,204,0.1)] scale-110' : 'border-gray-300 group-hover:border-gray-400'}`}></div>
            <div className={`flex-1 p-4 md:p-5 rounded-[20px] border transition-all ${session.active ? 'bg-[#0077CC]/[0.03] border-[#0077CC]/20 shadow-sm' : 'bg-white border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.02)] hover:border-gray-200 hover:shadow-md'}`}>
              <div className="flex justify-between items-start mb-2">
                <h4 className={`font-bold text-[16px] md:text-[17px] ${session.active ? 'text-[#0077CC]' : 'text-gray-900'} leading-tight pr-2`}>{session.title}</h4>
                {session.type === 'Private' && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full shrink-0 border border-purple-100/50">1:1</span>}
              </div>
              <div className="flex items-center gap-2 text-gray-500 text-[13px] font-medium">
                <MapPin size={14} className={session.active ? 'text-[#0077CC]/70' : ''} />
                <span className="truncate">{session.location}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function YourRatingCard() {
  return (
    <Link href="/coach/profile#reviews" className="bg-gray-50 rounded-[10px] p-[14px] flex flex-col gap-3 cursor-pointer hover:border hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
      <div className="flex items-center gap-2">
        <Star size={16} className="text-amber-400" fill="currentColor" />
        <span className="text-sm font-semibold text-gray-900">Your Rating</span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[28px] font-bold text-gray-900">4.8</p>
        <p className="text-[13px] text-gray-500">Based on 42 reviews</p>
      </div>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => (
          <Star key={i} size={14} className="text-amber-400" fill="currentColor" />
        ))}
      </div>
      <div className="border-l-2 border-gray-200 pl-3 mt-2">
        <p className="text-xs italic text-gray-500 leading-relaxed">
          "Ravi is an excellent coach! My son has improved..." — Sarah M.
        </p>
      </div>
    </Link>
  )
}

function TotalEarningsCard() {
  return (
    <Link href="/coach/earnings" className="bg-gray-50 rounded-[10px] p-[14px] flex flex-col gap-3 cursor-pointer hover:border hover:border-gray-300 hover:scale-[1.01] transition-all duration-150">
      <div className="flex items-center gap-2">
        <PoundSterling size={16} className="text-[#0077CC]" />
        <span className="text-sm font-semibold text-gray-900">Total Earnings</span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[28px] font-bold text-gray-900">£1,240</p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">vs last month</span>
          <span className="text-green-600 font-medium">+12%</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-gray-500">Upcoming this week</span>
          <span className="text-gray-500 font-medium">£320</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-9">
        <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: '40%' }}></div>
        <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: '55%' }}></div>
        <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: '70%' }}></div>
        <div className="flex-1 bg-[#0077CC] rounded-sm" style={{ height: '90%' }}></div>
        <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: '50%' }}></div>
        <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: '60%' }}></div>
        <div className="flex-1 bg-gray-200 rounded-sm" style={{ height: '45%' }}></div>
      </div>
      <p className="text-[10px] text-gray-400 mt-1">7 days</p>
    </Link>
  )
}
