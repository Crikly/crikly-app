'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Calendar, Users, Tag, Plus, BookOpen, X, Loader2 } from 'lucide-react'

type Tab = 'Active' | 'Draft'

// CD-08: API response types
interface ProgrammeResponse {
  id: string
  sport_id: string
  sport_name: string
  title: string
  description: string | null
  schedule_type: string
  day_of_week: number | null
  day_name: string | null
  start_time: string | null
  duration_minutes: number
  max_spots: number
  current_spots: number
  spots_remaining: number
  payment_type: string
  price_per_session_pence: number
  block_price_pence: number | null
  block_session_count: number | null
  currency: string
  status: string
  created_at: string
}

interface CoachSport {
  sport_id: string
  sport_name: string
}

// UI Programme type
interface Programme { 
  id: string
  name: string
  schedule: string
  spotsFilled: number
  spotsTotal: number
  price: string
  status: 'Active' | 'Full' | 'Draft'
}

export function ProgrammesManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Active')
  
  // CD-08: Real data state
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)

  // CD-08: Fetch programmes — extracted to useCallback so form can re-fetch on success
  const fetchProgrammes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/coaches/programmes')
      if (!response.ok) throw new Error('Failed to fetch programmes')

      const data = await response.json()

      const transformed: Programme[] = (data.programmes || []).map((prog: ProgrammeResponse) => {
        const dayName = prog.day_name || 'Day'
        const startTime = prog.start_time ? prog.start_time.substring(0, 5) : '00:00'
        const endTime = calculateEndTime(startTime, prog.duration_minutes)
        const schedule = `Every ${dayName.substring(0, 3)} · ${startTime} – ${endTime}`

        let price = ''
        if (prog.payment_type === 'per_session') {
          price = `£${(prog.price_per_session_pence / 100).toFixed(0)} per session`
        } else if (prog.payment_type === 'block_upfront' && prog.block_price_pence && prog.block_session_count) {
          price = `£${(prog.block_price_pence / 100).toFixed(0)} for ${prog.block_session_count} sessions`
        }

        let status: 'Active' | 'Full' | 'Draft' = 'Draft'
        if (prog.status === 'active') {
          status = prog.current_spots >= prog.max_spots ? 'Full' : 'Active'
        }

        return { id: prog.id, name: prog.title, schedule, spotsFilled: prog.current_spots, spotsTotal: prog.max_spots, price, status }
      })

      setProgrammes(transformed)
    } catch {
      setError('Failed to load programmes. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProgrammes() }, [fetchProgrammes])
  
  // Helper to calculate end time
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number)
    const totalMinutes = hours * 60 + minutes + durationMinutes
    const endHours = Math.floor(totalMinutes / 60) % 24
    const endMinutes = totalMinutes % 60
    return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`
  }
  const getStatusStyles = (status: Programme['status']) => {
    switch (status) {
      case 'Active': return 'bg-[#DCFCE7] text-[#15803D]'
      case 'Full': return 'bg-[#0077CC] text-white'
      case 'Draft': return 'bg-[#F3F4F6] text-[#6B7280]'
      default: return 'bg-gray-100 text-gray-800'
    }
  }
  
  // CD-08: Filter programmes by tab
  const activeProgrammes = programmes.filter(p => p.status === 'Active' || p.status === 'Full')
  const draftProgrammes = programmes.filter(p => p.status === 'Draft')
  const currentProgrammes = activeTab === 'Active' ? activeProgrammes : draftProgrammes
  
  // CF-D05 CHANGE 1: Calculate subtitle stats
  const activeCount = activeProgrammes.filter(p => p.status === 'Active').length
  const fullCount = activeProgrammes.filter(p => p.status === 'Full').length
  const leastFullProgramme = activeProgrammes
    .filter(p => p.status === 'Active')
    .sort((a, b) => (a.spotsFilled / a.spotsTotal) - (b.spotsFilled / b.spotsTotal))[0]
  const spotsRemaining = leastFullProgramme ? leastFullProgramme.spotsTotal - leastFullProgramme.spotsFilled : 0

  return (
    <div className="min-h-screen bg-white font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-2 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Programmes</h1>
            <button onClick={() => setShowCreateForm(true)} className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-3.5 py-2 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"><Plus size={16} />New Programme</button>
          </div>
          {/* CF-D05 CHANGE 1: State-aware subtitle */}
          <p className="text-[13px] text-gray-500 mt-1 mb-4">
            {activeCount} active · {fullCount} full{spotsRemaining > 0 && leastFullProgramme ? ` · ${spotsRemaining} spots available in ${leastFullProgramme.name}` : ''}
          </p>
          <div className="flex items-center gap-6 border-b border-gray-100">
            {(['Active', 'Draft'] as Tab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-[15px] font-bold transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-[#0077CC]' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab}
                {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#0077CC]" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 px-5 py-5 space-y-3" style={{ background: 'transparent' }}>
          {/* CD-08: Loading state */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
              <p className="text-[14px] text-gray-500">Loading programmes...</p>
            </div>
          ) : error ? (
            // CD-08: Error state
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">⚠</span>
              </div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">Failed to load programmes</h3>
              <p className="text-[14px] text-gray-500 mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : currentProgrammes.length > 0 ? currentProgrammes.map(programme => {
            const fillPercentage = (programme.spotsFilled / programme.spotsTotal) * 100
            const isDraft = programme.status === 'Draft'
            const isFull = programme.status === 'Full'
            const spotsRemaining = programme.spotsTotal - programme.spotsFilled
            
            // CF-D05 CHANGE 2: Fill rate colors
            const getFillValueColor = () => {
              if (fillPercentage < 25) return '#92400E'
              return '#1F2937'
            }
            const getBarColor = () => {
              if (fillPercentage < 25) return '#F59E0B'
              return '#0077CC'
            }
            const getSpotsTextColor = () => {
              if (fillPercentage < 25) return '#92400E'
              return '#6B7280'
            }
            
            return (
              <div 
                key={programme.id} 
                className={`rounded-xl cursor-pointer overflow-hidden ${isDraft ? 'opacity-80' : ''}`}
                style={{ 
                  background: isFull ? '#F0F7FF' : '#FFFFFF',
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
                onClick={() => router.push(`/coach/programmes/${programme.id}`)}
              >
                <div className="p-4">
                  {/* CF-D05 CHANGE 2: Restructured card */}
                  {/* 1. Programme name + status badge */}
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="text-[14px] font-medium text-gray-900 leading-tight">{programme.name}</h3>
                    <div className={`px-2.5 py-1 rounded-full text-[12px] font-bold shrink-0 ${getStatusStyles(programme.status)}`}>{programme.status}</div>
                  </div>
                  
                  {/* 2. Schedule meta */}
                  <div className="flex items-center gap-2 text-gray-500 mb-2">
                    <Calendar size={14} className="text-gray-400 shrink-0" />
                    <span className="text-[12px]">{programme.schedule}</span>
                  </div>
                  
                  {/* 3. Price meta */}
                  <div className="flex items-center gap-2 text-gray-500 mb-3">
                    <Tag size={14} className="text-gray-400 shrink-0" />
                    <span className="text-[12px]">{programme.price}</span>
                  </div>
                  
                  {/* 4. Fill rate section */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-gray-400">Fill rate</span>
                      <span 
                        className="text-[13px] font-medium"
                        style={{ color: isFull ? '#0077CC' : getFillValueColor() }}
                      >
                        {isFull ? '100% full' : `${Math.round(fillPercentage)}% full`}
                      </span>
                    </div>
                    <div className="h-[6px] bg-gray-100 rounded-full overflow-hidden mb-1.5">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${fillPercentage}%`,
                          backgroundColor: isFull ? '#0077CC' : getBarColor()
                        }}
                      />
                    </div>
                    <p 
                      className="text-[11px]"
                      style={{ color: isFull ? '#0077CC' : getSpotsTextColor() }}
                    >
                      {isFull 
                        ? `All ${programme.spotsTotal} spots filled · open a new cohort?`
                        : `${programme.spotsFilled} / ${programme.spotsTotal} spots filled · ${spotsRemaining} remaining`
                      }
                    </p>
                  </div>
                  
                  {/* 5. Price + chevron row */}
                  <div className="flex items-center justify-between pt-2 border-t-[0.5px] border-gray-100">
                    <span className="text-[16px] font-bold text-gray-900">{programme.price.split(' ')[0]}</span>
                    <ChevronRight size={20} className="text-gray-400" />
                  </div>
                </div>
                
                {/* CF-D05 CHANGE 4: Quick action row */}
                <div className="border-t-[0.5px] border-gray-100 px-4 py-2 flex gap-2 bg-white">
                  {isDraft ? (
                    // Draft programme actions
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Publish action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                      >
                        Publish
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Edit action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Delete action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-red-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                      >
                        Delete
                      </button>
                    </>
                  ) : isFull ? (
                    // Full programme actions
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Open new cohort action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                      >
                        Open new cohort ↗
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Duplicate action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Duplicate
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Manage action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Manage →
                      </button>
                    </>
                  ) : (
                    // Active (not full) programme actions
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Promote action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
                      >
                        Promote ↗
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Duplicate action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Duplicate
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Manage action
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Manage →
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          }) : (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-[#E6F3FB] text-[#0077CC] rounded-full flex items-center justify-center mb-4"><BookOpen size={28} /></div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">No programmes yet</h3>
              <p className="text-[14px] text-gray-500 font-medium mb-6 max-w-[260px] leading-relaxed">Create your first programme to start accepting group bookings</p>
              <button onClick={() => setShowCreateForm(true)} className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold flex items-center gap-2 transition-colors shadow-sm w-full max-w-[200px] justify-center"><Plus size={18} />Create Programme</button>
            </div>
          )}
        </div>
      </div>

      {showCreateForm && (
        <CreateProgrammeForm
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => { setShowCreateForm(false); fetchProgrammes() }}
        />
      )}
    </div>
  )
}

// ─── Create Programme slide-over ──────────────────────────────────────────────

const DAY_OPTIONS = [
  { label: 'Monday',    value: '1' },
  { label: 'Tuesday',   value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday',  value: '4' },
  { label: 'Friday',    value: '5' },
  { label: 'Saturday',  value: '6' },
  { label: 'Sunday',    value: '0' },
]

const DURATION_OPTIONS = [
  { label: '30 minutes',  value: '30' },
  { label: '45 minutes',  value: '45' },
  { label: '60 minutes',  value: '60' },
  { label: '90 minutes',  value: '90' },
  { label: '120 minutes', value: '120' },
]

function CreateProgrammeForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle]                       = useState('')
  const [description, setDescription]           = useState('')
  const [sportId, setSportId]                   = useState('')
  const [dayOfWeek, setDayOfWeek]               = useState('1')
  const [startTime, setStartTime]               = useState('09:00')
  const [durationMinutes, setDurationMinutes]   = useState('60')
  const [maxSpots, setMaxSpots]                 = useState('10')
  const [paymentType, setPaymentType]           = useState<'per_session' | 'block_upfront'>('per_session')
  const [pricePerSession, setPricePerSession]   = useState('')
  const [blockPrice, setBlockPrice]             = useState('')
  const [blockSessionCount, setBlockSessionCount] = useState('')

  const [coachSports, setCoachSports]   = useState<CoachSport[]>([])
  const [loadingSports, setLoadingSports] = useState(true)
  const [submitting, setSubmitting]     = useState(false)
  const [submitError, setSubmitError]   = useState<string | null>(null)

  useEffect(() => {
    const fetchSports = async () => {
      try {
        const res = await fetch('/api/coaches/sports')
        if (!res.ok) return
        const data = await res.json() as { sports?: CoachSport[] }
        const sports = data.sports ?? []
        setCoachSports(sports)
        if (sports.length > 0) setSportId(sports[0].sport_id)
      } catch { /* non-critical — user can still pick sport */ } finally {
        setLoadingSports(false)
      }
    }
    fetchSports()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      const payload: Record<string, unknown> = {
        title,
        description: description.trim() || null,
        sport_id: sportId,
        schedule_type: 'fixed',
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        duration_minutes: Number(durationMinutes),
        max_spots: Number(maxSpots),
        payment_type: paymentType,
        price_per_session_pence: paymentType === 'per_session' ? Math.round(Number(pricePerSession) * 100) : 0,
      }
      if (paymentType === 'block_upfront') {
        payload.block_price_pence = Math.round(Number(blockPrice) * 100)
        payload.block_session_count = Number(blockSessionCount)
      }

      const res = await fetch('/api/coaches/programmes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        setSubmitError(err.error ?? 'Failed to create programme')
        return
      }
      onSuccess()
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[14px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0077CC] focus:border-transparent'
  const labelCls = 'block text-[13px] font-medium text-gray-700 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-gray-900/40" />

      {/* Panel */}
      <div
        className="relative w-full max-w-lg h-full bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[18px] font-bold text-gray-900">New Programme</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* 1. Title */}
          <div>
            <label className={labelCls}>Programme title <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Junior Cricket Foundations"
              className={inputCls}
            />
          </div>

          {/* 2. Description */}
          <div>
            <label className={labelCls}>Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              maxLength={1000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will participants learn or experience?"
              className={inputCls + ' resize-none'}
            />
          </div>

          {/* 3. Sport */}
          <div>
            <label className={labelCls}>Sport</label>
            {loadingSports ? (
              <p className="text-[13px] text-gray-400">Loading sports...</p>
            ) : coachSports.length === 0 ? (
              <p className="text-[13px] text-gray-400">No sports set up — add a sport in your profile first.</p>
            ) : (
              <select value={sportId} onChange={(e) => setSportId(e.target.value)} className={inputCls}>
                {coachSports.map((s) => (
                  <option key={s.sport_id} value={s.sport_id}>{s.sport_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* 4. Day of week */}
          <div>
            <label className={labelCls}>Day of week</label>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className={inputCls}>
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* 5. Start time */}
          <div>
            <label className={labelCls}>Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* 6. Duration */}
          <div>
            <label className={labelCls}>Duration</label>
            <select value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={inputCls}>
              {DURATION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* 7. Max spots */}
          <div>
            <label className={labelCls}>Max spots</label>
            <input
              type="number"
              min={2}
              max={100}
              required
              value={maxSpots}
              onChange={(e) => setMaxSpots(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* 8. Payment type */}
          <div>
            <label className={labelCls}>Payment type</label>
            <div className="flex gap-4 mt-1">
              {(['per_session', 'block_upfront'] as const).map((pt) => (
                <label key={pt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentType"
                    value={pt}
                    checked={paymentType === pt}
                    onChange={() => setPaymentType(pt)}
                    className="accent-[#0077CC]"
                  />
                  <span className="text-[14px] text-gray-700">
                    {pt === 'per_session' ? 'Per session' : 'Block upfront'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* 9. Per session price */}
          {paymentType === 'per_session' && (
            <div>
              <label className={labelCls}>Price per session</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-gray-500">£</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={pricePerSession}
                  onChange={(e) => setPricePerSession(e.target.value)}
                  placeholder="0"
                  className={inputCls + ' pl-7'}
                />
              </div>
            </div>
          )}

          {/* 10. Block upfront fields */}
          {paymentType === 'block_upfront' && (
            <>
              <div>
                <label className={labelCls}>Block price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-gray-500">£</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={blockPrice}
                    onChange={(e) => setBlockPrice(e.target.value)}
                    placeholder="0"
                    className={inputCls + ' pl-7'}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Sessions in block</label>
                <input
                  type="number"
                  min={2}
                  required
                  value={blockSessionCount}
                  onChange={(e) => setBlockSessionCount(e.target.value)}
                  placeholder="e.g. 6"
                  className={inputCls}
                />
              </div>
            </>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          {submitError && (
            <p className="text-[13px] text-red-600 mb-3">{submitError}</p>
          )}
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={submitting || coachSports.length === 0}
            className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white py-3 rounded-xl text-[15px] font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            {submitting ? 'Saving...' : 'Save as draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
