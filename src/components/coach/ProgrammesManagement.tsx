'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Calendar, Users, Tag, Plus, BookOpen, X, Share2, MapPin, Clock, Shield } from 'lucide-react'

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
  days_of_week: number[] | null
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
  venue_name: string | null
  venue_address: string | null
  min_participants: number | null
  cancellation_window_hours: number
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
  // Extended fields for detail modal
  description: string | null
  venue_name: string | null
  venue_address: string | null
  payment_type: string
  cancellation_window_hours: number
  schedule_type: string
  days_of_week: number[]
  sport_name: string
  start_time: string | null
  duration_minutes: number
  block_price_pence: number | null
  block_session_count: number | null
}

// Module-level helper used by both main component and modal
function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number)
  const totalMinutes = hours * 60 + minutes + durationMinutes
  const endHours = Math.floor(totalMinutes / 60) % 24
  const endMinutes = totalMinutes % 60
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`
}

export function ProgrammesManagement() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('Active')

  // CD-08: Real data state
  const [programmes, setProgrammes] = useState<Programme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null)
  const [detailProgramme, setDetailProgramme] = useState<Programme | null>(null)

  // CD-08: Fetch programmes — useCallback so action handlers can call it
  const fetchProgrammes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/coaches/programmes')
      if (!response.ok) {
        throw new Error('Failed to fetch programmes')
      }

      const data = await response.json()

      const transformed: Programme[] = (data.programmes || []).map((prog: ProgrammeResponse) => {
        const daysArr = Array.isArray(prog.days_of_week) && prog.days_of_week.length > 0
          ? prog.days_of_week
          : prog.day_of_week !== null
            ? [prog.day_of_week]
            : []
        const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const dayLabel = daysArr.length > 0
          ? daysArr.map(d => DAY_NAMES[d]?.substring(0, 3) ?? '').join('/')
          : 'Day'
        const startTime = prog.start_time ? prog.start_time.substring(0, 5) : '00:00'
        const endTime = calculateEndTime(startTime, prog.duration_minutes)
        const schedule = `Every ${dayLabel} · ${startTime} – ${endTime}`

        let price = ''
        if (prog.payment_type === 'per_session') {
          price = `£${(prog.price_per_session_pence / 100).toFixed(0)} per session`
        } else if (prog.payment_type === 'block_upfront' && prog.block_price_pence && prog.block_session_count) {
          price = `£${(prog.block_price_pence / 100).toFixed(0)} for ${prog.block_session_count} sessions`
        }

        let status: 'Active' | 'Full' | 'Draft' = 'Draft'
        if (prog.status === 'active') {
          status = prog.current_spots >= prog.max_spots ? 'Full' : 'Active'
        } else if (prog.status === 'draft') {
          status = 'Draft'
        }

        return {
          id: prog.id,
          name: prog.title,
          schedule,
          spotsFilled: prog.current_spots,
          spotsTotal: prog.max_spots,
          price,
          status,
          description: prog.description,
          venue_name: prog.venue_name,
          venue_address: prog.venue_address,
          payment_type: prog.payment_type,
          cancellation_window_hours: prog.cancellation_window_hours,
          schedule_type: prog.schedule_type,
          days_of_week: daysArr,
          sport_name: prog.sport_name,
          start_time: prog.start_time,
          duration_minutes: prog.duration_minutes,
          block_price_pence: prog.block_price_pence,
          block_session_count: prog.block_session_count,
        }
      })

      setProgrammes(transformed)
    } catch (err) {
      console.error('Failed to fetch programmes:', err)
      setError('Failed to load programmes. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProgrammes()
  }, [fetchProgrammes])

  // Fix-68: Publish a draft programme
  async function handlePublish(programmeId: string) {
    if (actionLoading) return
    setActionError(null)
    setActionLoading(programmeId)
    try {
      const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError({ id: programmeId, message: data.error || 'Failed to publish programme' })
        return
      }
      await fetchProgrammes()
    } catch {
      setActionError({ id: programmeId, message: 'Something went wrong. Please try again.' })
    } finally {
      setActionLoading(null)
    }
  }

  // CF-05b: Cancel an active/full programme
  async function handleCancelProgramme(programmeId: string) {
    if (actionLoading) return
    setActionError(null)
    setActionLoading(programmeId)
    try {
      const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError({ id: programmeId, message: data.error || 'Failed to cancel programme' })
        return
      }
      await fetchProgrammes()
    } catch {
      setActionError({ id: programmeId, message: 'Something went wrong. Please try again.' })
    } finally {
      setActionLoading(null)
      setCancelConfirmId(null)
    }
  }

  // Fix-69-1: Delete a draft programme (called after inline confirmation)
  async function handleDelete(programmeId: string) {
    if (actionLoading) return
    setActionError(null)
    setActionLoading(programmeId)
    try {
      const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError({ id: programmeId, message: data.error || 'Failed to delete programme' })
        return
      }
      await fetchProgrammes()
    } catch {
      setActionError({ id: programmeId, message: 'Something went wrong. Please try again.' })
    } finally {
      setActionLoading(null)
      setDeleteConfirmId(null)
    }
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
            <button onClick={() => router.push('/coach/programmes/create')} className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-3.5 py-2 rounded-full text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"><Plus size={16} />New Programme</button>
          </div>
          {/* CF-D05 CHANGE 1: State-aware subtitle */}
          <p className="text-[13px] text-gray-500 mt-1 mb-4">
            {activeCount} active · {fullCount} full{spotsRemaining > 0 && leastFullProgramme ? ` · ${spotsRemaining} spots available in ${leastFullProgramme.name}` : ''}
          </p>
          <div className="flex items-center gap-6 border-b border-gray-100">
            {(['Active', 'Draft'] as Tab[]).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-3 text-[15px] font-bold transition-colors relative whitespace-nowrap ${activeTab === tab ? 'text-[#0077CC]' : 'text-gray-500 hover:text-gray-700'}`}>
                {tab === 'Draft' && draftProgrammes.length > 0
                  ? `Draft (${draftProgrammes.length})`
                  : tab}
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
                onClick={() => fetchProgrammes()}
                className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : currentProgrammes.length > 0 ? currentProgrammes.map(programme => {
            const fillPercentage = (programme.spotsFilled / programme.spotsTotal) * 100
            const isDraft = programme.status === 'Draft'
            const isFull = programme.status === 'Full'
            const spotsLeft = programme.spotsTotal - programme.spotsFilled

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
                onClick={() => setDetailProgramme(programme)}
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
                        : `${programme.spotsFilled} / ${programme.spotsTotal} spots filled · ${spotsLeft} remaining`
                      }
                    </p>
                  </div>

                  {/* 5. Price + chevron row */}
                  <div className="flex items-center justify-between pt-2 border-t-[0.5px] border-gray-100">
                    <span className="text-[16px] font-bold text-gray-900">{programme.price.split(' ')[0]}</span>
                    <ChevronRight size={20} className="text-gray-400" />
                  </div>
                </div>

                {/* Fix-69-1: Inline action error */}
                {actionError?.id === programme.id && (
                  <div className="border-t-[0.5px] border-gray-100 px-4 pt-2 bg-white">
                    <p className="text-[11px] text-red-500 leading-snug">{actionError.message}</p>
                  </div>
                )}

                {/* CF-D05 CHANGE 4: Quick action row */}
                <div className="border-t-[0.5px] border-gray-100 px-4 py-2 flex gap-2 bg-white">
                  {isDraft ? (
                    // Draft programme actions
                    <>
                      <button
                        disabled={actionLoading === programme.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePublish(programme.id)
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {actionLoading === programme.id ? 'Publishing...' : 'Publish'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/coach/programmes/${programme.id}/edit`)
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Edit
                      </button>
                      {deleteConfirmId === programme.id ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteConfirmId(null)
                            }}
                            className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={actionLoading === programme.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(programme.id)
                            }}
                            className="flex-1 bg-red-600 text-white rounded-md text-[11px] py-1.5 text-center hover:bg-red-700 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {actionLoading === programme.id ? 'Deleting...' : 'Confirm delete'}
                          </button>
                        </>
                      ) : (
                        <button
                          disabled={!!actionLoading}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirmId(programme.id)
                          }}
                          className="flex-1 bg-white border border-gray-200 text-red-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      )}
                    </>
                  ) : isFull ? (
                    // Full programme actions
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/coach/programmes/${programme.id}/edit`)
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Edit
                      </button>
                      <button
                        // AF-H-12: dead button — disabled until CF-D05 wires the action
                        disabled
                        aria-disabled="true"
                        title="New cohort coming soon"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center transition-all duration-150 opacity-50 cursor-not-allowed"
                      >
                        New cohort ↗
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/coach/programmes/${programme.id}/roster`)
                        }}
                        className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                      >
                        Manage →
                      </button>
                    </>
                  ) : (
                    // Active (not full) programme actions
                    cancelConfirmId === programme.id ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCancelConfirmId(null)
                          }}
                          className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 transition-all duration-150"
                        >
                          Keep programme
                        </button>
                        <button
                          disabled={actionLoading === programme.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCancelProgramme(programme.id)
                          }}
                          className="flex-1 bg-red-600 text-white rounded-md text-[11px] py-1.5 text-center hover:bg-red-700 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {actionLoading === programme.id ? 'Cancelling...' : 'Confirm cancel'}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/coach/programmes/${programme.id}/edit`)
                          }}
                          className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                        >
                          Edit
                        </button>
                        <button
                          // AF-H-12: dead button — disabled until CF-D05 wires the action
                          disabled
                          aria-disabled="true"
                          title="Promote coming soon"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center transition-all duration-150 opacity-50 cursor-not-allowed"
                        >
                          Promote ↗
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/coach/programmes/${programme.id}/roster`)
                          }}
                          className="flex-1 bg-white border border-gray-200 text-gray-600 rounded-md text-[11px] py-1.5 text-center hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700 transition-all duration-150"
                        >
                          Manage →
                        </button>
                        <button
                          disabled={!!actionLoading}
                          onClick={(e) => {
                            e.stopPropagation()
                            setCancelConfirmId(programme.id)
                          }}
                          className="flex-1 bg-white border border-red-200 text-red-600 rounded-md text-[11px] py-1.5 text-center hover:bg-red-50 hover:border-red-300 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </button>
                      </>
                    )
                  )}
                </div>
              </div>
            )
          }) : (
            <div className="py-16 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 bg-[#E6F3FB] text-[#0077CC] rounded-full flex items-center justify-center mb-4"><BookOpen size={28} /></div>
              <h3 className="text-[18px] font-bold text-gray-900 mb-2">No programmes yet</h3>
              <p className="text-[14px] text-gray-500 font-medium mb-6 max-w-[260px] leading-relaxed">Create your first programme to start accepting group bookings</p>
              <button onClick={() => router.push('/coach/programmes/create')} className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold flex items-center gap-2 transition-colors shadow-sm w-full max-w-[200px] justify-center"><Plus size={18} />Create Programme</button>
            </div>
          )}
        </div>
      </div>

      {detailProgramme && (
        <ProgrammeDetailModal
          programme={detailProgramme}
          onClose={() => setDetailProgramme(null)}
          onNavigate={(path) => {
            setDetailProgramme(null)
            router.push(path)
          }}
        />
      )}
    </div>
  )
}

// ─── Programme Detail Modal ───────────────────────────────────────────────────

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ProgrammeDetailModal({
  programme,
  onClose,
  onNavigate,
}: {
  programme: Programme
  onClose: () => void
  onNavigate: (path: string) => void
}) {
  const [shareOpen, setShareOpen] = useState(false)
  const [copied, setCopied] = useState<'link' | 'text' | null>(null)

  const isDraft = programme.status === 'Draft'
  const fillPercentage = Math.min((programme.spotsFilled / programme.spotsTotal) * 100, 100)
  const spotsLeft = programme.spotsTotal - programme.spotsFilled
  const shareUrl = `https://crikly.app/programmes/${programme.id}`

  const daysLabel = programme.days_of_week.length > 0
    ? programme.days_of_week.map(d => DAY_SHORT[d] ?? '').join(', ')
    : '—'
  const startTime = programme.start_time ? programme.start_time.substring(0, 5) : null
  const endTime = startTime ? calculateEndTime(startTime, programme.duration_minutes) : null

  const priceAmt = programme.price.split(' ')[0]
  const pricePer = programme.price.split(' ').slice(1).join(' ')

  const cancellationTitle = programme.cancellation_window_hours === 0
    ? 'No cancellations allowed'
    : `Free cancellation up to ${programme.cancellation_window_hours} hours before`
  const cancellationSub = programme.cancellation_window_hours === 0
    ? 'Parents cannot cancel once booked.'
    : 'After that, parents are charged the full session fee.'

  function handleCopyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied('link')
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function handleCopyText() {
    const text = `Join my ${programme.name} programme on Crikly!\n${shareUrl}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied('text')
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Join my ${programme.name} programme on Crikly!\n${shareUrl}`)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full mx-4 bg-white rounded-[20px] overflow-hidden flex flex-col"
        style={{ maxWidth: 480, maxHeight: '90vh', boxShadow: '0 32px 80px rgba(0,0,0,.35), 0 8px 24px rgba(0,0,0,.15)' }}
      >
        {/* Close button — absolute so it floats above content */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-[14px] right-[14px] w-9 h-9 rounded-full bg-[#F1F5F9] hover:bg-[#E2E8F0] flex items-center justify-center z-10 transition-colors text-[#475569]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-7 pt-7 pb-5">

          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2 pr-9">
            <h2 className="w-full text-[20px] font-bold tracking-[-0.01em] leading-[1.25] text-[#0F172A]">
              {programme.name}
            </h2>
            <span className="inline-flex items-center px-[10px] py-1 bg-[#E6F3FB] text-[#0C447C] rounded-[6px] text-[12px] font-medium leading-4">
              {programme.sport_name}
            </span>
            <span className={`inline-flex items-center gap-[5px] px-[10px] py-1 rounded-[6px] text-[12px] font-medium leading-4 ${
              programme.status === 'Active' ? 'bg-[#DCFCE7] text-[#15803D]'
              : programme.status === 'Full'   ? 'bg-[#0077CC] text-white'
              : 'bg-[#F1F5F9] text-[#475569]'
            }`}>
              {programme.status === 'Active' && <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] shrink-0" />}
              {programme.status}
            </span>
          </div>

          {/* Schedule */}
          <div className="mt-[22px]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-[10px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
              </svg>
              Schedule
            </div>
            <div className="flex items-center gap-3 px-4 py-[14px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
              <div className="w-10 h-10 rounded-[10px] bg-[#E6F3FB] flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0077CC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                </svg>
              </div>
              <div>
                <div className="text-[15px] font-medium text-[#0F172A] tracking-[-0.005em]">
                  Every {daysLabel}{startTime && endTime ? ` · ${startTime} – ${endTime}` : ''}
                </div>
                <div className="text-[13px] text-[#64748B] mt-0.5">
                  {programme.duration_minutes} minutes{programme.block_session_count ? ` · ${programme.block_session_count} sessions` : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Capacity */}
          <div className="mt-[22px]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-[10px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              Capacity
            </div>
            <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
              <div className="h-full bg-[#0077CC] rounded-full" style={{ width: `${fillPercentage}%`, transition: 'width .3s' }} />
            </div>
            <div className="flex justify-between items-baseline mt-2 text-[13px] text-[#475569]">
              <span><strong className="text-[#0F172A] font-medium">{programme.spotsFilled} of {programme.spotsTotal}</strong> spots filled</span>
              <span>{spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>
            </div>
          </div>

          {/* Price */}
          <div className="mt-[22px]">
            <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-[10px]">Price</div>
            <div className="flex items-baseline gap-2.5">
              <span className="text-[32px] font-bold tracking-[-0.02em] text-[#0F172A] leading-none">{priceAmt}</span>
              <span className="text-[14px] text-[#64748B]">{pricePer}</span>
            </div>
          </div>

          {/* Venue (optional) */}
          {programme.venue_name && (
            <div className="mt-[22px]">
              <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-[10px]">Venue</div>
              <div className="flex items-start gap-3 px-4 py-[14px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
                <div className="w-9 h-9 rounded-[10px] bg-[#FEF3C7] flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <div className="text-[15px] font-medium tracking-[-0.005em] text-[#0F172A]">{programme.venue_name}</div>
                  {programme.venue_address && (
                    <div className="text-[13px] text-[#64748B] mt-0.5 leading-[1.4]">{programme.venue_address}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Description (optional) */}
          {programme.description && (
            <div className="mt-[22px]">
              <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-[10px]">About</div>
              <p className="text-[13px] text-[#475569] leading-relaxed">{programme.description}</p>
            </div>
          )}

          {/* Cancellation policy */}
          <div className="mt-[22px] pb-1">
            <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-[10px]">Cancellation policy</div>
            <div className="flex items-start gap-3 px-4 py-[14px] bg-[#F0FDF4] border border-[#BBF7D0] rounded-[12px]">
              <div className="w-9 h-9 rounded-[10px] bg-[#DCFCE7] flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 3v7c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5z"/><path d="M9 12l2 2 4-4"/>
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-medium tracking-[-0.005em] text-[#0F172A]">{cancellationTitle}</div>
                <div className="text-[13px] text-[#475569] mt-0.5 leading-[1.4]">{cancellationSub}</div>
              </div>
            </div>
          </div>

          {/* Share sheet — inline after body content */}
          {shareOpen && (
            <div className="border-t border-[#E2E8F0] mt-4 pt-0 pb-2">
              <div className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mt-4 mb-3">Share this programme</div>
              <div className="flex flex-col gap-2">
                {/* WhatsApp */}
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-[14px] px-4 py-[14px] bg-[#F0FDF4] border-[1.5px] border-[#BBF7D0] hover:border-[#86EFAC] rounded-[12px] transition-colors"
                >
                  <div className="w-10 h-10 rounded-[10px] bg-[#25D366] text-white flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.304-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="text-[15px] font-medium tracking-[-0.005em] text-[#0F172A]">WhatsApp</div>
                    <div className="text-[13px] text-[#64748B] mt-0.5">Opens WhatsApp with a pre-filled message</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </a>

                {/* Copy link */}
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-[14px] px-4 py-[14px] bg-[#F8FAFC] border-[1.5px] border-[#E2E8F0] hover:border-[#CBD5E1] rounded-[12px] text-left transition-colors w-full"
                >
                  <div className="w-10 h-10 rounded-[10px] bg-[#E2E8F0] text-[#475569] flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.72-1.72"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-medium tracking-[-0.005em] text-[#0F172A]">{copied === 'link' ? 'Copied!' : 'Copy link'}</div>
                    <div className="text-[13px] text-[#64748B] mt-0.5">crikly.app/programmes/…</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>

                {/* Copy text */}
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-[14px] px-4 py-[14px] bg-[#F8FAFC] border-[1.5px] border-[#E2E8F0] hover:border-[#CBD5E1] rounded-[12px] text-left transition-colors w-full"
                >
                  <div className="w-10 h-10 rounded-[10px] bg-[#E2E8F0] text-[#475569] flex items-center justify-center shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-medium tracking-[-0.005em] text-[#0F172A]">{copied === 'text' ? 'Copied!' : 'Copy text'}</div>
                    <div className="text-[13px] text-[#64748B] mt-0.5">Full programme details, ready to paste</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>

              {/* Back button */}
              <button
                onClick={() => setShareOpen(false)}
                className="inline-flex items-center gap-1.5 text-[#0077CC] text-[14px] font-medium bg-transparent border-none cursor-pointer pt-[14px] mt-1 hover:underline"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Back
              </button>
            </div>
          )}
        </div>

        {/* Sticky actions bar — hidden when share sheet is open */}
        {!shareOpen && (
          <div
            className="sticky bottom-0 bg-white border-t border-[#E2E8F0] px-5 py-4 grid gap-2.5 items-center"
            style={{ gridTemplateColumns: 'auto 1fr auto' }}
          >
            {/* Edit — disabled for non-draft per design */}
            <button
              disabled={!isDraft}
              onClick={() => isDraft && onNavigate(`/coach/programmes/${programme.id}/edit`)}
              className="h-11 px-[18px] rounded-[12px] text-[14px] font-medium bg-white text-[#475569] border-[1.5px] border-[#E2E8F0] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Edit
            </button>

            {/* Manage / Preview */}
            <button
              onClick={() => onNavigate(isDraft ? `/coach/programmes/${programme.id}/edit` : `/coach/programmes/${programme.id}/roster`)}
              className="h-11 px-[18px] rounded-[12px] text-[14px] font-medium bg-[#0077CC] hover:bg-[#0066AA] text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              {isDraft ? 'Preview' : 'Manage'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7"/>
              </svg>
            </button>

            {/* Share */}
            <button
              onClick={() => setShareOpen(true)}
              className="h-11 px-[18px] rounded-[12px] text-[14px] font-medium bg-white text-[#15803D] border-[1.5px] border-[#BBF7D0] hover:bg-[#F0FDF4] flex items-center gap-1.5 transition-colors"
            >
              Share
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M17 7H9M17 7v8"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
