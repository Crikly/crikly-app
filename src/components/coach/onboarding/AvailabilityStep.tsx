'use client'

import React, { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, X, Plus, ChevronDown, AlertTriangle } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'

const DAY_ABBR = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const DAY_FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
const REPEAT_OPTIONS = ['Weekly', 'Fortnightly', 'Monthly', 'One-off']

const TIME_OPTIONS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 22) TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:30`)
}

interface ScheduleBlock { id: number; day: string; sport: string; time: string; location: string; price: string }

export function AvailabilityStep() {
  const router = useRouter()
  const addFormRef = useRef<HTMLDivElement>(null)
  const [scheduleBlocks] = useState<ScheduleBlock[]>([
    { id: 1, day: 'Mon', sport: 'Cricket', time: '09:00 – 12:00', location: 'Oval Cricket Ground', price: '£50/60min' },
    { id: 2, day: 'Wed', sport: 'Cricket', time: '14:00 – 17:00', location: 'Kennington Park', price: '£60/60min' },
    { id: 3, day: 'Sat', sport: 'Tennis', time: '09:00 – 13:00', location: "Queen's Club", price: '£45/60min' },
  ])
  const availableSports = useMemo(() => [...new Set(scheduleBlocks.map(b => b.sport))], [scheduleBlocks])
  const [showAddForm, setShowAddForm] = useState(false)
  const [preselectedDay, setPreselectedDay] = useState<string | null>(null)
  const [formSport, setFormSport] = useState(availableSports[0] ?? '')
  const [formDays, setFormDays] = useState<string[]>([])
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('10:00')
  const [formRepeat, setFormRepeat] = useState('Weekly')
  const [formVenue, setFormVenue] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const toggleDay = (day: string) => setFormDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }
  
  const conflict = useMemo(() => {
    for (const day of formDays) {
      const existingBlocks = scheduleBlocks.filter(b => b.day === day)
      for (const existing of existingBlocks) {
        const [existStartStr, existEndStr] = existing.time.split(' – ')
        const existStart = timeToMinutes(existStartStr)
        const existEnd = timeToMinutes(existEndStr)
        const newStart = timeToMinutes(formStartTime)
        const newEnd = timeToMinutes(formEndTime)
        
        if (newStart < existEnd && newEnd > existStart) {
          return { day, block: existing, message: 'This slot overlaps with an existing block. Choose a different time.' }
        }
      }
    }
    return null
  }, [formSport, formDays, formStartTime, formEndTime, scheduleBlocks])
  
  const resetForm = () => { 
    setFormSport(availableSports[0] ?? '')
    setFormDays([])
    setFormStartTime('09:00')
    setFormEndTime('10:00')
    setFormRepeat('Weekly')
    setFormVenue('')
    setFormPrice('')
    setShowAddForm(false)
    setPreselectedDay(null)
  }
  
  React.useEffect(() => {
    if (showAddForm && preselectedDay && !formDays.includes(preselectedDay)) {
      setFormDays([preselectedDay])
    }
  }, [showAddForm, preselectedDay])

  const activeDays = useMemo(() => {
    const days = new Set(scheduleBlocks.map(b => b.day))
    return Array.from(days).sort((a, b) => DAY_ABBR.indexOf(a) - DAY_ABBR.indexOf(b))
  }, [scheduleBlocks])

  const lowestPrice = useMemo(() => {
    if (scheduleBlocks.length === 0) return null
    const prices = scheduleBlocks.map(b => parseInt(b.price.replace(/[^\d]/g, '')))
    return Math.min(...prices)
  }, [scheduleBlocks])

  return (
    <div className="flex w-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center pt-10 pb-32 min-h-screen bg-white">
        <div className="w-full max-w-[640px] px-6">
          <div className="mb-8">
            <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Your availability</h1>
            <p className="text-[16px] text-gray-500 font-medium">Set when you're available to coach</p>
          </div>

          <div className="flex flex-col pb-20">
            <div className="flex flex-col gap-6 mb-6">
              {DAY_ABBR.map((dayAbbr) => {
                const dayFull = DAY_FULL[dayAbbr]
                const blocksForDay = scheduleBlocks.filter(b => b.day === dayAbbr)
                
                return (
                  <div key={dayAbbr}>
                    <h3 className="text-[12px] text-gray-400 uppercase tracking-wider mb-1.5">{dayFull}</h3>
                    
                    {blocksForDay.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {blocksForDay.map((blockForDay) => (
                          <div 
                            key={blockForDay.id}
                            className="rounded-xl cursor-pointer overflow-hidden"
                            style={{ 
                              background: '#FFFFFF',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                              transition: 'all 150ms ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                              e.currentTarget.style.transform = 'scale(1.005)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
                              e.currentTarget.style.transform = 'scale(1)'
                            }}
                          >
                            <div className="px-4 py-3 flex items-center gap-3">
                              <div className="w-[42px] h-[42px] bg-[#E6F1FB] rounded-[10px] flex items-center justify-center shrink-0">
                                <span className="text-[#0C447C] text-[11px] font-medium">{dayAbbr}</span>
                              </div>
                              
                              <div className="flex-1 flex flex-col">
                                <div className="text-[13px] font-medium text-gray-900">
                                  {blockForDay.sport} · {blockForDay.time}
                                </div>
                                <div className="text-[11px] text-gray-500">
                                  {blockForDay.location} · {blockForDay.price}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                  }}
                                  className="w-7 h-7 flex items-center justify-center border-[0.5px] border-gray-100 bg-white rounded-md hover:bg-gray-50 transition-colors"
                                >
                                  <Pencil size={12} className="text-gray-400" />
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation()
                                  }}
                                  className="w-7 h-7 flex items-center justify-center border-[0.5px] border-gray-100 bg-white rounded-md hover:bg-gray-50 transition-colors"
                                >
                                  <X size={12} className="text-gray-400" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div 
                        className="rounded-xl cursor-pointer"
                        style={{ 
                          background: '#FFFFFF',
                          border: '1.5px dashed #B5D4F4',
                          transition: 'background 150ms ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#F0F7FF'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#FFFFFF'
                        }}
                        onClick={() => {
                          setPreselectedDay(dayAbbr)
                          setShowAddForm(true)
                          setTimeout(() => {
                            addFormRef.current?.scrollIntoView({ 
                              behavior: 'smooth', 
                              block: 'start' 
                            })
                          }, 50)
                        }}
                      >
                        <div className="px-4 py-3 flex items-center gap-3">
                          <div className="w-[42px] h-[42px] bg-[#F0F7FF] rounded-[10px] flex items-center justify-center shrink-0">
                            <span className="text-[#B5D4F4] text-[11px] font-medium">{dayAbbr}</span>
                          </div>
                          
                          <div className="flex-1 flex flex-col">
                            <div className="text-[12px] font-medium text-[#0077CC]">
                              + Add availability
                            </div>
                            <div className="text-[11px] text-[#85B7EB]">
                              No slots on {dayFull} yet
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {showAddForm ? (
              <div ref={addFormRef} className="border border-gray-200 rounded-xl p-5 bg-white shadow-sm">
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
                    <p className="text-[13px] font-medium text-red-700 leading-snug">{conflict.message}</p>
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
              <button 
                onClick={() => {
                  setShowAddForm(true)
                  setTimeout(() => {
                    addFormRef.current?.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'start' 
                    })
                  }, 50)
                }} 
                className="w-full rounded-xl font-medium text-[13px] flex items-center justify-center gap-2 transition-colors"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px dashed #0077CC',
                  color: '#0077CC',
                  padding: '12px 16px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#E6F1FB'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#FFFFFF'
                }}
              >
                <Plus size={16} />Add another block
              </button>
            )}
            
            {/* Onboarding footer CTA */}
            <div 
              className="sticky bottom-0 bg-white border-t-[0.5px] border-gray-100 px-6 py-3 flex justify-between items-center"
              style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}
            >
              <button 
                onClick={() => router.push('/coach/onboarding/qualifications')}
                className="text-[13px] text-gray-500 hover:text-gray-900 font-medium transition-colors"
              >
                ← Back
              </button>
              <button 
                onClick={() => router.push('/coach/onboarding/policy')}
                className="bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full px-7 py-2.5 text-[13px] font-medium transition-colors"
              >
                Save & continue →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName="Alex Johnson"
        sport="Cricket"
        location="London"
        availabilityDays={activeDays}
        priceFromPence={lowestPrice ? lowestPrice * 100 : undefined}
        isDbs={true}
        infoBox={scheduleBlocks.length > 0 ? {
          type: 'success',
          message: '✓ Your availability is visible to parents',
          subMessage: 'Parents can see your available days in search results'
        } : {
          type: 'neutral',
          message: 'Add your first availability block so parents can book you'
        }}
      />
    </div>
  )
}
