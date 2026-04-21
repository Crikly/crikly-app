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
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO CF-D05: wire Open new cohort action
                        }}
                        className="flex-1 bg-[#0077CC] text-white rounded-md text-[11px] py-1.5 text-center hover:bg-[#0066AA] transition-all duration-150"
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
  const shareUrl = `https://crikly.app/programmes/${programme.id}`

  const daysLabel = programme.days_of_week.length > 0
    ? programme.days_of_week.map(d => DAY_SHORT[d] ?? '').join(', ')
    : '—'

  const startTime = programme.start_time ? programme.start_time.substring(0, 5) : null
  const endTime = startTime ? calculateEndTime(startTime, programme.duration_minutes) : null

  const cancellationLabel = programme.cancellation_window_hours === 0
    ? 'No cancellations allowed'
    : `${programme.cancellation_window_hours}h before session`

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
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full md:max-w-lg bg-white rounded-t-[20px] md:rounded-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 pb-[80px]">
          {/* Header */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 className="text-[18px] font-bold text-gray-900 leading-tight">{programme.name}</h2>
              <button
                onClick={onClose}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                aria-label="Close"
              >
                <X size={16} className="text-gray-600" />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-[#E6F3FB] text-[#0C447C] text-[11px] font-semibold">
                {programme.sport_name}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                programme.status === 'Active' ? 'bg-[#DCFCE7] text-[#15803D]'
                : programme.status === 'Full' ? 'bg-[#0077CC] text-white'
                : 'bg-[#F3F4F6] text-[#6B7280]'
              }`}>
                {programme.status}
              </span>
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Schedule */}
            <div>
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Schedule</p>
              <div className="flex items-center gap-2 mb-1.5">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                <span className="text-[13px] text-gray-700">{daysLabel}</span>
              </div>
              {startTime && endTime && (
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-gray-400 shrink-0" />
                  <span className="text-[13px] text-gray-700">{startTime} – {endTime} ({programme.duration_minutes} min)</span>
                </div>
              )}
              {programme.block_session_count && (
                <div className="flex items-center gap-2 mt-1.5">
                  <BookOpen size={14} className="text-gray-400 shrink-0" />
                  <span className="text-[13px] text-gray-700">{programme.block_session_count} sessions</span>
                </div>
              )}
            </div>

            {/* Capacity */}
            <div>
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Capacity</p>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  <span className="text-[13px] text-gray-700">{programme.spotsFilled} / {programme.spotsTotal} spots filled</span>
                </div>
                <span className="text-[12px] font-semibold" style={{ color: programme.status === 'Full' ? '#0077CC' : '#1F2937' }}>
                  {Math.round(fillPercentage)}%
                </span>
              </div>
              <div className="h-[6px] bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${fillPercentage}%`,
                    backgroundColor: programme.status === 'Full' ? '#0077CC' : fillPercentage < 25 ? '#F59E0B' : '#0077CC',
                  }}
                />
              </div>
            </div>

            {/* Price */}
            <div>
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Price</p>
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-gray-400 shrink-0" />
                <span className="text-[13px] text-gray-700">{programme.price}</span>
              </div>
            </div>

            {/* Venue (optional) */}
            {programme.venue_name && (
              <div>
                <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Venue</p>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] text-gray-700 font-medium">{programme.venue_name}</p>
                    {programme.venue_address && (
                      <p className="text-[12px] text-gray-500 mt-0.5">{programme.venue_address}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Description (optional) */}
            {programme.description && (
              <div>
                <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">About</p>
                <p className="text-[13px] text-gray-700 leading-relaxed">{programme.description}</p>
              </div>
            )}

            {/* Cancellation window */}
            <div>
              <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Cancellation Policy</p>
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-gray-400 shrink-0" />
                <span className="text-[13px] text-gray-700">{cancellationLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky actions bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-3">
          {shareOpen ? (
            // Share sheet
            <div className="space-y-2">
              <div className="flex gap-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 h-10 rounded-[10px] bg-[#25D366] text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                >
                  WhatsApp
                </a>
                <button
                  onClick={handleCopyLink}
                  className="flex-1 h-10 rounded-[10px] border border-gray-200 text-gray-700 text-[12px] font-semibold hover:bg-gray-50 transition-colors"
                >
                  {copied === 'link' ? 'Copied!' : 'Copy link'}
                </button>
                <button
                  onClick={handleCopyText}
                  className="flex-1 h-10 rounded-[10px] border border-gray-200 text-gray-700 text-[12px] font-semibold hover:bg-gray-50 transition-colors"
                >
                  {copied === 'text' ? 'Copied!' : 'Copy text'}
                </button>
              </div>
              <button
                onClick={() => setShareOpen(false)}
                className="w-full h-9 rounded-[10px] text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                ← Back
              </button>
            </div>
          ) : (
            // Normal actions
            <div className="flex gap-2">
              {isDraft && (
                <button
                  onClick={() => onNavigate(`/coach/programmes/${programme.id}/edit`)}
                  className="flex-1 h-11 rounded-[10px] border border-gray-200 text-gray-700 text-[13px] font-semibold hover:bg-gray-50 transition-colors"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => onNavigate(isDraft ? `/coach/programmes/${programme.id}/edit` : `/coach/programmes/${programme.id}/roster`)}
                className="flex-1 h-11 rounded-[10px] bg-[#0077CC] hover:bg-[#0066AA] text-white text-[13px] font-semibold transition-colors"
              >
                {isDraft ? 'Preview' : 'Manage'}
              </button>
              <button
                onClick={() => setShareOpen(true)}
                className="flex-1 h-11 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Share2 size={14} />
                Share
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
