'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Calendar, RefreshCw, CreditCard, Layers, Sun, Info, AlertTriangle } from 'lucide-react'
import { VenueAutocomplete, type VenueSelection } from '@/components/coach/shared/LocationAutocomplete'
import { ProgrammeImagePicker } from '@/components/coach/shared/ProgrammeImagePicker'
import { PayoutEstimate } from '@/components/coach/shared/PayoutEstimate'
import { DatePicker, TimePicker, todayYYYYMMDD } from '@/components/ui'
import { PROGRAMME_AGE_GROUPS, type ProgrammeAgeGroup, ALL_AGES_LABEL, type SessionEntry } from './programmeConstants'
import { SessionCalendar } from './SessionCalendar'
import { ShareCardModal } from './ShareCardModal'

// BUG-PROGRAMME-CREATE-PREVIEW-LOST: accepted as a regression. The previous
// CustomEvent dispatch + ProgrammePreviewEventDetail interface were deleted
// when DS-RIGHT-PANEL-01 removed the right-panel consumer. A reinstated
// inline preview panel was also removed — coaches now see the form only.

interface Sport {
  id: string
  sport_id: string
  sport_name: string
}

// UX-19: a 409 carries a human-readable `message` explaining what overlaps and
// what to do — it must reach the coach, not be collapsed into `data.error`
// (the constant "Conflict detected").
class ConflictError extends Error {}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  if (res.status === 409) {
    throw new ConflictError(data.message || data.error || 'Conflict detected')
  }
  throw new Error(data.error || fallback)
}

interface FormData {
  // Step 1
  title: string
  description: string
  sport_id: string
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  // CF-PROG-AGE-GROUP: target age groups (min 1, "All ages" XOR specific groups)
  age_groups: ProgrammeAgeGroup[]
  // Step 2
  schedule_type: 'fixed' | 'rolling'
  days_of_week: number[]          // Fix-58-4: multi-select
  start_time: string
  // CF-PROG-SESSION-LIST: end_time replaces the Duration pill row in Step 2.
  // duration_minutes is now DERIVED from (end_time − start_time) at API write time.
  end_time: string
  duration_minutes: number
  session_count: number
  rolling_end_date: string        // Fix-58-8: optional rolling end
  // CF-PROG-START-DATE: anchor date — Rolling Start date (UI-exposed),
  // Fixed seed anchor (UI-hidden, defaults to today on calendar seed).
  starts_at: string
  // CF-PROG-SESSION-LIST: SessionCalendar-managed list of scheduled sessions.
  // Server derives starts_at / session_count / ends_at from this array.
  session_dates: SessionEntry[]
  campMode: boolean
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

// CF-PROG-SESSION-LIST: derive duration_minutes from start+end HH:MM strings.
// Handles same-day cross-midnight programmes (end < start → wraps to next day).
function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map((s) => parseInt(s, 10))
  const [eh, em] = end.split(':').map((s) => parseInt(s, 10))
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff < 0 ? diff + 1440 : diff
}

// UI-DATE-PICKER: todayYYYYMMDD() now lives in src/components/ui/DatePicker.tsx
// (BST-safe shared helper) — imported above. Local definition removed.

// CF-PROG-SESSION-LIST: session enumeration + preview now live inside
// SessionCalendar. Old in-file generateSessionDates / formatSessionDate /
// formatPreviewDate helpers removed alongside the deleted Step 2 date
// input + flat list.

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
      {/* Fix-54: Check icon removed — brand bg + white text already signals selection,
          and the icon caused layout shift on toggle (extra ~19px when active). */}
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
  // UX-19: scheduling-conflict 409s get a prominent banner and block Continue /
  // Publish until the coach changes something (any form edit or step change
  // clears it, re-enabling the buttons).
  const [conflictError, setConflictError] = useState<string | null>(null)

  // Step 4 final save
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // CF-PROG-SHARE-CARD: when a programme is published successfully, open the
  // share modal in place. Router push to /coach/programmes happens on close.
  const [publishedShareId, setPublishedShareId] = useState<string | null>(null)
  // Stable onClose so ShareCardModal's effects don't re-register every render.
  const handlePublishedShareClose = useCallback(() => {
    setPublishedShareId(null)
    router.push('/coach/programmes')
  }, [router])

  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    sport_id: '',
    skill_level: 'all',
    age_groups: [ALL_AGES_LABEL],
    schedule_type: 'fixed',
    days_of_week: [6],             // Saturday default
    start_time: '09:00',
    end_time: '10:00',             // CF-PROG-SESSION-LIST: start + 60 min on init
    duration_minutes: 60,
    session_count: 8,
    rolling_end_date: '',
    starts_at: '',
    session_dates: [],
    campMode: false,
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

  // UX-19: any edit or step change invalidates a previously reported conflict —
  // the coach adjusted something, so let them try Continue / Publish again.
  useEffect(() => {
    setConflictError(null)
  }, [form, step])

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

  // CF-PROG-AGE-GROUP: "All ages" is mutually exclusive with specific groups.
  // Min 1 selection enforced — last-pill click is a no-op.
  function toggleAgeGroup(group: ProgrammeAgeGroup) {
    const current = form.age_groups
    if (group === ALL_AGES_LABEL) {
      if (current.includes(ALL_AGES_LABEL)) return
      update('age_groups', [ALL_AGES_LABEL])
      return
    }
    const without = current.filter((g) => g !== ALL_AGES_LABEL && g !== group)
    if (current.includes(group)) {
      if (without.length === 0) return
      update('age_groups', without)
    } else {
      update('age_groups', [...without, group])
    }
  }

  // CF-PROG-SESSION-LIST: excluded_dates + sessionDates useMemo deleted
  // alongside the flat list UI. SessionCalendar manages its own internal
  // state and emits the canonical session_dates array back via onChange.

  function canContinue(): boolean {
    if (step === 1)
      return (
        form.title.trim().length > 0 &&
        form.sport_id.length > 0 &&
        form.age_groups.length > 0
      )
    if (step === 2) {
      if (form.days_of_week.length === 0 || !form.start_time || !form.end_time) return false
      // CF-PROG-SESSION-LIST step-2 gating (this task tightens it):
      //   Fixed   → session_dates.length EXACTLY matches session_count
      //             AND starts_at (Commencing date) is set
      //   Rolling → Start date set
      if (form.schedule_type === 'fixed') {
        if (!form.starts_at) return false
        return form.session_dates.length === form.session_count
      }
      return form.starts_at.length > 0
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
      age_groups: form.age_groups,
      schedule_type: form.schedule_type,
      day_of_week: form.days_of_week[0] ?? 6,
      days_of_week: form.days_of_week,
      start_time: form.start_time,
      // CF-PROG-SESSION-LIST: derived from end_time − start_time (no UI pill).
      duration_minutes: diffMinutes(form.start_time, form.end_time),
      max_spots: form.max_spots,
      min_participants: form.min_participants || null,
      payment_type: form.payment_type,
      late_joining_allowed: form.late_joining_allowed,
      cancellation_window_hours: form.cancellation_window_hours,
      venue_name: form.venue_name || null,
      venue_address: form.venue_address || null,
      image_url: form.image_url,
      // CF-PROG-SESSION-LIST: server now derives starts_at, ends_at, and
      // session_count from session_dates (when non-empty). starts_at and
      // rolling_end_date remain as fallbacks for Rolling-with-no-sessions.
      starts_at: form.starts_at || null,
      rolling_end_date:
        form.schedule_type === 'rolling' && form.rolling_end_date ? form.rolling_end_date : null,
      session_dates: form.session_dates,
      // CF-PROG-SESSION-LIST: STUB — server ignores this until CF-PROG-SESSIONS-DB.
      campMode: form.campMode,
      status,
    }
    if (form.schedule_type === 'fixed') {
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
    setConflictError(null)

    try {
      if (step === 1) {
        // Create draft with all current form data (defaults included)
        const res = await fetch('/api/coaches/programmes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPostBody('draft')),
        })
        if (!res.ok) {
          await throwApiError(res, 'Failed to save draft')
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
          duration_minutes: diffMinutes(form.start_time, form.end_time),
          venue_name: form.venue_name || null,
          venue_address: form.venue_address || null,
          // CF-PROG-SESSION-LIST: session_dates is now the canonical source.
          // starts_at + rolling_end_date stay for Rolling-with-no-sessions.
          starts_at: form.starts_at || null,
          rolling_end_date:
            form.schedule_type === 'rolling' ? form.rolling_end_date || null : null,
          session_dates: form.session_dates,
          campMode: form.campMode,
        }
        if (form.schedule_type === 'fixed') {
          patchBody.session_count = form.session_count
        }
        const res = await fetch(`/api/coaches/programmes/${programmeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        })
        if (!res.ok) {
          await throwApiError(res, 'Failed to save schedule')
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
          await throwApiError(res, 'Failed to save settings')
        }
      }
      setStep((s) => s + 1)
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictError(err.message)
      } else {
        setContinueError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
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
      let activeId = programmeId
      if (activeId) {
        const res = await fetch(`/api/coaches/programmes/${activeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        })
        if (!res.ok) {
          await throwApiError(res, 'Failed to publish programme')
        }
      } else {
        // Fallback: create and publish in one call
        const res = await fetch('/api/coaches/programmes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPostBody('active')),
        })
        if (!res.ok) {
          await throwApiError(res, 'Failed to create programme')
        }
        const created: { id: string } = await res.json()
        activeId = created.id
      }
      // CF-PROG-SHARE-CARD: open share modal in place; router push deferred to close.
      setPublishedShareId(activeId)
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflictError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    } finally {
      setSaving(false)
    }
  }

  // UX-19: prominent inline conflict alert — rendered above the step 1–3 action
  // bar and above the step-4 publish CTAs.
  const conflictBanner = conflictError ? (
    <div
      role="alert"
      data-testid="conflict-banner"
      className="flex items-start gap-2.5 rounded-[10px] bg-danger/10 p-3.5 text-danger"
    >
      <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <p className="min-w-0 text-sm font-medium">{conflictError}</p>
    </div>
  ) : null

  // Derived values for review step
  const sport = sports.find((s) => s.sport_id === form.sport_id)
  const skillLabel = SKILL_LEVELS.find((s) => s.value === form.skill_level)?.label ?? ''
  const daysLabel = formatDaysLabel(form.days_of_week)
  const priceDisplay = form.price_pence > 0 ? `£${penceToDisplay(form.price_pence)}` : '£—'

  // CF-PROG-SESSION-LIST: derive review summaries from session_dates (calendar
  // truth) rather than from removed form fields.
  const sessionCount = form.session_dates.length
  const firstSessionDate = sessionCount > 0 ? form.session_dates[0].date : ''
  const lastSessionDate = sessionCount > 0 ? form.session_dates[sessionCount - 1].date : ''
  function fmtShortDate(d: string): string {
    return d
      ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '—'
  }
  let scheduleTypeValue: string
  if (form.schedule_type === 'fixed') {
    scheduleTypeValue = sessionCount > 0
      ? `Fixed · ${sessionCount} session${sessionCount === 1 ? '' : 's'}`
      : 'Fixed'
  } else {
    scheduleTypeValue = form.rolling_end_date
      ? `Rolling · ends ${fmtShortDate(form.rolling_end_date)}`
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
              {/* CF-PROG-AGE-GROUP: age group multi-select. Mirrors days_of_week
                  pattern — same PillButton, same min-1 rule, "All ages" XOR. */}
              <div className="mb-[22px]">
                <label className="block text-xs font-medium text-neutral-600 mb-2">Age groups</label>
                <div className="flex flex-wrap gap-2">
                  {PROGRAMME_AGE_GROUPS.map((g) => (
                    <PillButton
                      key={g}
                      active={form.age_groups.includes(g)}
                      onClick={() => toggleAgeGroup(g)}
                    >
                      {g}
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
                    onClick={() => {
                      update('schedule_type', 'rolling')
                      // Fix-62: camp mode is Fixed-only — clear it on switch.
                      if (form.campMode) update('campMode', false)
                    }}
                    icon={<RefreshCw size={20} strokeWidth={1.8} />}
                    title="Rolling"
                    description="Ongoing — participants join anytime."
                  />
                </div>
              </div>

              {/* Fix-60 + Fix-62: camp mode toggle + info banner. Hoisted above
                  Days of week (was previously after Venue) so coaches see the
                  schedule shape before they pick days. Fixed-only — Rolling
                  programmes can't be camp-format. */}
              {form.schedule_type === 'fixed' && (
                <>
                  <div className={`flex items-center gap-3 p-3.5 rounded-md border mb-3 ${form.campMode ? 'border-brand-600 bg-brand-50' : 'border-neutral-100 bg-white'}`}>
                    <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${form.campMode ? 'bg-white text-brand-600' : 'bg-neutral-50 text-[#94A3B8]'}`}>
                      <Sun size={18} strokeWidth={1.8} />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-[#0F172A] m-0">Camp mode</h4>
                      <p className="text-[12px] text-[#64748B] mt-0.5 m-0">Multiple sessions per day.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.campMode}
                      onClick={() => {
                        // BUG-23 (approved ruling): camps are per_session only —
                        // enabling camp mode forces the payment type.
                        if (!form.campMode && form.payment_type === 'block_upfront') {
                          update('payment_type', 'per_session')
                        }
                        update('campMode', !form.campMode)
                      }}
                      className={`w-10 h-6 rounded-full relative flex-shrink-0 transition-colors ${form.campMode ? 'bg-brand-600' : 'bg-[#CBD5E1]'}`}
                    >
                      <span
                        className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.15)] transition-[left] ${form.campMode ? 'left-[18px]' : 'left-[2px]'}`}
                      />
                    </button>
                  </div>

                  {form.campMode && (
                    <div className="bg-brand-50 rounded-md p-3 flex gap-2.5 items-start mb-[18px]">
                      <Info size={16} className="text-brand-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[13px] text-brand-800 m-0 leading-snug">
                        Parents can book individual sessions or the full day. Each day can have multiple time blocks, priced per session.
                      </p>
                    </div>
                  )}
                </>
              )}

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

              {/* CF-PROG-SESSION-LIST: Commencing date — Fixed only.
                  Required. Rolling keeps its existing Start/End date range below. */}
              {form.schedule_type === 'fixed' && (
                <div className="mb-[22px]">
                  <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                    Commencing date
                  </label>
                  <DatePicker
                    value={form.starts_at}
                    minDate={todayYYYYMMDD()}
                    onChange={(v) => update('starts_at', v)}
                  />
                </div>
              )}

              {/* Fix-61: Rolling date range hoisted to BEFORE the time row so the order
                  (Days → Dates → Times) matches Fixed. Was previously in the trailing
                  ternary's `else` branch. */}
              {form.schedule_type === 'rolling' && (
                <div className="mb-[22px]">
                  <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                    Date range
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1.5">Start date</label>
                      <DatePicker
                        value={form.starts_at}
                        minDate={todayYYYYMMDD()}
                        onChange={(v) => update('starts_at', v)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#475569] mb-1.5">
                        End date <span className="text-[10px] text-[#94A3B8] font-normal ml-1">Optional</span>
                      </label>
                      <DatePicker
                        value={form.rolling_end_date}
                        minDate={form.starts_at || todayYYYYMMDD()}
                        onChange={(v) => update('rolling_end_date', v)}
                      />
                    </div>
                  </div>
                  <p className="text-[12px] text-[#94A3B8] mt-1.5">
                    Leave end date blank for an ongoing programme.
                  </p>
                </div>
              )}

              {/* Fix-60: Start/End time row hidden when camp mode is ON — in camp mode
                  each day's slot times are captured in the SessionCalendar editor,
                  making these top-level fields redundant. */}
              {!form.campMode && (
                <div className="mb-[22px]">
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">Start time</label>
                      <TimePicker
                        value={form.start_time}
                        onChange={(v) => update('start_time', v)}
                      />
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">End time</label>
                      <TimePicker
                        value={form.end_time}
                        onChange={(v) => update('end_time', v)}
                      />
                    </div>
                  </div>
                  {form.end_time <= form.start_time && (
                    <p className="text-[12px] text-red-600 mt-2">
                      End time should be after start time.
                    </p>
                  )}
                </div>
              )}

              {/* Fix-61: Number of sessions — Fixed-only standalone conditional
                  (Rolling date range hoisted above). */}
              {form.schedule_type === 'fixed' && (
                <div className="mb-[22px]">
                  <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                    Number of sessions
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={form.session_count}
                    onChange={(e) => update('session_count', Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full h-11 px-3 rounded-md bg-neutral-50 border border-neutral-100 text-sm text-[#0F172A] focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
                  />
                  <p className="text-[12px] text-[#94A3B8] mt-1.5">
                    {form.days_of_week.length === 1
                      ? `Runs for ${form.session_count} consecutive ${DAY_FULL[form.days_of_week[0]]}s.`
                      : `Runs for ${form.session_count} sessions across the days you selected.`}
                  </p>
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

              {/* Fix-60: divider preserved — separates inputs (above) from
                  the SessionCalendar (below). Camp toggle + banner relocated
                  up to sit beneath Schedule type. */}
              <hr className="border-0 border-t border-neutral-100 my-4" />

              {/* CF-PROG-SESSION-LIST: SessionCalendar handles grid + editor +
                  skipped section. Self-contained — emits the canonical
                  session_dates array via onChange. */}
              <div className="bg-white border border-neutral-100 rounded-md p-4">
                <SessionCalendar
                  scheduleType={form.schedule_type}
                  selectedDays={form.days_of_week}
                  defaultStartTime={form.start_time}
                  defaultEndTime={form.end_time}
                  campMode={form.campMode}
                  startDate={form.starts_at}
                  endDate={form.rolling_end_date}
                  sessionCount={form.session_count}
                  sessions={form.session_dates}
                  onChange={(next) => update('session_dates', next)}
                  onSelectedDaysAdd={(day) => {
                    // CF-PROG-SESSION-LIST: auto-add day-of-week when coach taps
                    // a non-pattern calendar date. The pill highlights without
                    // wiping their manual session selections (re-seed suppressed
                    // internally via skipNextSeedRef).
                    if (!form.days_of_week.includes(day)) {
                      update('days_of_week', [...form.days_of_week, day].sort((a, b) => a - b))
                    }
                  }}
                />
              </div>

              {/* CF-PROG-SESSION-LIST: strict count match before Continue. */}
              {form.schedule_type === 'fixed' && form.session_dates.length !== form.session_count && (
                <p className="text-[12px] text-red-600 mt-3">
                  Select exactly {form.session_count} date{form.session_count === 1 ? '' : 's'} to continue
                  {' '}({form.session_dates.length} currently selected)
                </p>
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
                  {/* BUG-23 (approved ruling): camps are per_session only —
                      block is unavailable while camp mode is on (the API
                      enforces the same rule against crafted requests). */}
                  <div className={form.campMode ? 'opacity-50 pointer-events-none' : ''} aria-disabled={form.campMode}>
                    <SelectCard
                      active={form.payment_type === 'block_upfront'}
                      onClick={() => {
                        if (form.campMode) return
                        update('payment_type', 'block_upfront')
                      }}
                      icon={<Layers size={20} strokeWidth={1.8} />}
                      title="Block upfront"
                      description={
                        form.campMode
                          ? 'Unavailable in camp mode — parents pay per session.'
                          : 'Parents pay for all sessions at once.'
                      }
                    />
                  </div>
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
                {/* C-PAY-04: live payout estimate as the coach types */}
                <PayoutEstimate pricePence={form.price_pence} className="mt-1.5" />
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
                  { key: 'Age groups', value: form.age_groups.join(', ') },
                  {
                    key: 'Schedule',
                    value: `Every ${daysLabel} · ${formatTime(form.start_time)} · ${form.duration_minutes} min`,
                  },
                  // CF-PROG-SESSION-LIST: use session_dates[0]/[last] for fixed,
                  // form.starts_at for rolling (calendar may show ongoing).
                  {
                    key: form.schedule_type === 'fixed' ? 'First session' : 'Starts',
                    value: form.schedule_type === 'fixed'
                      ? (firstSessionDate
                          ? new Date(firstSessionDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                          : '—')
                      : (form.starts_at
                          ? new Date(form.starts_at + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                          : '—'),
                    muted: form.schedule_type === 'fixed' ? !firstSessionDate : !form.starts_at,
                  },
                  ...(form.schedule_type === 'fixed' && lastSessionDate
                    ? [{
                        key: 'Last session',
                        value: new Date(lastSessionDate + 'T00:00:00').toLocaleDateString('en-GB', {
                          weekday: 'long', day: 'numeric', month: 'long',
                        }),
                      }]
                    : []),
                  ...(form.campMode
                    ? [{ key: 'Format', value: 'Camp mode · multiple sessions per day' }]
                    : []),
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
              {conflictBanner && (
                <div className="max-w-[560px] mx-auto w-full mb-4">{conflictBanner}</div>
              )}

              {/* Fix-57: Publish now is the primary CTA (top, filled brand-600).
                  Save as draft is the secondary fallback (below, outlined). */}
              <div className="flex flex-col gap-2.5 max-w-[560px] mx-auto w-full">
                <button
                  type="button"
                  disabled={saving || conflictError !== null}
                  onClick={() => submit(true)}
                  className="h-[52px] rounded-full bg-[#0077CC] hover:bg-[#0066AA] text-white text-[15px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                  Publish now
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => submit(false)}
                  className="h-[52px] rounded-full bg-white border-[1.5px] border-[#0077CC] text-[#0077CC] hover:bg-[#F0F7FF] text-[15px] font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  Save as draft
                </button>
                <p className="text-[13px] text-[#64748B] text-center mt-1 leading-snug">
                  Drafts are only visible to you. Publish when ready for parents to book.
                </p>
              </div>
            </>
          )}

          {/* ── Bottom action bar (steps 1–3) ── */}
          {step < 4 && conflictBanner && <div className="mt-6">{conflictBanner}</div>}
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
                  disabled={!canContinue() || autoSaving || conflictError !== null}
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

      {/* CF-PROG-SHARE-CARD: post-publish share modal. Push to /coach/programmes
          on close (regardless of whether the coach interacted with the buttons). */}
      {publishedShareId && (
        <ShareCardModal
          isOpen={!!publishedShareId}
          onClose={handlePublishedShareClose}
          programme={{
            id: publishedShareId,
            title: form.title.trim() || 'New programme',
            imageUrl: form.image_url,
            sportName: sport?.sport_name ?? '',
            schedule: `Every ${daysLabel} · ${form.start_time} – ${form.end_time}`,
            startsAt: form.session_dates[0]?.date ?? (form.starts_at || null),
            priceLabel: form.payment_type === 'per_session'
              ? `£${penceToDisplay(form.price_pence)} per session`
              : `£${penceToDisplay(form.price_pence)} upfront`,
            spotsLeft: form.max_spots,
            maxSpots: form.max_spots,
          }}
        />
      )}
    </div>
  )
}
