'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Calendar, RefreshCw, CreditCard, Layers } from 'lucide-react'
import { VenueAutocomplete, type VenueSelection } from '@/components/coach/shared/LocationAutocomplete'
import { ProgrammeImagePicker } from '@/components/coach/shared/ProgrammeImagePicker'

// BUG-PROGRAMME-CREATE-PREVIEW-LOST: accepted as a regression. The previous
// CustomEvent dispatch + ProgrammePreviewEventDetail interface were deleted
// when DS-RIGHT-PANEL-01 removed the right-panel consumer. A reinstated
// inline preview panel was also removed — coaches now see the form only.

interface Sport {
  id: string
  sport_id: string
  sport_name: string
}

interface FormData {
  // Step 1
  title: string
  description: string
  sport_id: string
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  // Step 2
  schedule_type: 'fixed' | 'rolling'
  days_of_week: number[]          // Fix-58-4: multi-select
  start_time: string
  duration_minutes: number
  fixed_schedule_mode: 'count' | 'end_date'  // Fix-58-5
  session_count: number
  programme_end_date: string      // Fix-58-5: for fixed end-date mode
  rolling_end_date: string        // Fix-58-8: optional rolling end
  excluded_dates: string[]        // Fix-58-6: session exclusions
  // Step 2 — venue (optional)
  venue_name: string
  venue_address: string
  // Step 3
  max_spots: number
  min_participants: number
  payment_type: 'per_session' | 'block_upfront'
  price_pence: number
  late_joining_allowed: boolean
  cancellation_window_hours: number
  // CF-PROGRAMMES-IMAGE-PICKER: cover photo URL (Unsplash curated or upload).
  image_url: string | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DURATIONS = [30, 45, 60, 90, 120]
const SKILL_LEVELS: { value: FormData['skill_level']; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all', label: 'All levels' },
]

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  const hour = parseInt(h, 10)
  const suffix = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${m}${suffix}`
}

function penceToDisplay(pence: number): string {
  return (pence / 100).toFixed(0)
}

function displayToPence(val: string): number {
  const n = parseFloat(val.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100)
}

function formatDaysLabel(days: number[]): string {
  if (days.length === 0) return '—'
  return [...days].sort((a, b) => a - b).map((d) => DAYS[d]).join(', ')
}

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function generateSessionDates(
  days: number[],
  mode: 'count' | 'end_date',
  count: number,
  endDateStr: string,
): string[] {
  const dates: string[] = []
  if (days.length === 0) return dates

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() + 1)

  if (mode === 'count') {
    const cur = new Date(start)
    let generated = 0
    const limit = count * 7 + 30
    let iter = 0
    while (generated < count && iter < limit) {
      if (days.includes(cur.getDay())) {
        dates.push(cur.toISOString().split('T')[0])
        generated++
      }
      cur.setDate(cur.getDate() + 1)
      iter++
    }
  } else if (mode === 'end_date' && endDateStr) {
    const end = new Date(endDateStr + 'T00:00:00')
    const cur = new Date(start)
    while (cur <= end) {
      if (days.includes(cur.getDay())) {
        dates.push(cur.toISOString().split('T')[0])
      }
      cur.setDate(cur.getDate() + 1)
    }
  }
  return dates
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

// Fix-58-7: Clickable step dots matching onboarding style
function StepDots({
  step,
  total,
  onStepClick,
}: {
  step: number
  total: number
  onStepClick: (targetStep: number) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const isCompleted = i < step - 1
        const isCurrent = i === step - 1
        if (isCompleted) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onStepClick(i + 1)}
              className="w-6 h-2 rounded-full bg-[#0077CC] cursor-pointer hover:bg-[#0066AA] transition-colors"
              aria-label={`Go to step ${i + 1}`}
            />
          )
        }
        if (isCurrent) {
          return <span key={i} className="w-6 h-2 rounded-full bg-[#0077CC]" />
        }
        return <span key={i} className="w-2 h-2 rounded-full bg-[#E2E8F0]" />
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CreateProgramme() {
  const router = useRouter()
  // Fix-62-2: Hydration guard — page title changed in Fix-60 causes server/client mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [step, setStep] = useState(1)
  const [sports, setSports] = useState<Sport[]>([])
  const [loadingSports, setLoadingSports] = useState(true)

  // Fix-67-UI: venueKey forces VenueAutocomplete remount on clear (uncontrolled input)
  const [venueKey, setVenueKey] = useState(0)

  // Fix-58-3: auto-save state
  const [programmeId, setProgrammeId] = useState<string | null>(null)
  const [autoSaving, setAutoSaving] = useState(false)
  const [continueError, setContinueError] = useState<string | null>(null)

  // Step 4 final save
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    sport_id: '',
    skill_level: 'all',
    schedule_type: 'fixed',
    days_of_week: [6],             // Saturday default
    start_time: '09:00',
    duration_minutes: 60,
    fixed_schedule_mode: 'count',
    session_count: 8,
    programme_end_date: '',
    rolling_end_date: '',
    excluded_dates: [],
    venue_name: '',
    venue_address: '',
    max_spots: 8,
    min_participants: 0,
    payment_type: 'per_session',
    price_pence: 2800,
    late_joining_allowed: false,
    cancellation_window_hours: 24,
    image_url: null,
  })

  // Fix-58-9: fetch from /api/coaches/sports (coach's configured sports + valid sport_ids)
  useEffect(() => {
    async function fetchSports() {
      try {
        const res = await fetch('/api/coaches/sports')
        if (!res.ok) return
        const data = await res.json()
        const sportList: Sport[] = (data.sports || []).map(
          (s: { id: string; sport_id: string; sport_name: string }) => ({
            id: s.id,
            sport_id: s.sport_id, // sports table UUID — correct field for API
            sport_name: s.sport_name,
          }),
        )
        setSports(sportList)
        if (sportList.length > 0) {
          setForm((f) => ({ ...f, sport_id: sportList[0].sport_id }))
        }
      } finally {
        setLoadingSports(false)
      }
    }
    fetchSports()
  }, [])

  // BUG-PROGRAMME-CREATE-PREVIEW-LOST: CustomEvent dispatch deleted.
  // Preview reads form/sports/step directly via <ProgrammeCreatePreview />.

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Fix-58-4: toggle a day in/out of days_of_week array
  function toggleDay(dayIndex: number) {
    const current = form.days_of_week
    if (current.includes(dayIndex)) {
      if (current.length === 1) return // prevent empty selection
      update('days_of_week', current.filter((d) => d !== dayIndex))
    } else {
      update('days_of_week', [...current, dayIndex].sort((a, b) => a - b))
    }
  }

  // Fix-58-6: toggle a session date in/out of excluded_dates
  function toggleExcludeDate(dateStr: string) {
    const current = form.excluded_dates
    if (current.includes(dateStr)) {
      update('excluded_dates', current.filter((d) => d !== dateStr))
    } else {
      update('excluded_dates', [...current, dateStr])
    }
  }

  // Fix-58-6: computed session dates
  const sessionDates = useMemo(() => {
    if (form.schedule_type !== 'fixed') return []
    if (form.days_of_week.length === 0) return []
    if (form.fixed_schedule_mode === 'count' && form.session_count < 2) return []
    if (form.fixed_schedule_mode === 'end_date' && !form.programme_end_date) return []
    return generateSessionDates(
      form.days_of_week,
      form.fixed_schedule_mode,
      form.session_count,
      form.programme_end_date,
    )
  }, [
    form.schedule_type,
    form.days_of_week,
    form.fixed_schedule_mode,
    form.session_count,
    form.programme_end_date,
  ])

  const activeSessionCount = sessionDates.filter((d) => !form.excluded_dates.includes(d)).length

  function canContinue(): boolean {
    if (step === 1) return form.title.trim().length > 0 && form.sport_id.length > 0
    if (step === 2) {
      if (form.days_of_week.length === 0 || !form.start_time || !form.duration_minutes) return false
      if (form.schedule_type === 'fixed') {
        if (form.fixed_schedule_mode === 'count') return form.session_count >= 2
        return form.programme_end_date.length > 0
      }
      return true
    }
    if (step === 3) return form.max_spots >= 2 && form.price_pence >= 100
    return true
  }

  // Build full POST body (used at step 1 and as fallback on step 4 publish)
  function buildPostBody(status: 'draft' | 'active'): Record<string, unknown> {
    const body: Record<string, unknown> = {
      sport_id: form.sport_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      skill_level: form.skill_level,
      schedule_type: form.schedule_type,
      day_of_week: form.days_of_week[0] ?? 6,
      days_of_week: form.days_of_week,
      start_time: form.start_time,
      duration_minutes: form.duration_minutes,
      max_spots: form.max_spots,
      min_participants: form.min_participants || null,
      payment_type: form.payment_type,
      late_joining_allowed: form.late_joining_allowed,
      cancellation_window_hours: form.cancellation_window_hours,
      venue_name: form.venue_name || null,
      venue_address: form.venue_address || null,
      image_url: form.image_url,
      status,
    }
    if (form.schedule_type === 'fixed' && form.fixed_schedule_mode === 'count') {
      body.session_count = form.session_count
    }
    if (form.payment_type === 'per_session') {
      body.price_per_session_pence = form.price_pence
    } else {
      body.block_price_pence = form.price_pence
      body.block_session_count = form.session_count
      body.price_per_session_pence = form.price_pence
    }
    return body
  }

  // Fix-58-3: auto-save on Continue
  async function handleContinue() {
    if (!canContinue()) return
    setAutoSaving(true)
    setContinueError(null)

    try {
      if (step === 1) {
        // Create draft with all current form data (defaults included)
        const res = await fetch('/api/coaches/programmes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPostBody('draft')),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save draft')
        }
        const data = await res.json()
        setProgrammeId(data.id)
      } else if (step === 2) {
        if (!programmeId) throw new Error('No programme ID — please go back to step 1.')
        const patchBody: Record<string, unknown> = {
          schedule_type: form.schedule_type,
          day_of_week: form.days_of_week[0] ?? 6,
          days_of_week: form.days_of_week,
          start_time: form.start_time,
          duration_minutes: form.duration_minutes,
          venue_name: form.venue_name || null,
          venue_address: form.venue_address || null,
        }
        const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save schedule')
        }
      } else if (step === 3) {
        if (!programmeId) throw new Error('No programme ID — please go back to step 1.')
        const patchBody: Record<string, unknown> = {
          max_spots: form.max_spots,
          min_participants: form.min_participants || null,
          payment_type: form.payment_type,
          cancellation_window_hours: form.cancellation_window_hours,
        }
        if (form.payment_type === 'per_session') {
          patchBody.price_per_session_pence = form.price_pence
        } else {
          patchBody.block_price_pence = form.price_pence
          patchBody.block_session_count = form.session_count
          patchBody.price_per_session_pence = form.price_pence
        }
        // TODO Fix-59: add late_joining_allowed to PATCH route
        const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to save settings')
        }
      }
      setStep((s) => s + 1)
    } catch (err) {
      setContinueError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setAutoSaving(false)
    }
  }

  async function submit(publishNow: boolean) {
    if (!publishNow) {
      // Save as draft — already auto-saved, just redirect
      router.push('/coach/programmes')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (programmeId) {
        const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to publish programme')
        }
      } else {
        // Fallback: create and publish in one call
        const res = await fetch('/api/coaches/programmes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPostBody('active')),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to create programme')
        }
      }
      router.push('/coach/programmes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // Derived values for review step
  const sport = sports.find((s) => s.sport_id === form.sport_id)
  const skillLabel = SKILL_LEVELS.find((s) => s.value === form.skill_level)?.label ?? ''
  const daysLabel = formatDaysLabel(form.days_of_week)
  const priceDisplay = form.price_pence > 0 ? `£${penceToDisplay(form.price_pence)}` : '£—'

  let scheduleTypeValue: string
  if (form.schedule_type === 'fixed') {
    if (form.fixed_schedule_mode === 'count') {
      scheduleTypeValue = `Fixed · ${form.session_count} sessions`
    } else {
      const endFmt = form.programme_end_date
        ? new Date(form.programme_end_date + 'T00:00:00').toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short',
          })
        : '—'
      scheduleTypeValue = `Fixed · ends ${endFmt}`
    }
  } else {
    scheduleTypeValue = form.rolling_end_date
      ? `Rolling · ends ${new Date(form.rolling_end_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      : 'Rolling · ongoing'
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-white"> {/* Fix-58-1: white background */}
      <div className="max-w-[760px] mx-auto px-8 py-6 pb-16">

        {/* Card */}
        <div className="bg-white border border-[#E2E8F0] rounded-[20px] px-10 py-8 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-5">
            <button
              type="button"
              onClick={() => (step > 1 ? setStep((s) => s - 1) : router.push('/coach/programmes'))}
              className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0F172A] transition-colors"
            >
              <ArrowLeft size={15} />
              {step === 1 ? 'Back to programmes' : 'Back'}
            </button>
            {/* Fix-58-7: clickable step dots matching onboarding style */}
            <StepDots step={step} total={4} onStepClick={setStep} />
          </div>

          {/* Step tag */}
          <span className="inline-block text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] bg-[#F1F5F9] px-2.5 py-1 rounded-full mb-2">
            Step {step} of 4
          </span>

          {/* Fix-60-1: Fixed page-level title — same on all steps */}
          <h1 className="text-[22px] font-bold text-gray-900 mt-1 mb-1">Create Programme</h1>

          {/* ── STEP 1 — Name your programme ── */}
          {step === 1 && (
            <>
              <p className="text-[16px] text-gray-500 font-normal mt-0 mb-6">Name your programme</p>

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
                  Description <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
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
                {loadingSports ? (
                  <div className="flex items-center gap-2 text-[#64748B] text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    Loading sports…
                  </div>
                ) : sports.length === 0 ? (
                  <p className="text-sm text-[#94A3B8]">No sports configured. Add a sport in your profile first.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sports.map((s) => (
                      <PillButton
                        key={s.sport_id}
                        active={form.sport_id === s.sport_id}
                        onClick={() => update('sport_id', s.sport_id)}
                      >
                        {s.sport_name}
                      </PillButton>
                    ))}
                  </div>
                )}
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
              {/* CF-PROGRAMMES-IMAGE-PICKER: only after sport is chosen — picker
                  filters curated images by sport, and a sport must be selected
                  for it to render anything meaningful. */}
              {form.sport_id && (
                <div className="mb-[22px]">
                  <label className="block text-[12px] font-medium text-[#475569] mb-2">
                    Cover photo <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
                  </label>
                  <ProgrammeImagePicker
                    value={form.image_url}
                    sportName={sports.find((s) => s.sport_id === form.sport_id)?.sport_name ?? 'Cricket'}
                    onChange={(url) => update('image_url', url)}
                  />
                </div>
              )}
            </>
          )}

          {/* ── STEP 2 — When does it run ── */}
          {step === 2 && (
            <>
              <p className="text-[16px] text-gray-500 font-normal mt-0 mb-6">When does it run?</p>

              {/* Schedule type */}
              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Schedule type</label>
                <div className="grid grid-cols-2 gap-3">
                  <SelectCard
                    active={form.schedule_type === 'fixed'}
                    onClick={() => update('schedule_type', 'fixed')}
                    icon={<Calendar size={20} strokeWidth={1.8} />}
                    title="Fixed"
                    description="Set number of sessions with start and end date."
                  />
                  <SelectCard
                    active={form.schedule_type === 'rolling'}
                    onClick={() => update('schedule_type', 'rolling')}
                    icon={<RefreshCw size={20} strokeWidth={1.8} />}
                    title="Rolling"
                    description="Ongoing — participants join anytime."
                  />
                </div>
              </div>

              {/* Day of week — Fix-58-4: multi-select */}
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

              {/* Start time + Duration */}
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

              {/* Fix-58-5: Fixed — sessions count OR end date */}
              {form.schedule_type === 'fixed' && (
                <div className="mb-[22px]">
                  <label className="block text-[12px] font-medium text-[#475569] mb-3">Programme length</label>
                  <div className="flex flex-col gap-3">
                    {/* Radio: Number of sessions */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="fixed_schedule_mode"
                        checked={form.fixed_schedule_mode === 'count'}
                        onChange={() => {
                          update('fixed_schedule_mode', 'count')
                          update('programme_end_date', '')
                        }}
                        className="mt-1 accent-[#0077CC]"
                      />
                      <div className="flex-1">
                        <span className="text-[14px] font-medium text-[#0F172A]">Number of sessions</span>
                        {form.fixed_schedule_mode === 'count' && (
                          <div className="mt-2">
                            <input
                              type="number"
                              min={2}
                              max={52}
                              value={form.session_count}
                              onChange={(e) => update('session_count', Math.max(2, parseInt(e.target.value) || 2))}
                              className="w-[120px] px-4 py-2.5 border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                            />
                            <p className="text-[12px] text-[#94A3B8] mt-1.5">
                              Runs for {form.session_count} consecutive{' '}
                              {form.days_of_week.length === 1
                                ? `${DAY_FULL[form.days_of_week[0]]}s`
                                : 'sessions'}.
                            </p>
                          </div>
                        )}
                      </div>
                    </label>

                    {/* Radio: End date */}
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="fixed_schedule_mode"
                        checked={form.fixed_schedule_mode === 'end_date'}
                        onChange={() => {
                          update('fixed_schedule_mode', 'end_date')
                          update('session_count', 0)
                        }}
                        className="mt-1 accent-[#0077CC]"
                      />
                      <div className="flex-1">
                        <span className="text-[14px] font-medium text-[#0F172A]">End date</span>
                        {form.fixed_schedule_mode === 'end_date' && (
                          <div className="mt-2">
                            <input
                              type="date"
                              value={form.programme_end_date}
                              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                              onChange={(e) => update('programme_end_date', e.target.value)}
                              className="px-4 py-2.5 border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                            />
                            {form.programme_end_date && (
                              <p className="text-[12px] text-[#94A3B8] mt-1.5">
                                Programme ends{' '}
                                {new Date(form.programme_end_date + 'T00:00:00').toLocaleDateString('en-GB', {
                                  weekday: 'long', day: 'numeric', month: 'long',
                                })}.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Fix-58-8: Rolling — optional end date */}
              {form.schedule_type === 'rolling' && (
                <div className="mb-[22px]">
                  <label className="block text-[12px] font-medium text-[#475569] mb-2">
                    End date <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
                  </label>
                  <input
                    type="date"
                    value={form.rolling_end_date}
                    min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                    onChange={(e) => update('rolling_end_date', e.target.value)}
                    className="px-4 py-2.5 border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                  />
                  <p className="text-[12px] text-[#94A3B8] mt-2">Leave blank for an ongoing programme.</p>
                </div>
              )}

              {/* Fix-67-UI: Venue picker — VenueAutocomplete (establishment+geocode) */}
              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">
                  Venue <span className="text-[11px] text-[#94A3B8] font-normal ml-1">(optional)</span>
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

              {/* Fix-58-6: Session exclusion editor */}
              {sessionDates.length > 0 && (
                <div className="mb-[22px]">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-[12px] font-medium text-[#475569]">Sessions</label>
                    <span className="text-[12px] text-[#64748B]">
                      {activeSessionCount} of {sessionDates.length} active
                    </span>
                  </div>
                  <div className="border border-[#E2E8F0] rounded-[12px] overflow-hidden">
                    {sessionDates.map((dateStr, idx) => {
                      const isExcluded = form.excluded_dates.includes(dateStr)
                      return (
                        <div
                          key={dateStr}
                          className={`flex items-center justify-between px-4 py-3 ${
                            idx < sessionDates.length - 1 ? 'border-b border-[#F1F5F9]' : ''
                          }`}
                        >
                          <span
                            className={`text-[14px] font-medium ${
                              isExcluded ? 'line-through text-[#94A3B8]' : 'text-[#0F172A]'
                            }`}
                          >
                            {formatSessionDate(dateStr)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleExcludeDate(dateStr)}
                            className={`text-[12px] font-medium px-2.5 py-1 rounded-[6px] transition-colors ${
                              isExcluded
                                ? 'text-[#0077CC] bg-[#E6F3FB] hover:bg-[#D0EAFA]'
                                : 'text-[#94A3B8] hover:text-[#475569] hover:bg-[#F1F5F9]'
                            }`}
                          >
                            {isExcluded ? 'Include' : 'Skip'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 3 — Spots and payment ── */}
          {step === 3 && (
            <>
              <p className="text-[16px] text-gray-500 font-normal mt-0 mb-6">Spots and payment</p>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Maximum spots</label>
                <div className="inline-flex items-center border border-[#E2E8F0] rounded-[12px] overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => update('max_spots', Math.max(2, form.max_spots - 1))}
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
                    onClick={() => update('max_spots', form.max_spots + 1)}
                    className="w-11 h-12 flex items-center justify-center text-[#475569] text-lg hover:bg-[#F8FAFC] transition-colors"
                    aria-label="Increase"
                  >
                    +
                  </button>
                </div>
                <p className="text-[12px] text-[#94A3B8] mt-2">Minimum 2 participants.</p>
              </div>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">
                  Minimum participants{' '}
                  <span className="text-[11px] text-[#94A3B8] font-normal ml-1">Optional</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={form.max_spots - 1}
                  value={form.min_participants === 0 ? '' : form.min_participants}
                  onChange={(e) => {
                    const val = parseInt(e.target.value)
                    update('min_participants', isNaN(val) ? 0 : Math.min(Math.max(0, val), form.max_spots - 1))
                  }}
                  placeholder="e.g. 4"
                  className="w-[120px] px-4 py-2.5 border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                />
                <p className="text-[12px] text-[#94A3B8] mt-1.5">Cancel automatically if minimum not met by session time.</p>
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
                <label className="block text-[12px] font-medium text-[#475569] mb-2">
                  {form.payment_type === 'per_session' ? 'Price per session' : 'Block price'}
                </label>
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

              <div className="mb-[22px]">
                <div className="flex items-center justify-between px-4 py-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
                  <div>
                    <p className="text-[14px] font-medium text-[#0F172A]">Allow late joining</p>
                    <p className="text-[13px] text-[#64748B] mt-0.5">Parents can book after the programme starts.</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.late_joining_allowed}
                    onClick={() => update('late_joining_allowed', !form.late_joining_allowed)}
                    className={`w-10 h-6 rounded-full relative flex-shrink-0 transition-colors ${
                      form.late_joining_allowed ? 'bg-[#0077CC]' : 'bg-[#CBD5E1]'
                    }`}
                  >
                    <span
                      className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-[left] ${
                        form.late_joining_allowed ? 'left-[18px]' : 'left-[2px]'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="mb-[22px]">
                <label className="block text-[12px] font-medium text-[#475569] mb-2">Cancellation window</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { value: 0, label: 'No cancellations' },
                    { value: 12, label: '12h' },
                    { value: 24, label: '24h' },
                    { value: 48, label: '48h' },
                    { value: 72, label: '72h' },
                  ] as { value: number; label: string }[]).map(({ value, label }) => (
                    <PillButton
                      key={value}
                      active={form.cancellation_window_hours === value}
                      onClick={() => update('cancellation_window_hours', value)}
                    >
                      {label}
                    </PillButton>
                  ))}
                </div>
                <p className="text-[12px] text-[#94A3B8] mt-2">Parents cannot cancel within this many hours of the session.</p>
              </div>
            </>
          )}

          {/* ── STEP 4 — Review & save ── */}
          {step === 4 && (
            <>
              <p className="text-[16px] text-gray-500 font-normal mt-0 mb-6">Review &amp; save</p>

              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden mb-6">
                {[
                  { key: 'Programme', value: form.title },
                  { key: 'Sport', value: sport?.sport_name ?? '—', chip: true },
                  { key: 'Skill level', value: skillLabel },
                  {
                    key: 'Schedule',
                    value: `Every ${daysLabel} · ${formatTime(form.start_time)} · ${form.duration_minutes} min`,
                  },
                  { key: 'Type', value: scheduleTypeValue },
                  { key: 'Capacity', value: `${form.max_spots} spots` },
                  {
                    key: 'Price',
                    value:
                      form.payment_type === 'per_session'
                        ? `${priceDisplay} per session`
                        : `${priceDisplay} upfront`,
                  },
                  {
                    key: 'Late joining',
                    value: form.late_joining_allowed ? 'Allowed' : 'Not allowed',
                    muted: !form.late_joining_allowed,
                  },
                ].map(({ key, value, chip, muted }) => (
                  <div
                    key={key}
                    className="grid grid-cols-[180px_1fr] px-5 py-4 border-b border-[#F1F5F9] last:border-0 items-center"
                  >
                    <span className="text-[13px] text-[#64748B] font-medium">{key}</span>
                    <span
                      className={`text-[15px] font-medium flex items-center gap-2 ${muted ? 'text-[#64748B]' : 'text-[#0F172A]'}`}
                    >
                      {chip ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-[6px] bg-[#E6F3FB] text-[#0C447C]">
                          {value}
                        </span>
                      ) : (
                        value
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {error && <p className="text-sm text-red-600 mb-4 text-center">{error}</p>}

              <div className="flex flex-col gap-2.5 max-w-[560px] mx-auto w-full">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => submit(false)}
                  className="h-[52px] rounded-full bg-[#0077CC] hover:bg-[#0066AA] text-white text-[15px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Save as draft
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => submit(true)}
                  className="h-[52px] rounded-full bg-white border-[1.5px] border-[#0077CC] text-[#0077CC] hover:bg-[#F0F7FF] text-[15px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  Publish now
                </button>
                <p className="text-[13px] text-[#64748B] text-center mt-1 leading-snug">
                  Drafts are only visible to you. Publish when ready for parents to book.
                </p>
              </div>
            </>
          )}

          {/* ── Bottom action bar (steps 1–3) ── */}
          {step < 4 && (
            <div className="flex items-center justify-between mt-7 pt-5 border-t border-[#F1F5F9]">
              <button
                type="button"
                onClick={() => (step > 1 ? setStep((s) => s - 1) : router.push('/coach/programmes'))}
                className="h-12 px-6 rounded-full text-[15px] font-medium text-[#475569] hover:text-[#0F172A] transition-colors"
              >
                {step === 1 ? 'Save draft' : '← Back'}
              </button>

              <div className="flex items-center gap-3">
                {/* Fix-58-3: auto-saving indicator */}
                {autoSaving && (
                  <span className="flex items-center gap-1.5 text-[13px] text-[#64748B]">
                    <Loader2 size={13} className="animate-spin" />
                    Saving…
                  </span>
                )}
                {continueError && !autoSaving && (
                  <span className="text-[12px] text-red-500 max-w-[200px] text-right leading-tight">
                    {continueError}
                  </span>
                )}
                <button
                  type="button"
                  disabled={!canContinue() || autoSaving}
                  onClick={handleContinue}
                  className="h-12 px-6 rounded-full bg-[#0077CC] hover:bg-[#0066AA] text-white text-[15px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
