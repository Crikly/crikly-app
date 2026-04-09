'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, Check, X, Plus, MapPin, Calendar, ChevronRight } from 'lucide-react'

interface Block {
  id: string
  sport: string
  days: string[]
  from: string
  to: string
  venue: string
  price: string
}

export function AvailabilityStep() {
  const router = useRouter()
  const [selectedSport, setSelectedSport] = useState('Cricket')
  const [defaultPrices, setDefaultPrices] = useState([
    { id: '1', duration: '60 min', price: '50' },
    { id: '2', duration: '90 min', price: '70' },
  ])
  const [selectedDays, setSelectedDays] = useState<string[]>(['Mon'])
  const [fromTime, setFromTime] = useState('09:00')
  const [toTime, setToTime] = useState('12:00')
  const [isWeekly, setIsWeekly] = useState(true)
  const [venue, setVenue] = useState('')
  const [showOverride, setShowOverride] = useState(false)
  const [overridePrice, setOverridePrice] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saving, setSaving] = useState(false)

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const timeOptions = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  const handleAddBlock = () => {
    if (selectedDays.length === 0) return
    const default60 = defaultPrices.find(p => p.duration === '60 min')?.price || '50'
    setBlocks([...blocks, {
      id: Math.random().toString(36).substr(2, 9),
      sport: selectedSport,
      days: [...selectedDays],
      from: fromTime,
      to: toTime,
      venue: venue.trim(),
      price: overridePrice.trim() || default60
    }])
    setVenue('')
    setOverridePrice('')
    setShowOverride(false)
  }

  const removeBlock = (id: string) => setBlocks(blocks.filter(b => b.id !== id))

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/coaches/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      })
      router.push('/coach/onboarding/policy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pb-32">
      <div className="w-full max-w-[640px] px-6 pt-10">
        <div className="mb-8">
          <button onClick={() => router.push('/coach/onboarding/qualifications')} className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-8 transition-colors">
            <ArrowLeft size={18} /><span>Dashboard</span>
          </button>
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Your availability</h1>
          <p className="text-[16px] text-gray-500 font-medium">Set when you're available to coach</p>
        </div>

        <div className="mb-8">
          <label className="text-[14px] font-bold text-gray-900 mb-2 block">Sport</label>
          <div className="relative">
            <select value={selectedSport} onChange={(e) => setSelectedSport(e.target.value)} className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all cursor-pointer font-bold shadow-sm">
              <option>Cricket</option><option>Football</option><option>Tennis</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><ChevronDown size={18} className="text-gray-500" /></div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Pricing card */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900">1-on-1 pricing for {selectedSport}</h2>
            <p className="text-[14px] text-gray-500 font-medium mt-1 mb-6">Your default price — applies to all {selectedSport} blocks unless you override it</p>
            <div className="flex flex-col gap-4">
              {defaultPrices.map((row, idx) => (
                <div key={row.id} className="flex items-center gap-4">
                  <div className="relative w-[120px] sm:w-[140px]">
                    <select className="w-full pl-4 pr-10 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] outline-none cursor-pointer font-bold" defaultValue={row.duration}>
                      <option>{row.duration}</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><ChevronDown size={18} className="text-gray-400" /></div>
                  </div>
                  <div className="flex-1 relative max-w-[140px]">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-gray-500 font-bold">£</span></div>
                    <input type="text" defaultValue={row.price} className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-gray-200 text-[15px] font-bold text-gray-900 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all" />
                  </div>
                  {idx > 0 && <button onClick={() => setDefaultPrices(defaultPrices.filter(p => p.id !== row.id))} className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"><X size={18} /></button>}
                </div>
              ))}
              <button className="flex items-center gap-1.5 text-[#0077CC] font-bold text-[14px] hover:text-blue-800 transition-colors w-fit mt-1"><Plus size={16} />Add duration</button>
            </div>
          </div>

          {/* Add block card */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Add a block</h2>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">Days</label>
                <div className="flex flex-wrap gap-2 sm:flex-nowrap sm:justify-between">
                  {days.map((day) => (
                    <button key={day} onClick={() => toggleDay(day)} className={`flex-1 min-w-[50px] py-3 rounded-xl text-[14px] font-bold transition-all border ${selectedDays.includes(day) ? 'bg-[#0077CC] border-[#0077CC] text-white shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[14px] font-bold text-gray-900">Time</label>
                <div className="flex items-center gap-4">
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-[14px] text-gray-500 font-medium w-10">From</span>
                    <div className="relative flex-1">
                      <select value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="w-full pl-4 pr-10 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] outline-none cursor-pointer font-medium">
                        {timeOptions.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><ChevronDown size={18} className="text-gray-400" /></div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-[14px] text-gray-500 font-medium w-6">To</span>
                    <div className="relative flex-1">
                      <select value={toTime} onChange={(e) => setToTime(e.target.value)} className="w-full pl-4 pr-10 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 bg-white appearance-none focus:border-[#0077CC] outline-none cursor-pointer font-medium">
                        {timeOptions.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"><ChevronDown size={18} className="text-gray-400" /></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 cursor-pointer mt-2" onClick={() => setIsWeekly(!isWeekly)}>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border transition-colors ${isWeekly ? 'bg-[#0077CC] border-[#0077CC]' : 'bg-white border-gray-300'}`}>
                  {isWeekly && <Check size={16} className="text-white" />}
                </div>
                <span className="text-[15px] font-bold text-gray-900">Repeat weekly</span>
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <label className="text-[14px] font-bold text-gray-900">Venue <span className="text-gray-400 font-normal ml-1">(optional)</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><MapPin size={18} className="text-gray-400" /></div>
                  <input type="text" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Oval Cricket Ground" className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all" />
                </div>
              </div>

              <div className="flex flex-col mt-2">
                <button onClick={() => setShowOverride(!showOverride)} className="text-[14px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors w-fit">
                  <ChevronRight size={16} className={`transition-transform ${showOverride ? 'rotate-90' : ''}`} />
                  Override price for this block
                </button>
                {showOverride && (
                  <div className="mt-4 flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                      <div className="w-[100px] font-bold text-[14px] text-gray-900 pl-1">60 min</div>
                      <div className="flex-1 relative max-w-[140px]">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><span className="text-gray-500 font-bold">£</span></div>
                        <input type="text" placeholder={defaultPrices.find(p => p.duration === '60 min')?.price || '50'} value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} className="w-full pl-8 pr-4 py-3.5 rounded-xl border border-gray-200 text-[15px] font-bold text-gray-900 placeholder:text-gray-300 focus:border-[#0077CC] focus:ring-1 focus:ring-[#0077CC] outline-none transition-all" />
                      </div>
                    </div>
                    <p className="text-[13px] text-gray-500 font-medium sm:pl-[116px]">Leave blank to use your default price</p>
                  </div>
                )}
              </div>

              <button onClick={handleAddBlock} className="mt-4 w-full py-4 rounded-xl border-2 border-[#0077CC] text-[#0077CC] font-bold text-[15px] hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                <Plus size={18} strokeWidth={2.5} />Add this block
              </button>
            </div>
          </div>

          {/* Availability summary */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-20">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Your availability</h2>
            {blocks.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4"><Calendar size={24} className="text-gray-300" /></div>
                <p className="text-[15px] text-gray-500 font-medium">No availability added yet.<br/>Add your first block above.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {blocks.map((block) => (
                  <div key={block.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                    <div className="flex flex-wrap items-center gap-2 text-[14px]">
                      <span className="font-bold text-gray-900">{block.days.join(', ')}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-gray-600">{block.sport}</span>
                      <span className="text-gray-300">•</span>
                      <span className="text-gray-600">{block.from}–{block.to}</span>
                      {block.venue && <><span className="text-gray-300">•</span><span className="text-gray-600">{block.venue}</span></>}
                      <span className="text-gray-300">•</span>
                      <span className="font-medium text-gray-900">£{block.price}/60min</span>
                    </div>
                    <button onClick={() => removeBlock(block.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 shrink-0 ml-2"><X size={18} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-6 flex justify-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <div className="w-full max-w-[640px] flex flex-col gap-3">
          <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2">
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
          <button onClick={() => router.push('/coach/dashboard')} className="w-full py-3 text-gray-500 hover:text-gray-900 font-bold text-[14px] transition-colors">Save & go back to dashboard</button>
        </div>
      </div>
    </div>
  )
}
