'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Check, Calendar, RefreshCw, CreditCard, Layers, Loader2 } from 'lucide-react'
import { VenueAutocomplete, type VenueSelection } from '@/components/coach/shared/LocationAutocomplete'
import { ProgrammeImagePicker } from '@/components/coach/shared/ProgrammeImagePicker'

interface FormData {
  title: string
  description: string
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  days_of_week: number[]
  start_time: string
  duration_minutes: number
  max_spots: number
  payment_type: 'per_session' | 'block_upfront'
  price_pence: number
  block_session_count: number | null
  venue_name: string
  venue_address: string
  // CF-PROGRAMMES-IMAGE-PICKER: cover photo URL (Unsplash or upload).
  image_url: string | null
}

interface ReadOnlyData {
  sport_name: string
  schedule_type: string
  current_spots: number
  status: string
  session_count: number | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DURATIONS = [30, 45, 60, 90, 120]
const SKILL_LEVELS: { value: FormData['skill_level']; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all', label: 'All levels' },
]

function penceToDisplay(pence: number): string {
  return (pence / 100).toFixed(0)
}

function displayToPence(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-sm font-medium transition-colors ${
        active
          ? 'bg-[#0077CC] text-white border-[#0077CC]'
          : 'bg-white text-[#334155] border-[#E2E8F0] hover:border-[#CBD5E1]'
      }`}
    >
      {active && <Check size={13} strokeWidth={2.5} />}
      {children}
    </button>
  )
}

function SelectCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-[14px] border-[1.5px] p-[18px] cursor-pointer transition-colors ${
        active ? 'border-[#0077CC] bg-[#F0F7FF]' : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
      }`}
    >
      {active && (
        <span className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-[#0077CC] flex items-center justify-center">
          <Check size={11} strokeWidth={3} color="white" />
        </span>
      )}
      <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center mb-2.5 ${active ? 'bg-[#E6F3FB]' : 'bg-[#F1F5F9]'}`}>
        <span className={active ? 'text-[#0077CC]' : 'text-[#475569]'}>{icon}</span>
      </div>
      <h4 className="text-[15px] font-semibold text-[#0F172A] mb-1 tracking-tight">{title}</h4>
      <p className="text-[13px] text-[#64748B] leading-snug">{description}</p>
    </button>
  )
}

function SectionHeader({ title, locked }: { title: string; locked: boolean }) {
  return (
    <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#F1F5F9]">
      <h2 className="text-[15px] font-semibold text-[#0F172A]">{title}</h2>
      {locked && (
        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
          <Lock size={11} />
          Locked
        </span>
      )}
    </div>
  )
}

export function EditProgramme({ programmeId }: { programmeId: string }) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [venueKey, setVenueKey] = useState(0)

  const [readOnly, setReadOnly] = useState<ReadOnlyData>({
    sport_name: '',
    schedule_type: 'fixed',
    current_spots: 0,
    status: 'draft',
    session_count: null,
  })

  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    skill_level: 'all',
    days_of_week: [6],
    start_time: '09:00',
    duration_minutes: 60,
    max_spots: 8,
    payment_type: 'per_session',
    price_pence: 0,
    block_session_count: null,
    venue_name: '',
    venue_address: '',
    image_url: null,
  })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    async function fetchProgramme() {
      try {
        const res = await fetch(`/api/coaches/programmes/${programmeId}`)
        if (!res.ok) {
          const data = await res.json()
          setFetchError(data.error || 'Failed to load programme')
          return
        }
        const data = await res.json()
        setReadOnly({
          sport_name: data.sport_name || '',
          schedule_type: data.schedule_type || 'fixed',
          current_spots: data.current_spots ?? 0,
          status: data.status || 'draft',
          session_count: data.session_count ?? null,
        })
        setForm({
          title: data.title || '',
          description: data.description || '',
          skill_level: (['beginner', 'intermediate', 'advanced', 'all'].includes(data.skill_level)
            ? data.skill_level
            : 'all') as FormData['skill_level'],
          days_of_week:
            Array.isArray(data.days_of_week) && data.days_of_week.length > 0
              ? (data.days_of_week as number[])
              : [data.day_of_week ?? 6],
          start_time: data.start_time ? (data.start_time as string).substring(0, 5) : '09:00',
          duration_minutes: data.duration_minutes || 60,
          max_spots: data.max_spots || 8,
          payment_type: data.payment_type === 'block_upfront' ? 'block_upfront' : 'per_session',
          price_pence:
            data.payment_type === 'block_upfront'
              ? (data.block_price_pence || 0)
              : (data.price_per_session_pence || 0),
          block_session_count: data.block_session_count ?? null,
          venue_name: data.venue_name || '',
          venue_address: data.venue_address || '',
          image_url: data.image_url ?? null,
        })
      } catch {
        setFetchError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    fetchProgramme()
  }, [programmeId])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleDay(dayIndex: number) {
    const current = form.days_of_week
    if (current.includes(dayIndex)) {
      if (current.length === 1) return
      update('days_of_week', current.filter((d) => d !== dayIndex))
    } else {
      update('days_of_week', [...current, dayIndex].sort((a, b) => a - b))
    }
  }

  const isLocked = readOnly.current_spots > 0

  async function handleSave() {
    if (!form.title.trim()) {
      setSaveError('Programme title is required.')
      return
    }
    setSaving(true)
    setSaveError(null)

    try {
      const patchBody: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        skill_level: form.skill_level,
        venue_name: form.venue_name || null,
        venue_address: form.venue_address || null,
        image_url: form.image_url,
      }

      if (!isLocked) {
        patchBody.days_of_week = form.days_of_week
        patchBody.day_of_week = form.days_of_week[0] ?? 0
        patchBody.start_time = form.start_time
        patchBody.duration_minutes = form.duration_minutes
        patchBody.max_spots = form.max_spots
        patchBody.payment_type = form.payment_type
        if (form.payment_type === 'per_session') {
          patchBody.price_per_session_pence = form.price_pence
        } else {
          patchBody.block_price_pence = form.price_pence
          patchBody.block_session_count = form.block_session_count
          patchBody.price_per_session_pence = form.price_pence
        }
      }

      const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })

      if (!res.ok) {
        const data = await res.json()
        setSaveError(data.error || 'Failed to save changes.')
        return
      }

      router.push('/coach/programmes')
    } catch {
      setSaveError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-[760px] mx-auto px-8 py-6 pb-16">
          <div className="bg-white border border-[#E2E8F0] rounded-[20px] px-10 py-8">
            <div className="h-4 bg-[#F1F5F9] rounded-full w-28 mb-6 animate-pulse" />
            <div className="h-7 bg-[#F1F5F9] rounded-full w-52 mb-8 animate-pulse" />
            <div className="space-y-4">
              <div className="h-12 bg-[#F1F5F9] rounded-[12px] animate-pulse" />
              <div className="h-24 bg-[#F1F5F9] rounded-[12px] animate-pulse" />
              <div className="h-12 bg-[#F1F5F9] rounded-[12px] w-2/3 animate-pulse" />
              <div className="h-12 bg-[#F1F5F9] rounded-[12px] animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-[16px] font-medium text-gray-900 mb-2">Failed to load programme</p>
          <p className="text-[14px] text-gray-500 mb-6">{fetchError}</p>
          <button
            onClick={() => router.push('/coach/programmes')}
            className="text-[#0077CC] text-[14px] font-medium hover:underline"
          >
            ← Back to programmes
          </button>
        </div>
      </div>
    )
  }

  const priceLabel = form.payment_type === 'per_session' ? 'Price per session' : 'Block price'
  const priceDisplay = form.price_pence > 0 ? `£${penceToDisplay(form.price_pence)}` : '£—'

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-8 py-6 pb-24">
        <div className="bg-white border border-[#E2E8F0] rounded-[20px] px-10 py-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">

          {/* Top bar */}
          <div className="flex items-center mb-5">
            <button
              type="button"
              onClick={() => router.push('/coach/programmes')}
              className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
            >
              <ArrowLeft size={15} />
              Back to programmes
            </button>
          </div>

          <span className="inline-block text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] bg-[#F1F5F9] px-2.5 py-1 rounded-full mb-2">
            Edit Programme
          </span>
          <h1 className="text-[22px] font-bold text-gray-900 mt-1 mb-6">
            {form.title || 'Edit Programme'}
          </h1>

          {/* Amber locked banner */}
          {isLocked && (
            <div className="bg-amber-50 border border-amber-200 rounded-[12px] px-4 py-3 mb-6 flex items-start gap-3">
              <Lock size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-[13px] text-amber-800 leading-snug">
                <strong>Schedule and pricing are locked</strong> because {readOnly.current_spots}{' '}
                participant{readOnly.current_spots > 1 ? 's have' : ' has'} enrolled. To change
                these fields, cancel this programme and create a new one.
              </p>
            </div>
          )}

          {/* ── BASICS ── */}
          <div className="mb-8">
            <SectionHeader title="Basics" locked={false} />

            <div className="mb-[22px]">
              <label className="block text-[12px] font-medium text-[#475569] mb-2">Programme title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => update('title', e.target.value)}
                placeholder="e.g. Saturday Beginner Cricket"
                className="w-full px-4 py-3.5 bg-white border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none transition-[border,box-shadow] focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
              />
            </div>

            <div className="mb-[22px]">
              <label className="block text-[12px] font-medium text-[#475569] mb-2">
                Description{' '}
                <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="What will participants learn?"
                rows={3}
                className="w-full px-4 py-3.5 bg-white border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none transition-[border,box-shadow] focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)] resize-y"
              />
            </div>

            <div className="mb-[22px]">
              <label className="block text-[12px] font-medium text-[#475569] mb-2">Sport</label>
              <span className="inline-flex items-center px-3 py-1.5 text-[13px] font-medium rounded-[8px] bg-[#E6F3FB] text-[#0C447C]">
                {readOnly.sport_name}
              </span>
              <p className="text-[11px] text-[#94A3B8] mt-1.5">Sport cannot be changed after creation.</p>
            </div>

            <div className="mb-[22px]">
              <label className="block text-[12px] font-medium text-[#475569] mb-2">Skill level</label>
              <div className="flex flex-wrap gap-2">
                {SKILL_LEVELS.map((sl) => (
                  <PillButton
                    key={sl.value}
                    active={form.skill_level === sl.value}
                    onClick={() => update('skill_level', sl.value)}
                  >
                    {sl.label}
                  </PillButton>
                ))}
              </div>
            </div>

            {/* CF-PROGRAMMES-IMAGE-PICKER */}
            <div className="mb-[22px]">
              <label className="block text-[12px] font-medium text-[#475569] mb-2">
                Cover photo <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
              </label>
              <ProgrammeImagePicker
                value={form.image_url}
                sportName={readOnly.sport_name || 'Cricket'}
                onChange={(url) => update('image_url', url)}
              />
            </div>
          </div>

          {/* ── SCHEDULE ── */}
          <div className={`mb-8 ${isLocked ? 'bg-gray-50 rounded-[16px] p-4' : ''}`}>
            <SectionHeader title="Schedule" locked={isLocked} />
            <div className={isLocked ? 'opacity-60 pointer-events-none' : ''}>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Schedule type</label>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-[8px] bg-[#F1F5F9] text-[#475569]">
                  {readOnly.schedule_type === 'fixed' ? (
                    <><Calendar size={13} /> Fixed</>
                  ) : (
                    <><RefreshCw size={13} /> Rolling</>
                  )}
                </span>
                {readOnly.schedule_type === 'fixed' && readOnly.session_count !== null && (
                  <span className="ml-2 text-[12px] text-[#64748B]">
                    {readOnly.session_count} sessions
                  </span>
                )}
              </div>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Day of the week</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, i) => (
                    <PillButton
                      key={day}
                      active={form.days_of_week.includes(i)}
                      onClick={() => toggleDay(i)}
                    >
                      {day}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div className="flex gap-6 flex-wrap mb-[22px]">
                <div className="flex-none">
                  <label className="block text-[12px] font-medium text-[#475569] mb-2">Start time</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => update('start_time', e.target.value)}
                    className="text-[18px] font-medium px-4 py-3.5 border border-[#E2E8F0] rounded-[12px] w-[140px] tracking-wide outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                  />
                </div>
                <div className="flex-1 min-w-[260px]">
                  <label className="block text-[12px] font-medium text-[#475569] mb-2">Duration</label>
                  <div className="flex flex-wrap gap-2">
                    {DURATIONS.map((d) => (
                      <PillButton
                        key={d}
                        active={form.duration_minutes === d}
                        onClick={() => update('duration_minutes', d)}
                      >
                        {d} min
                      </PillButton>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* ── CAPACITY & PRICING ── */}
          <div className={`mb-8 ${isLocked ? 'bg-gray-50 rounded-[16px] p-4' : ''}`}>
            <SectionHeader title="Capacity & Pricing" locked={isLocked} />
            <div className={isLocked ? 'opacity-60 pointer-events-none' : ''}>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Maximum spots</label>
                <div className="inline-flex items-center border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => update('max_spots', Math.max(readOnly.current_spots || 2, form.max_spots - 1))}
                    className="w-11 h-12 flex items-center justify-center text-[#475569] text-lg hover:bg-[#F8FAFC] transition-colors"
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <span className="min-w-12 text-center text-[16px] font-medium px-3.5 border-x border-[#E2E8F0] leading-[48px]">
                    {form.max_spots}
                  </span>
                  <button
                    type="button"
                    // AF-H-13 + Wave-7 regression fix: cap at 100 to match API validation
                    // (programmes/route.ts:210 enforces max_spots between 2 and 100)
                    onClick={() => update('max_spots', Math.min(100, form.max_spots + 1))}
                    className="w-11 h-12 flex items-center justify-center text-[#475569] text-lg hover:bg-[#F8FAFC] transition-colors"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
                {readOnly.current_spots > 0 && (
                  <p className="text-[12px] text-[#94A3B8] mt-2">
                    {readOnly.current_spots} spot{readOnly.current_spots > 1 ? 's' : ''} already filled.
                  </p>
                )}
              </div>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Payment type</label>
                <div className="grid grid-cols-2 gap-3">
                  <SelectCard
                    active={form.payment_type === 'per_session'}
                    onClick={() => update('payment_type', 'per_session')}
                    icon={<CreditCard size={20} strokeWidth={1.8} />}
                    title="Per session"
                    description="Parents pay for each session."
                  />
                  <SelectCard
                    active={form.payment_type === 'block_upfront'}
                    onClick={() => update('payment_type', 'block_upfront')}
                    icon={<Layers size={20} strokeWidth={1.8} />}
                    title="Block upfront"
                    description="Parents pay for all sessions at once."
                  />
                </div>
              </div>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">{priceLabel}</label>
                <div className="relative w-[200px]">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8] text-base">£</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={penceToDisplay(form.price_pence)}
                    onChange={(e) => update('price_pence', displayToPence(e.target.value))}
                    className="w-full pl-9 pr-4 py-3.5 border border-[#E2E8F0] rounded-[12px] text-[18px] font-medium text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                  />
                </div>
                {form.price_pence > 0 && (
                  <p className="text-[12px] text-[#334155] mt-2.5">
                    Parents pay{' '}
                    <strong className="text-[#0077CC]">{priceDisplay}</strong>{' '}
                    {form.payment_type === 'per_session' ? 'per session.' : 'upfront for all sessions.'}
                  </p>
                )}
              </div>

              {form.payment_type === 'block_upfront' && (
                <div className="mb-[22px]">
                  <label className="block text-[12px] font-medium text-[#475569] mb-2">Sessions in block</label>
                  <input
                    type="number"
                    min={2}
                    max={52}
                    value={form.block_session_count ?? ''}
                    onChange={(e) =>
                      update('block_session_count', Math.max(2, parseInt(e.target.value) || 2))
                    }
                    className="w-[120px] px-4 py-2.5 border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                  />
                </div>
              )}

            </div>
          </div>

          {/* ── VENUE ── */}
          <div className="mb-8">
            <SectionHeader title="Venue" locked={false} />
            <div className="mb-[22px]">
              <label className="block text-[12px] font-medium text-[#475569] mb-2">
                Venue{' '}
                <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
              </label>
              <VenueAutocomplete
                key={venueKey}
                value={form.venue_name}
                onSelect={(v: VenueSelection) => {
                  update('venue_name', v.name)
                  update('venue_address', v.address)
                }}
                onChange={(val) => update('venue_name', val)}
                placeholder="Search for a venue or sports centre"
              />
              {form.venue_name && (
                <div className="flex items-start justify-between mt-2">
                  <p className="text-[12px] text-[#64748B] leading-snug">
                    {form.venue_address || form.venue_name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      update('venue_name', '')
                      update('venue_address', '')
                      setVenueKey((k) => k + 1)
                    }}
                    className="ml-3 flex-shrink-0 text-[#94A3B8] hover:text-[#475569] text-[16px] leading-none transition-colors"
                    aria-label="Clear venue"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Save error */}
          {saveError && (
            <p className="text-sm text-red-600 mb-4">{saveError}</p>
          )}

          {/* Bottom action bar */}
          <div className="flex items-center justify-between pt-5 border-t border-[#F1F5F9]">
            <button
              type="button"
              onClick={() => router.push('/coach/programmes')}
              className="h-12 px-6 rounded-full text-[15px] font-medium text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !form.title.trim()}
              onClick={handleSave}
              className="h-12 px-8 rounded-full bg-[#0077CC] hover:bg-[#0066AA] text-white text-[15px] font-medium flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save changes
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
