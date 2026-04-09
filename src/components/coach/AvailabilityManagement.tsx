'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, X, Edit2, Trash2, AlertCircle } from 'lucide-react'

interface AvailabilityBlock {
  id: string
  sport: string
  days: string[]
  timeFrom: string
  timeTo: string
  repeat: 'Weekly' | 'Fortnightly' | 'Monthly' | 'One-off'
  venue?: string
  price?: number
}

interface BlockedDateRange {
  id: string
  startDate: Date
  endDate: Date
  label: string
}

const SPORTS = ['Cricket', 'Football', 'Tennis', 'Rugby', 'Hockey']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const REPEAT_OPTIONS = ['Weekly', 'Fortnightly', 'Monthly', 'One-off']

function buildCalendar(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = (firstDay.getDay() + 6) % 7
  const daysInMonth = lastDay.getDate()
  
  const weeks: (Date | null)[][] = []
  let currentWeek: (Date | null)[] = Array(startDayOfWeek).fill(null)
  
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(new Date(year, month, day))
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }
  
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null)
    }
    weeks.push(currentWeek)
  }
  
  return weeks
}

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let hour = 6; hour <= 22; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const h = hour.toString().padStart(2, '0')
      const m = min.toString().padStart(2, '0')
      slots.push(`${h}:${m}`)
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

export function AvailabilityManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'schedule' | 'blocked'>('schedule')
  const [showAddForm, setShowAddForm] = useState(false)
  
  // Schedule tab state
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([
    {
      id: '1',
      sport: 'Cricket',
      days: ['Mon', 'Wed', 'Fri'],
      timeFrom: '14:00',
      timeTo: '16:00',
      repeat: 'Weekly',
      venue: "Lord's Indoor Centre",
      price: 45
    },
    {
      id: '2',
      sport: 'Cricket',
      days: ['Sat'],
      timeFrom: '09:00',
      timeTo: '12:00',
      repeat: 'Weekly',
      venue: 'The Oval Nets',
      price: 60
    }
  ])
  
  const [newBlock, setNewBlock] = useState<Partial<AvailabilityBlock>>({
    sport: '',
    days: [],
    timeFrom: '09:00',
    timeTo: '10:00',
    repeat: 'Weekly',
    venue: '',
    price: undefined
  })
  
  // Blocked dates tab state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [rangeStart, setRangeStart] = useState<Date | null>(null)
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null)
  const [rangeLabel, setRangeLabel] = useState('')
  const [blockedRanges, setBlockedRanges] = useState<BlockedDateRange[]>([
    {
      id: '1',
      startDate: new Date(2026, 4, 20),
      endDate: new Date(2026, 4, 27),
      label: 'Summer Holiday'
    }
  ])
  
  const handleDayClick = (date: Date) => {
    if (!rangeStart) {
      setRangeStart(date)
      setRangeEnd(null)
    } else if (!rangeEnd) {
      if (date >= rangeStart) {
        setRangeEnd(date)
      } else {
        setRangeStart(date)
        setRangeEnd(null)
      }
    } else {
      setRangeStart(date)
      setRangeEnd(null)
    }
  }
  
  const isDateInRange = (date: Date, start: Date, end: Date): boolean => {
    return date >= start && date <= end
  }
  
  const isDateBlocked = (date: Date): boolean => {
    return blockedRanges.some(range => isDateInRange(date, range.startDate, range.endDate))
  }
  
  const isDateInCurrentSelection = (date: Date): boolean => {
    if (!rangeStart) return false
    if (!rangeEnd) return date.getTime() === rangeStart.getTime()
    return isDateInRange(date, rangeStart, rangeEnd)
  }
  
  const handleAddBlock = () => {
    if (!newBlock.sport || !newBlock.days || newBlock.days.length === 0) return
    
    const block: AvailabilityBlock = {
      id: Date.now().toString(),
      sport: newBlock.sport,
      days: newBlock.days,
      timeFrom: newBlock.timeFrom || '09:00',
      timeTo: newBlock.timeTo || '10:00',
      repeat: newBlock.repeat || 'Weekly',
      venue: newBlock.venue,
      price: newBlock.price
    }
    
    setBlocks([...blocks, block])
    setNewBlock({
      sport: '',
      days: [],
      timeFrom: '09:00',
      timeTo: '10:00',
      repeat: 'Weekly',
      venue: '',
      price: undefined
    })
    setShowAddForm(false)
  }
  
  const handleBlockDates = () => {
    if (!rangeStart || !rangeEnd || !rangeLabel) return
    
    const range: BlockedDateRange = {
      id: Date.now().toString(),
      startDate: rangeStart,
      endDate: rangeEnd,
      label: rangeLabel
    }
    
    setBlockedRanges([...blockedRanges, range])
    setRangeStart(null)
    setRangeEnd(null)
    setRangeLabel('')
  }
  
  const hasConflict = (): boolean => {
    if (!newBlock.sport || !newBlock.days) return false
    return blocks.some(block => 
      block.sport === newBlock.sport && 
      block.days.some(day => newBlock.days?.includes(day))
    )
  }
  
  const calendar = buildCalendar(currentDate.getFullYear(), currentDate.getMonth())
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md bg-gray-50 min-h-screen">
        {/* Header */}
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10 shadow-sm">
          <button
            onClick={() => router.push('/coach/dashboard')}
            className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-6 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Dashboard</span>
          </button>
          <h1 className="text-[28px] font-bold text-gray-900 leading-tight mb-4">Availability</h1>
          
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`flex-1 pb-3 text-[15px] font-bold transition-colors ${
                activeTab === 'schedule'
                  ? 'text-[#0077CC] border-b-2 border-[#0077CC]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Schedule
            </button>
            <button
              onClick={() => setActiveTab('blocked')}
              className={`flex-1 pb-3 text-[15px] font-bold transition-colors ${
                activeTab === 'blocked'
                  ? 'text-[#0077CC] border-b-2 border-[#0077CC]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Blocked dates
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-5 pb-32">
          {activeTab === 'schedule' ? (
            <div className="flex flex-col gap-4">
              {/* Existing blocks */}
              {blocks.map(block => (
                <div key={block.id} className="bg-white border border-[#E2E8F0] rounded-[16px] p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-[16px] font-bold text-gray-900 mb-1">{block.sport}</h3>
                      <p className="text-[13px] text-gray-500 font-medium">{block.days.join(', ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 text-gray-400 hover:text-[#0077CC] transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setBlocks(blocks.filter(b => b.id !== block.id))}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-[14px]">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Time</span>
                      <span className="font-medium text-gray-900">{block.timeFrom} - {block.timeTo}</span>
                    </div>
                    {block.venue && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Venue</span>
                        <span className="font-medium text-gray-900">{block.venue}</span>
                      </div>
                    )}
                    {block.price && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Price</span>
                        <span className="font-medium text-gray-900">£{block.price}/session</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Repeat</span>
                      <span className="font-medium text-gray-900">{block.repeat}</span>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Add block form */}
              {!showAddForm ? (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full py-4 border-2 border-dashed border-gray-300 rounded-[16px] text-gray-500 hover:border-[#0077CC] hover:text-[#0077CC] font-bold text-[15px] transition-colors flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  Add availability block
                </button>
              ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-[17px] font-bold text-gray-900">New availability block</h3>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  
                  {/* Sport */}
                  <div className="mb-4">
                    <label className="block text-[13px] font-bold text-gray-700 mb-2">Sport</label>
                    <select
                      value={newBlock.sport}
                      onChange={(e) => setNewBlock({ ...newBlock, sport: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent"
                    >
                      <option value="">Select sport</option>
                      {SPORTS.map(sport => (
                        <option key={sport} value={sport}>{sport}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Days */}
                  <div className="mb-4">
                    <label className="block text-[13px] font-bold text-gray-700 mb-2">Days</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map(day => (
                        <button
                          key={day}
                          onClick={() => {
                            const days = newBlock.days || []
                            setNewBlock({
                              ...newBlock,
                              days: days.includes(day)
                                ? days.filter(d => d !== day)
                                : [...days, day]
                            })
                          }}
                          className={`px-4 py-2 rounded-full text-[13px] font-bold transition-colors ${
                            newBlock.days?.includes(day)
                              ? 'bg-[#0077CC] text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Time */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">From</label>
                      <select
                        value={newBlock.timeFrom}
                        onChange={(e) => setNewBlock({ ...newBlock, timeFrom: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent"
                      >
                        {TIME_SLOTS.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[13px] font-bold text-gray-700 mb-2">To</label>
                      <select
                        value={newBlock.timeTo}
                        onChange={(e) => setNewBlock({ ...newBlock, timeTo: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent"
                      >
                        {TIME_SLOTS.map(time => (
                          <option key={time} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  {/* Repeat */}
                  <div className="mb-4">
                    <label className="block text-[13px] font-bold text-gray-700 mb-2">Repeat</label>
                    <select
                      value={newBlock.repeat}
                      onChange={(e) => setNewBlock({ ...newBlock, repeat: e.target.value as any })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent"
                    >
                      {REPEAT_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Venue (optional) */}
                  <div className="mb-4">
                    <label className="block text-[13px] font-bold text-gray-700 mb-2">Venue (optional)</label>
                    <input
                      type="text"
                      value={newBlock.venue || ''}
                      onChange={(e) => setNewBlock({ ...newBlock, venue: e.target.value })}
                      placeholder="e.g. Lord's Indoor Centre"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent"
                    />
                  </div>
                  
                  {/* Price override (optional) */}
                  <div className="mb-4">
                    <label className="block text-[13px] font-bold text-gray-700 mb-2">Price override (optional)</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">£</span>
                      <input
                        type="number"
                        value={newBlock.price || ''}
                        onChange={(e) => setNewBlock({ ...newBlock, price: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="45"
                        className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent"
                      />
                    </div>
                  </div>
                  
                  {/* Conflict warning */}
                  {hasConflict() && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                      <AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-[13px] text-amber-800 font-medium">
                        You already have a {newBlock.sport} block on {newBlock.days?.join(', ')}
                      </p>
                    </div>
                  )}
                  
                  <button
                    onClick={handleAddBlock}
                    disabled={!newBlock.sport || !newBlock.days || newBlock.days.length === 0}
                    className="w-full py-3 border-2 border-[#0077CC] text-[#0077CC] rounded-xl font-bold text-[15px] hover:bg-[#0077CC] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add this block
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Calendar */}
              <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <button
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                    className="p-2 text-gray-600 hover:text-[#0077CC] transition-colors"
                  >
                    <ArrowLeft size={20} />
                  </button>
                  <h3 className="text-[16px] font-bold text-gray-900">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h3>
                  <button
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                    className="p-2 text-gray-600 hover:text-[#0077CC] transition-colors rotate-180"
                  >
                    <ArrowLeft size={20} />
                  </button>
                </div>
                
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                    <div key={i} className="text-center text-[11px] font-bold text-gray-400 uppercase py-2">
                      {day}
                    </div>
                  ))}
                </div>
                
                {/* Calendar grid */}
                <div className="flex flex-col gap-1">
                  {calendar.map((week, weekIdx) => (
                    <div key={weekIdx} className="grid grid-cols-7 gap-1">
                      {week.map((date, dayIdx) => {
                        if (!date) {
                          return <div key={dayIdx} className="aspect-square" />
                        }
                        
                        const isBlocked = isDateBlocked(date)
                        const isSelected = isDateInCurrentSelection(date)
                        const isToday = date.toDateString() === new Date().toDateString()
                        
                        return (
                          <button
                            key={dayIdx}
                            onClick={() => handleDayClick(date)}
                            className={`aspect-square flex items-center justify-center text-[14px] font-medium rounded-full transition-colors ${
                              isSelected
                                ? 'bg-[#0077CC] text-white'
                                : isBlocked
                                ? 'bg-[#0077CC]/10 text-[#0077CC]'
                                : isToday
                                ? 'bg-gray-100 text-gray-900 font-bold'
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {date.getDate()}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Range label input */}
              {rangeStart && rangeEnd && (
                <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
                  <label className="block text-[13px] font-bold text-gray-700 mb-2">
                    Label for {rangeStart.toLocaleDateString()} - {rangeEnd.toLocaleDateString()}
                  </label>
                  <input
                    type="text"
                    value={rangeLabel}
                    onChange={(e) => setRangeLabel(e.target.value)}
                    placeholder="e.g. Summer Holiday"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent mb-3"
                  />
                  <button
                    onClick={handleBlockDates}
                    disabled={!rangeLabel}
                    className="w-full py-3 bg-[#0077CC] text-white rounded-xl font-bold text-[15px] hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Plus size={18} />
                    Block these dates
                  </button>
                </div>
              )}
              
              {/* Blocked ranges list */}
              {blockedRanges.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[15px] font-bold text-gray-900">Blocked periods</h3>
                  {blockedRanges.map(range => (
                    <div key={range.id} className="bg-white border border-[#E2E8F0] rounded-[16px] p-4 shadow-sm flex justify-between items-center">
                      <div>
                        <h4 className="text-[15px] font-bold text-gray-900 mb-1">{range.label}</h4>
                        <p className="text-[13px] text-gray-500 font-medium">
                          {range.startDate.toLocaleDateString()} - {range.endDate.toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => setBlockedRanges(blockedRanges.filter(r => r.id !== range.id))}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
