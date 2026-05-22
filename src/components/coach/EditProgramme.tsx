'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Check, Calendar, RefreshCw, CreditCard, Layers, Loader2, Sun, Info } from 'lucide-react'
import { VenueAutocomplete, type VenueSelection } from '@/components/coach/shared/LocationAutocomplete'
import { ProgrammeImagePicker } from '@/components/coach/shared/ProgrammeImagePicker'
import { DatePicker, TimePicker, todayYYYYMMDD } from '@/components/ui'
import { PROGRAMME_AGE_GROUPS, type ProgrammeAgeGroup, ALL_AGES_LABEL, isProgrammeAgeGroup, type SessionEntry } from './programmeConstants'
import { generateProgrammeSessionDates } from '@/lib/programme-sessions'
import { SessionCalendar } from './SessionCalendar'

interface FormData {
  title: string
  description: string
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'all'
  // CF-PROG-AGE-GROUP: target age groups (min 1, "All ages" XOR specific groups)
  age_groups: ProgrammeAgeGroup[]
  days_of_week: number[]
  start_time: string
  // CF-PROG-EDIT-PARITY: end_time mirrors CreateProgramme. duration_minutes
  // is now derived from (end_time − start_time) at PATCH time; kept in form
  // state as a dead field (seeded from the API on load, never mutated by UI).
  end_time: string
  duration_minutes: number
  // CF-PROG-START-DATE: first session date / enrolment open date, YYYY-MM-DD.
  starts_at: string
  // CF-PROG-EDIT-PARITY: optional Rolling end date (YYYY-MM-DD), '' when unset.
  rolling_end_date: string
  // CF-PROG-SESSION-LIST: calendar-managed session list (replaces sessions preview).
  session_dates: SessionEntry[]
  campMode: boolean
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
  // CF-PROG-START-DATE: needed for sessions preview in end-date-mode programmes.
  ends_at: string | null
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// CF-PROG-EDIT-PARITY: DURATIONS removed — Duration pills replaced by an End time TimePicker.
const SKILL_LEVELS: { value: FormData['skill_level']; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all', label: 'All levels' },
]

// CF-PROG-SESSION-LIST: build the initial SessionEntry[] on Edit load.
// Prefer server-persisted session_dates (STUB until CF-PROG-SESSIONS-DB)
// then fall back to deriving from starts_at + days_of_week + session_count.
function deriveInitialSessions(data: Record<string, unknown>): SessionEntry[] {
  if (Array.isArray(data.session_dates) && data.session_dates.length > 0) {
    return data.session_dates as SessionEntry[]
  }
  const startsAtRaw = typeof data.starts_at === 'string' ? data.starts_at : ''
  if (!startsAtRaw) return []
  const days: number[] = Array.isArray(data.days_of_week) && data.days_of_week.length > 0
    ? (data.days_of_week as number[])
    : typeof data.day_of_week === 'number' ? [data.day_of_week] : []
  if (days.length === 0) return []
  const startDate = new Date(startsAtRaw).toISOString().split('T')[0]
  const sessionCount = typeof data.session_count === 'number' ? data.session_count : 0
  const endsAtRaw = typeof data.ends_at === 'string' ? data.ends_at : ''
  const endDate = endsAtRaw ? new Date(endsAtRaw).toISOString().split('T')[0] : ''
  const candidates = sessionCount > 0
    ? generateProgrammeSessionDates({ startDate, days, mode: 'count', count: sessionCount, endDate: '' })
    : endDate
      ? generateProgrammeSessionDates({ startDate, days, mode: 'end_date', count: 0, endDate })
      : []
  const startTime = typeof data.start_time === 'string' ? (data.start_time as string).substring(0, 5) : '09:00'
  const durationMinutes = typeof data.duration_minutes === 'number' ? data.duration_minutes : 60
  function pad(n: number): string { return n < 10 ? `0${n}` : String(n) }
  function addMinutes(hhmm: string, m: number): string {
    const [h, mm] = hhmm.split(':').map((s) => parseInt(s, 10))
    const total = ((h * 60 + mm + m) % 1440 + 1440) % 1440
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
  }
  const endTime = addMinutes(startTime, durationMinutes)
  return candidates.map((d) => ({ date: d, startTime, endTime }))
}

// CF-PROG-EDIT-PARITY: derive duration_minutes from end_time − start_time at
// PATCH time. Mirrors the helper in CreateProgramme.tsx so Edit and Create
// emit identical PATCH bodies. Handles same-day cross-midnight wrap.
function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map((s) => parseInt(s, 10))
  const [eh, em] = end.split(':').map((s) => parseInt(s, 10))
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff < 0 ? diff + 1440 : diff
}

// CF-PROG-EDIT-PARITY: addMinutes for seeding end_time from start_time +
// duration_minutes on API load. Same arithmetic as the local helper inside
// deriveInitialSessions, kept separate so seeding doesn't share state.
function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10))
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440
  const eh = String(Math.floor(total / 60)).padStart(2, '0')
  const em = String(total % 60).padStart(2, '0')
  return `${eh}:${em}`
}

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
    ends_at: null,
  })

  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    skill_level: 'all',
    age_groups: [ALL_AGES_LABEL],
    days_of_week: [6],
    start_time: '09:00',
    end_time: '10:00',
    duration_minutes: 60,
    starts_at: '',
    rolling_end_date: '',
    session_dates: [],
    campMode: false,
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
          // CF-PROG-START-DATE: API returns ends_at on the single-programme GET
          // (not the list). Used by the sessions preview in end-date mode.
          ends_at: typeof data.ends_at === 'string' ? data.ends_at : null,
        })
        setForm({
          title: data.title || '',
          description: data.description || '',
          skill_level: (['beginner', 'intermediate', 'advanced', 'all'].includes(data.skill_level)
            ? data.skill_level
            : 'all') as FormData['skill_level'],
          age_groups: (() => {
            // CF-PROG-AGE-GROUP: filter to allowlist; fall back to ['All ages']
            // for legacy rows where DB default '{}' left the array empty.
            const raw: unknown[] = Array.isArray(data.age_groups) ? data.age_groups : []
            const filtered = raw.filter(isProgrammeAgeGroup)
            return filtered.length > 0 ? filtered : [ALL_AGES_LABEL]
          })(),
          days_of_week:
            Array.isArray(data.days_of_week) && data.days_of_week.length > 0
              ? (data.days_of_week as number[])
              : [data.day_of_week ?? 6],
          start_time: data.start_time ? (data.start_time as string).substring(0, 5) : '09:00',
          // CF-PROG-EDIT-PARITY: seed end_time from existing start + duration.
          end_time: addMinutesToHHMM(
            data.start_time ? (data.start_time as string).substring(0, 5) : '09:00',
            typeof data.duration_minutes === 'number' ? data.duration_minutes : 60,
          ),
          duration_minutes: data.duration_minutes || 60,
          // CF-PROG-START-DATE: convert timestamptz from API → YYYY-MM-DD for
          // the date control. Empty string when absent.
          starts_at: typeof data.starts_at === 'string' && data.starts_at
            ? new Date(data.starts_at).toISOString().split('T')[0]
            : '',
          // CF-PROG-EDIT-PARITY: seed rolling_end_date from data.ends_at —
          // same conversion pattern as starts_at above.
          rolling_end_date: typeof data.ends_at === 'string' && data.ends_at
            ? new Date(data.ends_at).toISOString().split('T')[0]
            : '',
          // CF-PROG-SESSION-LIST: seed session_dates from API if persisted (STUB
          // until CF-PROG-SESSIONS-DB) — otherwise derive from existing schedule
          // metadata so the SessionCalendar has something to display on load.
          session_dates: deriveInitialSessions(data),
          campMode: typeof data.campMode === 'boolean' ? data.campMode : false,
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

  // CF-PROG-AGE-GROUP: "All ages" XOR specific groups; min 1 enforced
  // (last-pill click is a no-op). Not locked by current_spots — age groups are
  // descriptive metadata, not contractual like price/schedule.
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

  const isLocked = readOnly.current_spots > 0

  async function handleSave() {
    if (!form.title.trim()) {
      setSaveError('Programme title is required.')
      return
    }
    if (form.age_groups.length === 0) {
      setSaveError('Select at least one age group.')
      return
    }
    setSaving(true)
    setSaveError(null)

    try {
      const patchBody: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        skill_level: form.skill_level,
        age_groups: form.age_groups,
        venue_name: form.venue_name || null,
        venue_address: form.venue_address || null,
        image_url: form.image_url,
      }

      if (!isLocked) {
        patchBody.days_of_week = form.days_of_week
        patchBody.day_of_week = form.days_of_week[0] ?? 0
        patchBody.start_time = form.start_time
        // CF-PROG-EDIT-PARITY: derive duration_minutes from end_time − start_time
        // (matches CreateProgramme). The server only accepts duration_minutes.
        patchBody.duration_minutes = diffMinutes(form.start_time, form.end_time)
        // CF-PROG-START-DATE: locked alongside the rest of the schedule once
        // enrolments exist. Send only when non-empty so the server doesn't
        // null-out an existing value.
        if (form.starts_at) patchBody.starts_at = form.starts_at
        // CF-PROG-EDIT-PARITY: Rolling end date — null when fixed or cleared.
        patchBody.rolling_end_date =
          readOnly.schedule_type === 'rolling'
            ? form.rolling_end_date || null
            : null
        // CF-PROG-SESSION-LIST: server derives starts_at / session_count /
        // ends_at from session_dates when non-empty. campMode STUB.
        patchBody.session_dates = form.session_dates
        patchBody.campMode = form.campMode
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

            {/* CF-PROG-AGE-GROUP: target age groups — not locked by current_spots */}
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

              {/* CF-PROG-EDIT-PARITY: Commencing date (Fixed) / Rolling date range — matches CreateProgramme position */}
              {readOnly.schedule_type === 'fixed' && (
                <div className="mb-[22px]">
                  <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                    Commencing date
                  </label>
                  <DatePicker
                    value={form.starts_at}
                    minDate={todayYYYYMMDD()}
                    onChange={(v) => update('starts_at', v)}
                    disabled={isLocked}
                  />
                </div>
              )}

              {readOnly.schedule_type === 'rolling' && (
                <div className="grid grid-cols-2 gap-3 mb-[22px]">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                      Start date
                    </label>
                    <DatePicker
                      value={form.starts_at}
                      minDate={todayYYYYMMDD()}
                      onChange={(v) => update('starts_at', v)}
                      disabled={isLocked}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">
                      End date
                      <span className="text-neutral-400 font-normal text-[10px] ml-1">Optional</span>
                    </label>
                    <DatePicker
                      value={form.rolling_end_date}
                      minDate={form.starts_at || todayYYYYMMDD()}
                      onChange={(v) => update('rolling_end_date', v)}
                      disabled={isLocked}
                    />
                  </div>
                </div>
              )}

              {/* CF-PROG-EDIT-PARITY: Start time + End time row (Duration pills removed) */}
              <div className="mb-[22px]">
                <div className="flex gap-4 flex-wrap">
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">Start time</label>
                    <TimePicker
                      value={form.start_time}
                      onChange={(v) => update('start_time', v)}
                      disabled={isLocked}
                    />
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">End time</label>
                    <TimePicker
                      value={form.end_time}
                      onChange={(v) => update('end_time', v)}
                      disabled={isLocked}
                    />
                  </div>
                </div>
                {form.end_time <= form.start_time && (
                  <p className="text-[12px] text-red-600 mt-2">
                    End time should be after start time.
                  </p>
                )}
              </div>

              {/* CF-PROG-SESSION-LIST: camp mode toggle + info banner */}
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
                  onClick={() => update('campMode', !form.campMode)}
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
                    Parents book the full day. Each day can have multiple time blocks.
                  </p>
                </div>
              )}

              {/* CF-PROG-SESSION-LIST: SessionCalendar replaces the prior date
                  input + preview. `disabled={isLocked}` so the entire calendar
                  becomes inert once enrolments exist (stricter than before — by
                  design, the schedule is contractual). */}
              <div className="bg-white border border-neutral-100 rounded-md p-4">
                <SessionCalendar
                  scheduleType={readOnly.schedule_type === 'rolling' ? 'rolling' : 'fixed'}
                  selectedDays={form.days_of_week}
                  defaultStartTime={form.start_time}
                  // CF-PROG-EDIT-PARITY: now driven by form.end_time directly
                  // (Duration pills removed; end_time is the source of truth).
                  defaultEndTime={form.end_time}
                  campMode={form.campMode}
                  startDate={form.starts_at}
                  // CF-PROG-EDIT-PARITY: rolling end date now editable in form
                  endDate={form.rolling_end_date}
                  sessionCount={readOnly.session_count ?? form.session_dates.length}
                  sessions={form.session_dates}
                  onChange={(next) => update('session_dates', next)}
                  // CF-PROG-EDIT-PARITY: auto-add day-of-week when coach taps a
                  // non-pattern calendar date (mirrors CreateProgramme). The
                  // `disabled={isLocked}` guard on SessionCalendar prevents
                  // taps from firing this when enrolments exist.
                  onSelectedDaysAdd={(day) => {
                    if (!form.days_of_week.includes(day)) {
                      update('days_of_week', [...form.days_of_week, day].sort((a, b) => a - b))
                    }
                  }}
                  disabled={isLocked}
                />
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
