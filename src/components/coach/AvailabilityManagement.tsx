'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, ChevronLeft, ChevronRight, Plus, ChevronDown, AlertTriangle } from 'lucide-react'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAY_FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
const REPEAT_OPTIONS = ['Weekly', 'Fortnightly', 'Monthly', 'One-off']

const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

interface ScheduleBlock { id: number; day: string; sport: string; time: string; location: string; price: string }
interface BlockedRange { id: number; start: Date; end: Date; label: string }
interface CalDay { date: Date; type: 'prev' | 'current' | 'next' }

function dateOnly(d: Date): number { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
function sameDay(a: Date, b: Date): boolean { return dateOnly(a) === dateOnly(b) }
function inRange(d: Date, start: Date, end: Date): boolean { const dn = dateOnly(d); return dn >= dateOnly(start) && dn <= dateOnly(end) }
function daysBetween(a: Date, b: Date): number { return Math.round((dateOnly(b) - dateOnly(a)) / 86_400_000) + 1 }
function fmt(d: Date): string { return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}` }

function buildCalendar(year: number, month: number): CalDay[] {
  const firstDow = new Date(year, month, 1).getDay()
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()
  const prevM = month === 0 ? 11 : month - 1
  const prevY = month === 0 ? year - 1 : year
  const nextM = month === 11 ? 0 : month + 1
  const nextY = month === 11 ? year + 1 : year
  const days: CalDay[] = []
  for (let i = leadingBlanks - 1; i >= 0; i--) days.push({ date: new Date(prevY, prevM, daysInPrev - i), type: 'prev' })
  for (let i = 1; i <= daysInMonth; i++) days.push({ date: new Date(year, month, i), type: 'current' })
  const rem = 42 - days.length
  for (let i = 1; i <= rem; i++) days.push({ date: new Date(nextY, nextM, i), type: 'next' })
  return days
}

export function AvailabilityManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'schedule' | 'blocked'>('schedule')
  const [scheduleBlocks] = useState<ScheduleBlock[]>([
    { id: 1, day: 'Mon', sport: 'Cricket', time: '09:00 – 12:00', location: 'Oval Cricket Ground', price: '£50/60min' },
    { id: 2, day: 'Wed', sport: 'Cricket', time: '14:00 – 17:00', location: 'Kennington Park', price: '£60/60min' },
    { id: 3, day: 'Sat', sport: 'Tennis', time: '09:00 – 13:00', location: "Queen's Club", price: '£45/60min' },
  ])
  const availableSports = useMemo(() => [...new Set(scheduleBlocks.map(b => b.sport))], [scheduleBlocks])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formSport, setFormSport] = useState(availableSports[0] ?? '')
  const [formDays, setFormDays] = useState<string[]>([])
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('10:00')
  const [formRepeat, setFormRepeat] = useState('Weekly')
  const [formVenue, setFormVenue] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const toggleDay = (day: string) => setFormDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  const conflict = useMemo(() => { for (const day of formDays) { const existing = scheduleBlocks.find(b => b.sport === formSport && b.day === day); if (existing) return { day, block: existing } } return null }, [formSport, formDays, scheduleBlocks])
  const resetForm = () => { setFormSport(availableSports[0] ?? ''); setFormDays([]); setFormStartTime('09:00'); setFormEndTime('10:00'); setFormRepeat('Weekly'); setFormVenue(''); setFormPrice(''); setShowAddForm(false) }
  const [currentMonth, setCurrentMonth] = useState(3)
  const [currentYear, setCurrentYear] = useState(2026)
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [hoverDate, setHoverDate] = useState<Date | null>(null)
  const [blockLabel, setBlockLabel] = useState('')
  const [blockedRanges, setBlockedRanges] = useState<BlockedRange[]>([
    { id: 1, start: new Date(2025, 11, 25), end: new Date(2026, 0, 1), label: 'Christmas & New Year' },
    { id: 2, start: new Date(2026, 3, 15), end: new Date(2026, 3, 22), label: 'Easter holiday' },
  ])
  const calendarDays = useMemo(() => buildCalendar(currentYear, currentMonth), [currentYear, currentMonth])
  const TODAY = new Date(2026, 3, 8)
  const navigatePrev = () => { if (currentMonth === 0) { setCurrentYear(y => y - 1); setCurrentMonth(11) } else setCurrentMonth(m => m - 1) }
  const navigateNext = () => { if (currentMonth === 11) { setCurrentYear(y => y + 1); setCurrentMonth(0) } else setCurrentMonth(m => m + 1) }
  const handleDayClick = (day: CalDay) => {
    if (day.type !== 'current') return
    const clicked = day.date
    if (!rangeStart || rangeEnd) { setRangeStart(clicked); setRangeEnd(null) }
    else { if (sameDay(clicked, rangeStart)) { setRangeEnd(clicked) } else if (dateOnly(clicked) > dateOnly(rangeStart)) { setRangeEnd(clicked) } else { setRangeStart(clicked); setRangeEnd(null) } }
  }
  const handleBlockDates = () => {
    if (!rangeStart) return
    const end = rangeEnd ?? rangeStart
    setBlockedRanges(prev => [...prev, { id: Date.now(), start: rangeStart, end, label: blockLabel.trim() }])
    setRangeStart(null); setRangeEnd(null); setBlockLabel(''); setHoverDate(null)
  }
  const clearSelection = () => { setRangeStart(null); setRangeEnd(null); setBlockLabel(''); setHoverDate(null) }
  const previewEnd = (rangeStart && !rangeEnd && hoverDate && dateOnly(hoverDate) > dateOnly(rangeStart)) ? hoverDate : null
  const isSingleDay = !!(rangeStart && rangeEnd && sameDay(rangeStart, rangeEnd))

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pt-10 pb-32" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-[640px] px-6">
        <div className="mb-8">
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Availability</h1>
          <p className="text-[16px] text-gray-500 font-medium">Manage your recurring schedule and blocked dates</p>
        </div>
        <div className="flex border-b border-gray-100 mb-8">
          {(['schedule', 'blocked'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 px-1 mr-8 font-bold text-[16px] transition-colors border-b-2 capitalize ${activeTab === tab ? 'border-[#0077CC] text-[#0077CC]' : 'border-transparent text-[#94A3B8] hover:text-gray-600'}`}>
              {tab === 'blocked' ? 'Blocked dates' : 'Schedule'}
            </button>
          ))}
        </div>

        {activeTab === 'schedule' && (
          <div className="flex flex-col">
            <h2 className="text-[18px] font-bold text-gray-900 mb-4">Your recurring blocks</h2>
            <div className="flex flex-col gap-3 mb-6">
              {scheduleBlocks.map(block => (
                <div key={block.id} className="bg-white border border-gray-100 shadow-sm rounded-2xl p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#E6F3FB] rounded-xl flex items-center justify-center shrink-0">
                      <span className="text-[#0077CC] font-bold text-[15px]">{block.day}</span>
                    </div>
                    <div className="flex flex-col">
                      <div className="text-[15px] font-bold text-gray-900 mb-0.5">{block.sport} <span className="text-gray-300 mx-1.5">•</span> {block.time}</div>
                      <div className="text-[14px] text-gray-500 font-medium">{block.location} <span className="text-gray-300 mx-1.5">•</span> {block.price}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-[#0077CC] hover:bg-blue-50 rounded-full transition-colors"><Pencil size={18} /></button>
                    <button className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"><X size={20} /></button>
                  </div>
                </div>
              ))}
            </div>

            {showAddForm ? (
              <div className="border border-gray-200 rounded-2xl p-5 bg-white shadow-sm">
                <h3 className="text-[16px] font-bold text-gray-900 mb-5">New availability block</h3>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Sport</label>
                  <div className="relative">
                    <select value={formSport} onChange={e => { setFormSport(e.target.value); setFormDays([]) }} className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-900 focus:outline-none focus:border-[#0077CC] pr-10">
                      {availableSports.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                  <p className="text-[12px] text-gray-400 font-medium mt-1.5">Only sports you've already configured are shown</p>
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_ABBR.map(day => (
                      <button key={day} type="button" onClick={() => toggleDay(day)} className={`px-3.5 py-2 rounded-lg text-[13px] font-bold transition-colors border ${formDays.includes(day) ? 'bg-[#0077CC] text-white border-[#0077CC]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-100'}`}>{day}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[{ label: 'Start time', val: formStartTime, set: setFormStartTime }, { label: 'End time', val: formEndTime, set: setFormEndTime }].map(({ label, val, set }) => (
                    <div key={label}>
                      <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">{label}</label>
                      <div className="relative">
                        <select value={val} onChange={e => set(e.target.value)} className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-900 focus:outline-none focus:border-[#0077CC] pr-10">
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Repeat</label>
                  <div className="flex flex-wrap gap-2">
                    {REPEAT_OPTIONS.map(opt => (
                      <button key={opt} type="button" onClick={() => setFormRepeat(opt)} className={`px-3.5 py-2 rounded-lg text-[13px] font-bold transition-colors border ${formRepeat === opt ? 'bg-[#0077CC] text-white border-[#0077CC]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-100'}`}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Venue</label>
                  <input type="text" value={formVenue} onChange={e => setFormVenue(e.target.value)} placeholder="e.g. Oval Cricket Ground" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[15px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0077CC]" />
                </div>
                <div className="mb-5">
                  <label className="block text-[12px] font-bold text-gray-500 mb-1.5 uppercase tracking-wider">Price override <span className="normal-case font-medium text-gray-400">(optional)</span></label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-gray-400 pointer-events-none">£</span>
                    <input type="text" value={formPrice} onChange={e => setFormPrice(e.target.value)} placeholder="Leave blank to use default rate" className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-[15px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0077CC]" />
                  </div>
                </div>
                {conflict && (
                  <div className="mb-4 flex items-start gap-2.5 bg-red-50 border border-red-200/70 rounded-xl px-4 py-3">
                    <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
                    <p className="text-[13px] font-medium text-red-700 leading-snug">{conflict.block.sport} on {DAY_FULL[conflict.day]} already has a block from {conflict.block.time}. Adjust the time or day.</p>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <button onClick={resetForm} className="text-[14px] font-bold text-gray-400 hover:text-gray-700 transition-colors">Cancel</button>
                  <button disabled={!!conflict || formDays.length === 0} className={`px-6 py-3 rounded-xl text-[14px] font-bold transition-colors flex items-center gap-2 ${conflict || formDays.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#0077CC] text-white hover:bg-[#0066AA]'}`}>
                    <Plus size={16} />Add this block
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddForm(true)} className="w-full py-4 border-2 border-[#0077CC] text-[#0077CC] rounded-xl font-bold text-[15px] hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                <Plus size={18} />Add another block
              </button>
            )}
          </div>
        )}

        {activeTab === 'blocked' && (
          <div className="flex flex-col">
            <h2 className="text-[18px] font-bold text-gray-900 mb-1">Blocked dates</h2>
            <p className="text-[14px] text-gray-500 font-medium mb-6 leading-relaxed">Block specific dates when you're not available — overrides your recurring schedule</p>
            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-6 mb-4">
              <div className="flex justify-between items-center mb-5 px-1">
                <span className="font-bold text-[16px] text-gray-900">{MONTH_NAMES[currentMonth]} {currentYear}</span>
                <div className="flex gap-1">
                  <button onClick={navigatePrev} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft size={18} /></button>
                  <button onClick={navigateNext} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight size={18} /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => <div key={d} className="text-center text-[12px] font-bold text-gray-400 py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((day, i) => {
                  const isCurrent = day.type === 'current'
                  const isStart = !!(rangeStart && sameDay(day.date, rangeStart))
                  const isEnd = !!(rangeEnd && sameDay(day.date, rangeEnd))
                  const isMid = !!(rangeStart && rangeEnd && !isStart && !isEnd && inRange(day.date, rangeStart, rangeEnd))
                  const isPreviewEnd = !!(previewEnd && sameDay(day.date, previewEnd))
                  const isPreviewMid = !!(rangeStart && previewEnd && !isStart && !isPreviewEnd && inRange(day.date, rangeStart, previewEnd))
                  const isBlocked = isCurrent && blockedRanges.some(r => inRange(day.date, r.start, r.end))
                  const hasRange = !!(rangeStart && rangeEnd && !isSingleDay)
                  const hasPreview = !!(rangeStart && !rangeEnd && previewEnd)
                  const showRightHalf = isStart && (hasRange || hasPreview)
                  const showLeftHalf = (isEnd && hasRange) || (isPreviewEnd && hasPreview)
                  let circle = 'relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium transition-colors select-none '
                  if (!isCurrent) circle += 'text-gray-300'
                  else if (isStart || isEnd) circle += 'bg-[#0077CC] text-white font-bold cursor-pointer'
                  else if (isPreviewEnd) circle += 'bg-[#0077CC]/80 text-white font-bold cursor-pointer'
                  else if (isMid || isPreviewMid) circle += 'text-[#0077CC] cursor-pointer'
                  else if (isBlocked) circle += 'bg-red-50 text-red-500 border border-red-100/80 cursor-pointer'
                  else circle += 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                  return (
                    <div key={i} className="relative flex items-center justify-center py-[3px]" onClick={() => isCurrent && handleDayClick(day)} onMouseEnter={() => isCurrent && setHoverDate(day.date)} onMouseLeave={() => setHoverDate(null)}>
                      {(isMid || isPreviewMid) && <div className="absolute inset-y-0 inset-x-0 bg-[#E6F3FB]" />}
                      {showRightHalf && <div className="absolute inset-y-0 left-1/2 right-0 bg-[#E6F3FB]" />}
                      {showLeftHalf && <div className="absolute inset-y-0 left-0 right-1/2 bg-[#E6F3FB]" />}
                      <div className={circle}>{day.date.getDate()}</div>
                      {sameDay(day.date, TODAY) && !isStart && !isEnd && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#0077CC] rounded-full z-20" />}
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-5 mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#0077CC]" /><span className="text-[12px] text-gray-500 font-medium">Selected</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#E6F3FB] border border-[#0077CC]/20" /><span className="text-[12px] text-gray-500 font-medium">In range</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-50 border border-red-200" /><span className="text-[12px] text-gray-500 font-medium">Already blocked</span></div>
              </div>
            </div>
            {rangeStart && (
              <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-4 mb-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[15px] font-bold text-gray-900">{fmt(rangeStart)}</span>
                  {rangeEnd && !isSingleDay && <><span className="text-gray-400 text-[15px]">→</span><span className="text-[15px] font-bold text-gray-900">{fmt(rangeEnd)}</span><span className="text-[13px] text-gray-500 font-medium">({daysBetween(rangeStart, rangeEnd)} days)</span></>}
                  {rangeEnd && isSingleDay && <span className="text-[13px] text-gray-500 font-medium">(1 day)</span>}
                  {!rangeEnd && <span className="text-[13px] text-gray-400 font-normal">— tap a second date to set a range</span>}
                </div>
                <input type="text" value={blockLabel} onChange={e => setBlockLabel(e.target.value)} placeholder="Add a label — e.g. Easter, Half term  (optional)" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0077CC] mb-3" />
                <div className="flex gap-2">
                  <button onClick={handleBlockDates} className="flex-1 py-2.5 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-xl text-[14px] font-bold transition-colors">Block these dates</button>
                  <button onClick={clearSelection} className="px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-[14px] font-bold hover:bg-gray-50 transition-colors">Clear</button>
                </div>
              </div>
            )}
            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-6">
              <h3 className="text-[15px] font-bold text-gray-900 mb-1">Blocked periods</h3>
              <p className="text-[13px] text-gray-400 font-medium mb-4">Parents and players won't be able to book on these dates</p>
              {blockedRanges.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3"><X size={18} className="text-gray-400" /></div>
                  <div className="text-[15px] font-bold text-gray-900 mb-1">No dates blocked</div>
                  <div className="text-[13px] text-gray-500 font-medium">Select dates on the calendar above to block them</div>
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-gray-100">
                  {blockedRanges.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-[14px] font-bold text-gray-900 shrink-0 tabular-nums">{fmt(item.start)}{!sameDay(item.start, item.end) && <> – {fmt(item.end)}</>}</span>
                        {item.label ? <span className="text-[14px] text-gray-500 font-medium truncate">{item.label}</span> : <span className="text-[13px] text-gray-300 font-medium italic">No label</span>}
                      </div>
                      <button onClick={() => setBlockedRanges(prev => prev.filter(r => r.id !== item.id))} className="ml-3 shrink-0 flex items-center gap-1 text-[13px] text-gray-400 hover:text-red-500 font-bold transition-colors"><X size={14} /> remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {activeTab === 'schedule' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-5 flex justify-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
          <div className="w-full max-w-[640px]">
            <button className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm">Save changes</button>
          </div>
        </div>
      )}
    </div>
  )
}
