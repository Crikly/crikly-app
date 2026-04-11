'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft, MapPin, Star, PoundSterling } from 'lucide-react'

export function CoachRightPanel() {
  const pathname = usePathname()
  const isScheduleRoute = pathname === '/coach/schedule'

  return (
    <aside className="hidden xl:flex w-96 shrink-0 flex-col gap-10 bg-white p-8 sticky top-0 h-screen overflow-y-auto border-l border-gray-100">
      {isScheduleRoute ? (
        <>
          <MiniCalendar />
          <FreeSlotsThisWeek />
          <ThisWeekSummary />
          <SmartInsightCard />
          <PendingApprovalCard />
        </>
      ) : (
        <>
          <ThisWeekStrip isDesktop />
          <TodayLineup isDesktop />
          <YourRatingCard />
          <TotalEarningsCard />
        </>
      )}
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

// CHANGE 6: Schedule-specific right panel components

function MiniCalendar() {
  return (
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
        <div className="py-1 text-gray-300">30</div><div className="py-1 text-gray-300">31</div>
        <div className="py-1 text-gray-700">1</div><div className="py-1 text-gray-700">2</div>
        <div className="py-1 text-gray-700">3</div><div className="py-1 text-gray-700">4</div><div className="py-1 text-gray-700">5</div>
        <div className="py-1 text-[#0077CC] font-medium">6</div><div className="py-1 text-[#0077CC] font-medium">7</div>
        <div className="py-1 text-white font-bold relative flex justify-center items-center">
          <span className="relative z-10 w-6 h-6 border-2 border-[#0077CC] text-[#0077CC] bg-white rounded-full flex items-center justify-center">8</span>
        </div>
        <div className="py-1 text-[#0077CC] font-medium">9</div><div className="py-1 text-[#0077CC] font-medium">10</div>
        <div className="py-1 text-[#0077CC] font-medium">11</div><div className="py-1 text-[#0077CC] font-medium">12</div>
        <div className="py-1 text-gray-700">13</div><div className="py-1 text-gray-700">14</div><div className="py-1 text-gray-700">15</div>
        <div className="py-1 text-gray-700">16</div><div className="py-1 text-gray-700">17</div><div className="py-1 text-gray-700">18</div><div className="py-1 text-gray-700">19</div>
        <div className="py-1 text-gray-700">20</div><div className="py-1 text-gray-700">21</div><div className="py-1 text-gray-700">22</div>
        <div className="py-1 text-gray-700">23</div><div className="py-1 text-gray-700">24</div><div className="py-1 text-gray-700">25</div><div className="py-1 text-gray-700">26</div>
        <div className="py-1 text-gray-700">27</div><div className="py-1 text-gray-700">28</div><div className="py-1 text-gray-700">29</div>
        <div className="py-1 text-gray-700">30</div>
        <div className="py-1 text-gray-300">1</div><div className="py-1 text-gray-300">2</div><div className="py-1 text-gray-300">3</div>
      </div>
    </div>
  )
}

function FreeSlotsThisWeek() {
  const router = useRouter()
  const freeSlots = [
    { day: 'Tue', time: '09:00–12:00' },
    { day: 'Fri', time: '14:00–17:00' },
  ]
  
  return (
    <div>
      <h3 className="text-[12px] font-medium text-gray-900 mb-1.5">Free slots this week</h3>
      <div className="space-y-1">
        {freeSlots.map((slot, i) => (
          <div key={i} className="bg-gray-50 border border-gray-100 rounded-md px-2 py-1.5 flex items-center justify-between">
            <div className="text-[11px]">
              <span className="font-medium text-gray-900">{slot.day}</span>
              <span className="text-gray-500 ml-1">· {slot.time}</span>
            </div>
            <Link 
              href="/coach/availability" 
              className="text-[10px] font-medium text-[#0077CC] hover:underline"
            >
              Fill →
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

function ThisWeekSummary() {
  const sessions = [
    { day: 'Mon', name: 'James Okafor', time: '09:00', sport: 'Cricket', status: 'confirmed', color: 'bg-blue-500' },
    { day: 'Mon', name: 'Junior Cricket', time: '14:00', sport: 'Cricket', status: 'programme', color: 'bg-purple-500' },
    { day: 'Wed', name: 'David Chen', time: '13:00', sport: 'Cricket', status: 'pending', color: 'bg-amber-400' },
    { day: 'Wed', name: 'Marcus Trent', time: '10:00', sport: 'Football', status: 'confirmed', color: 'bg-blue-500' },
  ]
  
  return (
    <div>
      <h3 className="text-[12px] font-medium text-gray-900 mb-3">This week</h3>
      <div className="space-y-3">
        {sessions.map((session, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className={`w-[7px] h-[7px] rounded-full ${session.color} mt-1.5 shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-900 leading-tight">{session.day} · {session.name} · {session.time}</div>
              <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{session.sport} · {session.status.charAt(0).toUpperCase() + session.status.slice(1)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SmartInsightCard() {
  // TODO CF-D02: derive insight from real earnings/availability data
  return (
    <div className="bg-[#E8F5F0] border-l-[3px] border-l-[#1D9E75] rounded-lg px-3 py-2.5">
      <div className="text-[9px] text-[#0F6E56] uppercase tracking-wider font-medium mb-1">Insight</div>
      <p className="text-[11px] text-[#085041] font-medium leading-relaxed">
        Saturdays earn 30% more on average — consider opening a slot
      </p>
    </div>
  )
}

function PendingApprovalCard() {
  const router = useRouter()
  
  return (
    <div className="bg-[#FFFBEB] border-l-[3px] border-l-amber-400 rounded-lg px-3 py-2.5">
      <div className="text-[9px] text-amber-900 uppercase tracking-wider font-medium mb-1">Needs approval</div>
      <p className="text-[11px] text-amber-900 font-medium mb-1.5">1 booking needs your approval</p>
      <button 
        onClick={() => router.push('/coach/bookings?tab=pending')}
        className="text-[11px] text-[#0077CC] font-medium hover:underline"
      >
        Review now →
      </button>
    </div>
  )
}
