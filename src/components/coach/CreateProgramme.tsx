'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Calendar, RefreshCw, CreditCard, Layers } from 'lucide-react'

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
  day_of_week: number
  start_time: string
  duration_minutes: number
  session_count: number
  // Step 3
  max_spots: number
  payment_type: 'per_session' | 'block_upfront'
  price_pence: number
  late_joining_allowed: boolean
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

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`w-2.5 h-2.5 rounded-full transition-colors ${i < step ? 'bg-[#0077CC]' : 'bg-[#E2E8F0]'}`}
        />
      ))}
    </div>
  )
}

function PreviewCard({
  form,
  sports,
  step,
}: {
  form: FormData
  sports: Sport[]
  step: number
}) {
  const sport = sports.find((s) => s.sport_id === form.sport_id)
  const skillLabel = SKILL_LEVELS.find((s) => s.value === form.skill_level)?.label ?? ''
  const dayLabel = form.day_of_week >= 0 ? DAY_FULL[form.day_of_week].substring(0, 3) : '—'
  const priceDisplay = form.price_pence > 0 ? `£${penceToDisplay(form.price_pence)}` : '—'

  return (
    <aside className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl p-5 sticky top-6">
      <p className="text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] mb-3">Parent preview</p>
      <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-[18px] shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <h3 className="text-[17px] font-semibold text-[#0F172A] tracking-tight mb-2">
          {form.title || 'Programme title'}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {sport && (
            <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-[6px] bg-[#E6F3FB] text-[#0C447C]">
              {sport.sport_name}
            </span>
          )}
          {form.skill_level && (
            <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium rounded-[6px] bg-[#F1F5F9] text-[#475569]">
              {skillLabel}
            </span>
          )}
        </div>

        {step >= 2 && form.day_of_week >= 0 && (
          <p className="text-[15px] font-medium text-[#0F172A] mt-4">
            Every {dayLabel} · {formatTime(form.start_time)} · {form.duration_minutes} min
          </p>
        )}
        {step >= 2 && (
          <p className="text-[13px] text-[#64748B] mt-1">
            {form.schedule_type === 'fixed'
              ? `Fixed · ${form.session_count} sessions`
              : 'Rolling · join anytime'}
          </p>
        )}

        {step >= 3 && form.price_pence > 0 && (
          <>
            <div className="flex items-baseline justify-between mt-3.5">
              <span className="text-[22px] font-bold tracking-tight text-[#0F172A]">
                {priceDisplay}
                <span className="text-[13px] font-normal text-[#64748B] ml-1">
                  {form.payment_type === 'per_session' ? '/ session' : 'upfront'}
                </span>
              </span>
            </div>
            <div className="mt-3.5">
              <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                <div className="h-full bg-[#0077CC] w-0" />
              </div>
              <p className="text-[12px] text-[#64748B] mt-1.5">0 / {form.max_spots} spots booked</p>
            </div>
          </>
        )}

        {!form.title && !sport && (
          <p className="text-[13px] text-[#94A3B8] mt-3 leading-snug">Fill in the details to complete your preview.</p>
        )}
      </div>
    </aside>
  )
}

export function CreateProgramme() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [sports, setSports] = useState<Sport[]>([])
  const [loadingSports, setLoadingSports] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    sport_id: '',
    skill_level: 'all',
    schedule_type: 'fixed',
    day_of_week: 6, // Saturday
    start_time: '09:00',
    duration_minutes: 60,
    session_count: 8,
    max_spots: 8,
    payment_type: 'per_session',
    price_pence: 2800, // £28 default
    late_joining_allowed: false,
  })

  useEffect(() => {
    async function fetchSports() {
      try {
        const res = await fetch('/api/coaches/sports')
        if (!res.ok) return
        const data = await res.json()
        const sportList: Sport[] = (data.sports || []).map((s: { id: string; sport_id: string; sport_name: string }) => ({
          id: s.id,
          sport_id: s.sport_id,
          sport_name: s.sport_name,
        }))
        setSports(sportList)
        if (sportList.length > 0 && !form.sport_id) {
          setForm((f) => ({ ...f, sport_id: sportList[0].sport_id }))
        }
      } finally {
        setLoadingSports(false)
      }
    }
    fetchSports()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function canContinue(): boolean {
    if (step === 1) return form.title.trim().length > 0 && form.sport_id.length > 0
    if (step === 2) return form.day_of_week >= 0 && form.start_time.length > 0 && form.duration_minutes > 0
    if (step === 3) return form.max_spots >= 2 && form.price_pence >= 100
    return true
  }

  async function submit(publishNow: boolean) {
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        sport_id: form.sport_id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        skill_level: form.skill_level,
        schedule_type: form.schedule_type,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        duration_minutes: form.duration_minutes,
        max_spots: form.max_spots,
        payment_type: form.payment_type,
        late_joining_allowed: form.late_joining_allowed,
        status: publishNow ? 'active' : 'draft',
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

      const res = await fetch('/api/coaches/programmes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create programme')
      }

      router.push('/coach/programmes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const sport = sports.find((s) => s.sport_id === form.sport_id)
  const skillLabel = SKILL_LEVELS.find((s) => s.value === form.skill_level)?.label ?? ''
  const dayLabel = form.day_of_week >= 0 ? DAY_FULL[form.day_of_week] : '—'
  const priceDisplay = form.price_pence > 0 ? `£${penceToDisplay(form.price_pence)}` : '£—'

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="max-w-[1160px] mx-auto px-8 py-6 pb-12">

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
            <StepDots step={step} total={4} />
          </div>

          {/* Step tag */}
          <span className="inline-block text-[11px] font-medium text-[#64748B] uppercase tracking-[0.08em] bg-[#F1F5F9] px-2.5 py-1 rounded-full mb-2">
            Step {step} of 4
          </span>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <>
              <h1 className="text-[28px] font-bold text-[#0F172A] tracking-tight mt-1">Name your programme</h1>
              <p className="text-sm text-[#64748B] mt-1.5 mb-6">Give parents a clear idea of what to expect.</p>
              <div className="grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-10 items-start max-[820px]:grid-cols-1 max-[820px]:gap-6">
                <div>
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
                </div>
                <PreviewCard form={form} sports={sports} step={step} />
              </div>
            </>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <>
              <h1 className="text-[28px] font-bold text-[#0F172A] tracking-tight mt-1">When does it run?</h1>
              <p className="text-sm text-[#64748B] mt-1.5 mb-6">Set the recurring day and time for your sessions.</p>
              <div className="grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-10 items-start max-[820px]:grid-cols-1 max-[820px]:gap-6">
                <div>
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
                  <div className="mb-[22px]">
                    <label className="block text-[12px] font-medium text-[#475569] mb-2">Day of the week</label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((day, i) => (
                        <PillButton
                          key={day}
                          active={form.day_of_week === i}
                          onClick={() => update('day_of_week', i)}
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
                  {form.schedule_type === 'fixed' && (
                    <div className="mb-[22px]">
                      <label className="block text-[12px] font-medium text-[#475569] mb-2">Number of sessions</label>
                      <input
                        type="number"
                        min={2}
                        max={52}
                        value={form.session_count}
                        onChange={(e) => update('session_count', Math.max(2, parseInt(e.target.value) || 2))}
                        className="w-[140px] px-4 py-3.5 border border-[#E2E8F0] rounded-[12px] text-[15px] text-[#0F172A] outline-none focus:border-[#0077CC] focus:shadow-[0_0_0_3px_rgba(0,119,204,0.15)]"
                      />
                      <p className="text-[12px] text-[#94A3B8] mt-2">
                        The programme will run for {form.session_count} consecutive {dayLabel}s.
                      </p>
                    </div>
                  )}
                </div>
                <PreviewCard form={form} sports={sports} step={step} />
              </div>
            </>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <>
              <h1 className="text-[28px] font-bold text-[#0F172A] tracking-tight mt-1">Spots and payment</h1>
              <p className="text-sm text-[#64748B] mt-1.5 mb-6">Set how many can join and how they pay.</p>
              <div className="grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-10 items-start max-[820px]:grid-cols-1 max-[820px]:gap-6">
                <div>
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
                </div>
                <PreviewCard form={form} sports={sports} step={step} />
              </div>
            </>
          )}

          {/* ── STEP 4 ── */}
          {step === 4 && (
            <>
              <h1 className="text-[28px] font-bold text-[#0F172A] tracking-tight mt-1">Review &amp; save</h1>
              <p className="text-sm text-[#64748B] mt-1.5 mb-6">Check everything looks right before saving.</p>
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden mb-6">
                {[
                  { key: 'Programme', value: form.title },
                  { key: 'Sport', value: sport?.sport_name ?? '—', chip: 'blue' },
                  { key: 'Skill level', value: skillLabel },
                  {
                    key: 'Schedule',
                    value: `Every ${DAYS[form.day_of_week]} · ${formatTime(form.start_time)} · ${form.duration_minutes} min`,
                  },
                  {
                    key: 'Type',
                    value: form.schedule_type === 'fixed'
                      ? `Fixed · ${form.session_count} sessions`
                      : 'Rolling · join anytime',
                  },
                  { key: 'Capacity', value: `${form.max_spots} spots` },
                  {
                    key: 'Price',
                    value: form.payment_type === 'per_session'
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
                      {chip === 'blue' ? (
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

              {error && (
                <p className="text-sm text-red-600 mb-4 text-center">{error}</p>
              )}

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

          {/* Bottom action bar (steps 1–3) */}
          {step < 4 && (
            <div className="flex items-center justify-between mt-7 pt-5 border-t border-[#F1F5F9]">
              <button
                type="button"
                onClick={() => (step > 1 ? setStep((s) => s - 1) : router.push('/coach/programmes'))}
                className="h-12 px-6 rounded-full text-[15px] font-medium text-[#475569] hover:text-[#0F172A] transition-colors"
              >
                {step === 1 ? 'Save draft' : '← Back'}
              </button>
              <button
                type="button"
                disabled={!canContinue()}
                onClick={() => setStep((s) => s + 1)}
                className="h-12 px-6 rounded-full bg-[#0077CC] hover:bg-[#0066AA] text-white text-[15px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
