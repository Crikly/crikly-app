'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { 
  Clock, MapPin, Star, TrendingUp, AlertCircle, 
  ChevronRight, PoundSterling, Check
} from 'lucide-react'

const avatarUrl = "https://images.unsplash.com/photo-1741363863033-2d68f0bd9fde?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRpYW4lMjBtYW4lMjBzbWlsaW5nJTIwcG9ydHJhaXR8ZW58MXx8fHwxNzc1NDg3OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080"
const upNextUrl = "https://images.unsplash.com/photo-1771909713672-4e351f1f8b62?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjcmlja2V0JTIwdHJhaW5pbmclMjBzcG9ydHN8ZW58MXx8fHwxNzc1NDg3OTc5fDA&ixlib=rb-4.1.0&q=80&w=1080"
const group1Url = "https://images.unsplash.com/photo-1761039807856-9f412d0e0a3d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjB0cmFpbmluZyUyMGdyb3VwfGVufDF8fHx8MTc3NTQ4Nzk3OXww&ixlib=rb-4.1.0&q=80&w=1080"
const group2Url = "https://images.unsplash.com/photo-1609422644211-a85c36ee36a7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxraWRzJTIwcGxheWluZyUyMHNwb3J0c3xlbnwxfHx8fDE3NzU0ODc5Nzl8MA&ixlib=rb-4.1.0&q=80&w=1080"
const fallbackAvatarUrl = "https://images.unsplash.com/photo-1609422644211-a85c36ee36a7?w=100&q=80"

export function CoachHome() {
  const router = useRouter()
  const [profileExpanded, setProfileExpanded] = React.useState(false)

  return (
    <div className="flex flex-1 min-h-screen">
      {/* Main content — left/center */}
      <div className="flex-1 flex justify-center">
        <div className="w-full flex flex-col gap-6 md:gap-8 p-5 md:p-10 pb-28 md:pb-10 bg-white">
        
        {/* Mobile Top Bar */}
        <div className="flex justify-between items-center md:hidden mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[#0077CC] text-white flex items-center justify-center font-bold text-sm shadow-sm">C</div>
            <span className="text-xl font-bold text-[#0077CC] tracking-tight">Crikly</span>
          </div>
          <div className="relative">
            <img src={avatarUrl} alt="Ravi" className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-100" />
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm">3</span>
          </div>
        </div>

        {/* Desktop Greeting */}
        <div className="hidden md:flex justify-between items-end">
          <div>
            <p className="text-gray-500 text-sm mb-1.5 font-medium">Tuesday, 14 May</p>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">Good morning, Ravi</h1>
          </div>
        </div>

        {/* Mobile Greeting */}
        <div className="md:hidden">
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900 leading-tight">Good morning, Ravi</h1>
        </div>

        {/* Alerts */}
        <div className="flex flex-col gap-3">
          <div className="bg-amber-50 rounded-xl overflow-hidden shadow-sm transition-all duration-300">
            <div
              onClick={() => setProfileExpanded(!profileExpanded)}
              className="p-3.5 flex items-center justify-between gap-2 text-amber-900 cursor-pointer hover:bg-amber-100/50 transition-colors"
            >
              <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                <AlertCircle size={18} className="text-amber-600 shrink-0" />
                <span className="text-[14px] md:text-[15px] font-medium truncate">Complete profile to go live</span>
              </div>
              <div className="flex items-center gap-2.5 md:gap-3 shrink-0">
                <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.5" fill="none" className="text-amber-200" />
                    <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeDasharray="75.4" strokeDashoffset="49" className="text-amber-500" strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-[8px] font-bold text-amber-800">35%</span>
                </div>
                <ChevronRight size={18} className={`text-amber-600/60 transition-transform duration-300 shrink-0 ${profileExpanded ? 'rotate-90' : ''}`} />
              </div>
            </div>
            {profileExpanded && (
              <div className="px-4 pb-4 pt-1 border-t border-amber-200/40 bg-amber-50/50">
                <ul className="flex flex-col gap-3 mt-2">
                  <ProfileChecklistItem title="Basic profile" completed={true} onNavigate={() => router.push('/coach/onboarding/profile')} />
                  <ProfileChecklistItem title="Sport & pricing" completed={false} onNavigate={() => router.push('/coach/onboarding/pricing')} />
                  <ProfileChecklistItem title="Qualifications" completed={false} onNavigate={() => router.push('/coach/onboarding/qualifications')} />
                  <ProfileChecklistItem title="Availability" completed={false} onNavigate={() => router.push('/coach/onboarding/availability')} />
                  <ProfileChecklistItem title="Booking policy" completed={false} onNavigate={() => router.push('/coach/onboarding/policy')} />
                  <ProfileChecklistItem title="Get paid (optional)" completed={false} onNavigate={() => router.push('/coach/onboarding/get-paid')} />
                </ul>
              </div>
            )}
          </div>
          
          <div
            onClick={() => router.push('/coach/bookings')}
            className="bg-red-50 rounded-xl p-3.5 flex items-center justify-between gap-2 text-red-900 shadow-sm cursor-pointer hover:bg-red-100/50 transition-colors"
          >
            <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-700 shrink-0">2</div>
              <span className="text-[14px] md:text-[15px] font-medium truncate">Bookings need approval</span>
            </div>
            <ChevronRight size={18} className="text-red-600/60 shrink-0" />
          </div>
        </div>

        {/* Up Next Hero Card */}
        <section className="flex flex-col gap-3.5">
          <div className="flex justify-between items-end">
            <h2 className="text-[19px] font-bold text-gray-900">Up next</h2>
            <span onClick={() => router.push('/coach/schedule')} className="text-[#0077CC] text-sm font-bold cursor-pointer md:hidden hover:underline">View schedule</span>
          </div>
          <div className="relative h-64 md:h-[340px] w-full rounded-2xl md:rounded-[24px] overflow-hidden shadow-sm group cursor-pointer isolate">
            <img src={upNextUrl} alt="Cricket Training" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 -z-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/30 to-black/10 -z-10"></div>
            <div className="absolute top-4 left-4 md:top-6 md:left-6 bg-white/20 backdrop-blur-md border border-white/20 text-white text-[13px] font-bold px-3.5 py-1.5 rounded-full shadow-sm">
              Starts in 45m
            </div>
            <div className="absolute bottom-0 left-0 w-full p-5 md:p-8 flex flex-col gap-2.5 z-10">
              <h3 className="text-white text-[26px] md:text-3xl font-bold leading-tight drop-shadow-sm">U14 Fast Bowling Masterclass</h3>
              <div className="flex flex-wrap items-center gap-4 text-gray-100 text-[15px] font-medium mt-1">
                <div className="flex items-center gap-1.5"><Clock size={16} className="text-gray-300" /><span>14:00 - 15:30</span></div>
                <div className="flex items-center gap-1.5"><MapPin size={16} className="text-gray-300" /><span>Lord's Indoor Centre</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* Mobile Only */}
        <div className="md:hidden flex flex-col gap-8 mt-2">
          <ThisWeekStrip />
          <TodayLineup />
        </div>

        {/* Stats */}
        <section className="grid grid-cols-2 gap-3 md:gap-4 mt-2 md:mt-0">
          <div className="bg-white border border-gray-100 rounded-[20px] p-5 md:p-6 shadow-sm flex flex-col gap-1 relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
            <div className="absolute -top-4 -right-4 p-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity"><TrendingUp size={96} /></div>
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0077CC] flex items-center justify-center mb-3"><PoundSterling size={20} /></div>
            <p className="text-gray-500 text-[15px] font-medium">Earnings</p>
            <h3 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight">£1,240</h3>
            <div className="flex items-center gap-1 mt-1 text-green-600 bg-green-50 w-fit px-2 py-0.5 rounded-md">
              <TrendingUp size={12} strokeWidth={3} />
              <span className="text-[11px] font-bold uppercase tracking-wide">12% this month</span>
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-[20px] p-5 md:p-6 shadow-sm flex flex-col gap-1 relative overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
            <div className="absolute -top-4 -right-4 p-4 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity"><Star size={96} /></div>
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-3"><Star size={20} fill="currentColor" /></div>
            <p className="text-gray-500 text-[15px] font-medium">Rating</p>
            <h3 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight">4.8</h3>
            <p className="text-[13px] text-gray-500 font-medium mt-1.5">Based on 42 reviews</p>
          </div>
        </section>

        {/* Group Programmes */}
        <section className="flex flex-col gap-4 mt-2">
          <div className="flex justify-between items-end">
            <h2 className="text-[19px] font-bold text-gray-900">Group programmes</h2>
            <span onClick={() => router.push('/coach/programmes')} className="text-[#0077CC] text-sm font-bold cursor-pointer hover:underline">Manage</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 md:mx-0 md:px-0 snap-x">
            <GroupCard title="Summer Youth Camp" spots="12/15 spots filled" image={group1Url} active />
            <GroupCard title="Elite Spin Bowling" spots="4/8 spots filled" image={group2Url} />
            <GroupCard title="Weekend Warriors" spots="20/20 spots filled" image={fallbackAvatarUrl} />
          </div>
        </section>
        </div>
      </div>

      {/* Desktop Right Panel */}
      <aside className="hidden xl:flex w-80 lg:w-[360px] shrink-0 flex-col gap-10 bg-white p-8 sticky top-0 h-screen overflow-y-auto border-l border-gray-100 z-10">
        <ThisWeekStrip isDesktop />
        <TodayLineup isDesktop />
      </aside>
    </div>
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

function ProfileChecklistItem({ title, completed, onNavigate }: { title: string; completed: boolean; onNavigate?: () => void }) {
  return (
    <li onClick={onNavigate} className="flex items-center justify-between group cursor-pointer hover:opacity-80 transition-opacity">
      <div className="flex items-center gap-3 text-[14px]">
        {completed ? (
          <div className="w-[18px] h-[18px] rounded-full bg-[#0077CC] text-white flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3} /></div>
        ) : (
          <div className="w-[18px] h-[18px] rounded-full border-[2px] border-amber-300 group-hover:border-amber-500 transition-colors shrink-0"></div>
        )}
        <span className={`font-medium transition-colors ${completed ? 'text-gray-600' : 'text-amber-900'}`}>{title}</span>
      </div>
      {!completed && <ChevronRight size={14} className="text-amber-600/60 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </li>
  )
}

function GroupCard({ title, spots, image, active }: { title: string; spots: string; image: string; active?: boolean }) {
  return (
    <div className="min-w-[240px] md:min-w-[260px] snap-center flex flex-col bg-white border border-gray-100 rounded-[20px] overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.03)] cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all group">
      <div className="h-[140px] w-full bg-gray-100 relative overflow-hidden">
        <img src={image} alt={title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        {active && <div className="absolute top-3 left-3 bg-green-500/90 backdrop-blur-sm text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-sm">Active</div>}
      </div>
      <div className="p-4 md:p-5 flex flex-col gap-1.5">
        <h4 className="font-bold text-[17px] text-gray-900 leading-tight group-hover:text-[#0077CC] transition-colors">{title}</h4>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[13px] font-medium text-gray-500">{spots}</p>
          <div className="flex -space-x-2">
            {[1,2,3].map(i => (
              <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-gray-200 shadow-sm overflow-hidden">
                <img src={fallbackAvatarUrl} alt="avatar" className="w-full h-full object-cover opacity-80" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
