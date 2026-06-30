'use client'

// P-00b-D2: full-page coach availability calendar (ported from the approved
// Claude Design mock `availability-page.js` to React state). Two-column on
// desktop (calendar left, booking panel right), single column + sticky bottom
// bar on mobile. Surfaces BOTH 1-on-1 slots and group-programme sessions on one
// calendar. Guest state only — multi-child, recurring booking and a multi-slot
// basket are future features hinted at but disabled.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Clock,
  Calendar,
  Plus,
  Lock,
  ShieldCheck,
  MapPin,
} from 'lucide-react'
import {
  bookableSlots,
  localISODate,
  formatTimeLabel,
  type SlotTemplate,
  type GeneratedSlot,
} from './_data/slots'
import type { DayProgramme } from './_data/programmeSchedule'

interface Props {
  coachId: string
  pricePence: number | null
  sessionDurationMinutes: number
  templates: SlotTemplate[]
  blockedDates: string[]
  minAdvanceHours: number
  maxAdvanceDays: number
  cancellationWindowHours: number
  programmesByDate: Record<string, DayProgramme[]>
  programmeDates: string[]
}

type Tab = '1to1' | 'groups'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

/** Parse a 'YYYY-MM-DD' string into a local-time Date (no UTC shift). */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

interface MonthCell {
  day: number
  iso: string
  date: Date
}

export function AvailabilityClient({
  coachId,
  pricePence,
  sessionDurationMinutes,
  templates,
  blockedDates,
  minAdvanceHours,
  maxAdvanceDays,
  cancellationWindowHours,
  programmesByDate,
  programmeDates,
}: Props) {
  const router = useRouter()

  // "now" captured once via a lazy initializer so calendar math stays stable
  // across re-renders (must not drift mid-session).
  const [now] = useState(() => new Date())
  const today = useMemo(() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])

  const blockedSet = useMemo(() => new Set(blockedDates), [blockedDates])
  const programmeDateSet = useMemo(() => new Set(programmeDates), [programmeDates])

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedISO, setSelectedISO] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<GeneratedSlot | null>(null)
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('1to1')
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')
  const [showError, setShowError] = useState(false)

  const selectedDate = useMemo(() => (selectedISO ? parseISO(selectedISO) : null), [selectedISO])

  const slotsFor = useMemo(
    () => (date: Date): GeneratedSlot[] =>
      bookableSlots(date, templates, blockedSet, minAdvanceHours, maxAdvanceDays, now, sessionDurationMinutes),
    [templates, blockedSet, minAdvanceHours, maxAdvanceDays, now, sessionDurationMinutes],
  )

  const slots = useMemo<GeneratedSlot[]>(
    () => (selectedDate ? slotsFor(selectedDate) : []),
    [selectedDate, slotsFor],
  )
  const dayProgrammes = selectedISO ? programmesByDate[selectedISO] ?? [] : []
  const hasProgrammes = dayProgrammes.length > 0
  const selectedProgramme = dayProgrammes.find(p => p.id === selectedProgrammeId) ?? null

  const monthCells = useMemo<(MonthCell | null)[]>(() => {
    const firstDay = new Date(viewYear, viewMonth, 1)
    const lead = (firstDay.getDay() + 6) % 7 // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells: (MonthCell | null)[] = []
    for (let i = 0; i < lead; i++) cells.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day)
      cells.push({ day, iso: localISODate(date), date })
    }
    return cells
  }, [viewYear, viewMonth])

  const prevDisabled = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  // ── Handlers ────────────────────────────────────────────────────────────────

  const goPrev = () => {
    if (prevDisabled) return
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  // UX-10: jump the view back to the current month and select today if it has
  // any availability (1-to-1 slots or programmes) — otherwise just reset the view.
  const goToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    const iso = localISODate(today)
    const bookable = slotsFor(today).length > 0
    const hasProg = programmeDateSet.has(iso)
    if (bookable || hasProg) {
      selectDay({ day: today.getDate(), iso, date: today })
    }
  }

  const selectDay = (cell: MonthCell) => {
    setSelectedISO(cell.iso)
    setSelectedSlot(null)
    setSelectedProgrammeId(null)
    setShowError(false)
    const bookable = slotsFor(cell.date).length > 0
    const progs = programmesByDate[cell.iso]?.length ?? 0
    setTab(bookable ? '1to1' : progs > 0 ? 'groups' : '1to1')
  }

  const toggleSlot = (slot: GeneratedSlot) => {
    setSelectedProgrammeId(null)
    setSelectedSlot(prev => (prev?.minutes === slot.minutes ? null : slot))
    setShowError(false)
  }

  const toggleProgramme = (programme: DayProgramme) => {
    if (programme.isFull) return
    setSelectedSlot(null)
    setSelectedProgrammeId(prev => (prev === programme.id ? null : programme.id))
    setShowError(false)
  }

  const hasSelection = selectedSlot !== null || selectedProgramme !== null

  const handleBook = () => {
    if (!hasSelection) return
    if (!childName.trim() || !childAge) {
      setShowError(true)
      return
    }
    const q = new URLSearchParams()
    if (selectedSlot && selectedISO) {
      // Param names mirror what the checkout page reads (date + startTime) so the
      // booking summary shows the slot the guest picked (BUG-02).
      q.set('date', selectedISO)
      q.set('startTime', selectedSlot.time)
      q.set('sessionType', 'individual')
      // BUG-08: prefer the slot's per-block override, fall back to the sport
      // default. Display-only — the booking server re-derives the authoritative
      // price from the template (BUG-09).
      const effectivePrice = selectedSlot.pricePence ?? pricePence
      if (effectivePrice != null) q.set('price', String(effectivePrice))
    } else if (selectedProgramme) {
      q.set('programme', selectedProgramme.id)
    }
    q.set('child', childName.trim())
    q.set('age', childAge)
    router.push(`/book/${coachId}?${q.toString()}`)
  }

  // ── Display helpers ───────────────────────────────────────────────────────────

  const dayLabel = (iso: string): string => {
    const d = parseISO(iso)
    return `${DAY_S[d.getDay()]} ${d.getDate()} ${MON_S[d.getMonth()]}`
  }

  // UX-12: "Starting 28 June 2026" from a fixed programme's starts_at. Take the
  // date portion only (slice to YYYY-MM-DD) to avoid a UTC-midnight day shift in
  // BST. Rolling programmes (startsAt null) never call this.
  const startingLabel = (startsAt: string): string => {
    const [y, m, d] = startsAt.slice(0, 10).split('-').map(Number)
    return `Starting ${d} ${MON_L[m - 1]} ${y}`
  }

  // BUG-08: a selected 1-to-1 slot is priced by its per-block override, falling
  // back to the coach's sport default (pricePence) when the block has none.
  const totalPence = selectedSlot
    ? selectedSlot.pricePence ?? pricePence ?? 0
    : selectedProgramme
      ? selectedProgramme.pricePence
      : 0
  const ctaLabel = selectedProgramme ? 'Enrol' : 'Book this slot'

  const activeChip =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand-600 text-white text-[13px] font-semibold transition-colors'
  const idleChip =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-gray-300 text-gray-700 text-[13px] font-medium hover:border-brand-600 hover:text-brand-600 transition-colors'
  const comingSoonChip =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-dashed border-gray-300 text-gray-400 text-[13px] font-medium cursor-not-allowed'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-10 items-stretch">
      {/* LEFT — month calendar */}
      <section aria-label="Calendar" className="rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[17px] font-bold text-gray-900" aria-live="polite">
            {MON_L[viewMonth]} {viewYear}
          </h3>
          <div className="flex items-center gap-1.5">
            {/* UX-10: jump back to the current month and select today */}
            <button
              type="button"
              onClick={goToday}
              className="inline-flex items-center h-8 px-3 rounded-full border border-gray-300 text-gray-700 text-[13px] font-medium hover:border-brand-600 hover:text-brand-600 transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={goPrev}
              disabled={prevDisabled}
              aria-label="Previous month"
              className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next month"
              className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2 text-center">
          {WEEKDAYS.map(d => (
            <span key={d} className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2" data-testid="availability-calendar">
          {monthCells.map((cell, i) => {
            if (!cell) return <div key={`blank-${i}`} className="aspect-square" aria-hidden />

            const past = cell.date < today
            const daySlots = past ? [] : slotsFor(cell.date)
            const bookable = daySlots.length > 0
            // BUG-04: split 1-on-1 availability by recurrence so the dots match
            // the legend — recurring slots are blue, ad-hoc (one-off) slots are teal.
            const hasRecurring = daySlots.some(s => !s.isAdHoc)
            const hasAdHoc = daySlots.some(s => s.isAdHoc)
            const hasProg = programmeDateSet.has(cell.iso)
            const selected = cell.iso === selectedISO
            const isToday = cell.iso === localISODate(today)
            const tappable = !past && (bookable || hasProg)

            let cls =
              'relative flex flex-col items-center justify-center aspect-square rounded-xl text-[15px] sm:text-[16px] font-semibold tabular-nums transition-all '
            // Session-type colours mirror the coach schedule legend
            // (Schedule.tsx): 1-on-1 = blue-500, programme = purple-600, ad hoc
            // = teal-500. "Selected" is the brand action state, not a type.
            if (selected) cls += 'bg-brand-600 text-white shadow-md'
            else if (bookable) cls += 'bg-white text-gray-900 border border-gray-200 hover:border-blue-500 cursor-pointer'
            else if (hasProg) cls += 'bg-white text-gray-900 border border-gray-200 hover:border-purple-600 cursor-pointer'
            else cls += 'text-gray-300 cursor-default'

            return (
              <button
                key={cell.iso}
                type="button"
                disabled={!tappable}
                aria-pressed={selected}
                // UX-07: dots are decorative (aria-hidden), so availability is
                // announced here instead — keeps screen-reader parity now that the
                // visible slot-count text is gone.
                aria-label={
                  tappable
                    ? `${dayLabel(cell.iso)}${bookable ? ', sessions available' : ''}${hasProg ? ', programmes available' : ''}`
                    : undefined
                }
                onClick={() => tappable && selectDay(cell)}
                className={cls}
                data-testid={`cal-day-${cell.iso}`}
              >
                <span>{cell.day}</span>
                {/* UX-06/07/08 + BUG-04: availability is shown by coloured dots
                    only — no text count. When a day has more than one session type
                    the dots sit side by side (flex-row). Each dot is conditional on
                    that type having availability: blue = recurring 1-on-1 slots,
                    teal = ad-hoc one-off slots, purple = programmes. Colours mirror
                    the legend below. */}
                {(bookable || hasProg) && (
                  <span aria-hidden className="flex flex-row items-center gap-0.5 mt-0.5">
                    {hasRecurring && (
                      <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-blue-500'}`} />
                    )}
                    {hasAdHoc && (
                      <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-teal-500'}`} />
                    )}
                    {hasProg && (
                      <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-purple-600'}`} />
                    )}
                  </span>
                )}
                {isToday && (
                  <span
                    aria-hidden
                    className={`absolute top-1.5 right-2 w-1 h-1 rounded-full ${selected ? 'bg-white' : 'bg-brand-600'}`}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Legend — session-type swatches matching the coach schedule legend
            (Schedule.tsx): 1-on-1 = blue-500, Programme = purple-600, Ad hoc =
            teal-500. Unavailable days simply render greyed, with no label. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 pt-5 border-t border-gray-100 text-[13px] text-gray-500">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            1-on-1
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-600" />
            Programme
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-teal-500" />
            Ad hoc
          </span>
        </div>
      </section>

      {/* RIGHT — booking panel */}
      <aside className="lg:sticky lg:top-24">
        <div className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Session type + content */}
          <div className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h3 className="text-[16px] font-bold text-gray-900">
                {tab === 'groups' ? 'Group programmes' : 'Available times'}
              </h3>
              {selectedISO && <span className="text-[14px] font-semibold text-brand-600">{dayLabel(selectedISO)}</span>}
            </div>

            {/* Session-type tabs */}
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setTab('1to1')}
                className={tab === '1to1' ? activeChip : idleChip}
                aria-pressed={tab === '1to1'}
              >
                <User className="w-3.5 h-3.5" /> 1-to-1
              </button>
              {hasProgrammes ? (
                <button
                  type="button"
                  onClick={() => setTab('groups')}
                  className={tab === 'groups' ? activeChip : idleChip}
                  aria-pressed={tab === 'groups'}
                >
                  <Users className="w-3.5 h-3.5" /> Groups
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Group programmes — coming soon"
                  className={comingSoonChip}
                >
                  <Users className="w-3.5 h-3.5" /> Groups
                </button>
              )}
            </div>

            {/* Content */}
            {!selectedISO ? (
              <p className="text-sm text-gray-500 py-1">Select a date to see available times.</p>
            ) : tab === '1to1' ? (
              slots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {slots.map(slot => {
                    const isSel = selectedSlot?.minutes === slot.minutes
                    return (
                      <button
                        key={slot.minutes}
                        type="button"
                        onClick={() => toggleSlot(slot)}
                        aria-label={`Book ${slot.label} slot${slot.venueName ? ` at ${slot.venueName}` : ''}`}
                        aria-pressed={isSel}
                        className={`flex min-h-touch min-w-0 flex-col items-center justify-center rounded-xl border-[1.5px] px-1.5 py-1.5 transition-all ${
                          isSel
                            ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                            : 'bg-white border-gray-300 text-gray-900 hover:border-brand-600 hover:bg-brand-50'
                        }`}
                        data-testid={`slot-${slot.time}`}
                      >
                        <span className="text-base font-semibold tabular-nums leading-none">{slot.label}</span>
                        {slot.venueName && (
                          <span
                            className={`mt-1 flex min-w-0 max-w-full items-center gap-0.5 text-xs font-medium ${
                              isSel ? 'text-white/80' : 'text-gray-500'
                            }`}
                            data-testid={`slot-venue-${slot.time}`}
                          >
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {/* UX-15: min-w-0 lets the truncate engage inside the
                                flex row so the venue ellipsises instead of
                                overflowing/cramping the slot button. */}
                            <span className="min-w-0 truncate" title={slot.venueName}>{slot.venueName}</span>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-1">No 1-to-1 times on this date — try another day.</p>
              )
            ) : (
              <div className="grid gap-3">
                {dayProgrammes.map(p => {
                  const isSel = selectedProgrammeId === p.id
                  return (
                    <button
                      key={`${p.id}-${selectedISO}`}
                      type="button"
                      onClick={() => toggleProgramme(p)}
                      disabled={p.isFull}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        p.isFull
                          ? 'border-gray-200 opacity-60 cursor-not-allowed'
                          : isSel
                            ? 'border-purple-600 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-600'
                      }`}
                      data-testid={`programme-${p.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                              {p.sportName}
                            </span>
                            {p.startTime && <span className="text-[12px] text-gray-500">{formatTimeLabel(p.startTime)}</span>}
                          </div>
                          <h4 className="text-[15px] font-bold text-gray-900 mt-1.5 leading-tight">{p.title}</h4>
                          {p.ageGroups.length > 0 && (
                            <p className="text-[12px] text-gray-500 mt-0.5">{p.ageGroups.join(', ')}</p>
                          )}
                          {/* UX-12: commencing date — fixed programmes only (rolling have null starts_at) */}
                          {p.startsAt && (
                            <p className="flex items-center gap-1 text-[12px] text-gray-500 mt-1">
                              <Calendar className="w-3 h-3 shrink-0 text-gray-400" aria-hidden="true" />
                              {startingLabel(p.startsAt)}
                            </p>
                          )}
                          {/* UX-11: programme venue */}
                          {p.venueName && (
                            <p className="flex min-w-0 items-center gap-1 text-[12px] text-gray-500 mt-1">
                              <MapPin className="w-3 h-3 shrink-0 text-gray-400" aria-hidden="true" />
                              <span className="truncate" title={p.venueName}>{p.venueName}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[15px] font-bold text-gray-900">{formatPence(p.pricePence)}</p>
                          <p className="text-[11px] text-gray-500">/ {p.per}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                        <span className={`text-[12px] font-semibold ${p.isFull ? 'text-gray-400' : 'text-purple-700'}`}>
                          {p.isFull ? 'Full' : `${p.spotsLeft} spot${p.spotsLeft !== 1 ? 's' : ''} left`}
                        </span>
                        {!p.isFull && (
                          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600">
                            Enrol <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Who is this for? */}
          <div className="px-5 sm:px-6 pb-6 pt-5 border-t border-gray-100">
            <h3 className="text-[16px] font-bold text-gray-900">Who is this for?</h3>
            <p className="text-[13px] text-gray-500 mt-1 mb-4">Tell us about the player. Used for this booking only.</p>

            <div className="grid gap-3">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="grid grid-cols-[1fr_84px] gap-3">
                  <div>
                    <label htmlFor="child-name" className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      Child&apos;s name
                    </label>
                    <input
                      id="child-name"
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. Sam"
                      value={childName}
                      onChange={e => {
                        setChildName(e.target.value)
                        setShowError(false)
                      }}
                      className={`w-full h-11 px-3.5 rounded-xl bg-gray-50 border text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-600 transition-all ${
                        showError && !childName.trim() ? 'border-danger' : 'border-gray-200'
                      }`}
                    />
                  </div>
                  <div>
                    <label htmlFor="child-age" className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                      Age
                    </label>
                    <select
                      id="child-age"
                      value={childAge}
                      onChange={e => {
                        setChildAge(e.target.value)
                        setShowError(false)
                      }}
                      className={`w-full h-11 px-3 rounded-xl bg-gray-50 border text-[15px] text-gray-900 outline-none focus:bg-white focus:border-brand-600 transition-all ${
                        showError && !childAge ? 'border-danger' : 'border-gray-200'
                      }`}
                    >
                      <option value="" disabled>–</option>
                      {Array.from({ length: 16 }, (_, i) => i + 3).map(age => (
                        <option key={age} value={age}>{age}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {showError && (
                  <p className="text-[12px] text-danger mt-2.5" role="alert">
                    Add the player&apos;s name and age to continue.
                  </p>
                )}
              </div>

              {/* Future hint — multi-child is a logged-in feature */}
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="w-full flex items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-left cursor-not-allowed bg-gray-50"
              >
                <span className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400">
                  <Plus className="w-[18px] h-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-gray-500">Add another child</span>
                  <span className="flex items-center gap-1 text-[12px] text-gray-400 mt-0.5">
                    <Lock className="w-3 h-3" /> Log in to book for multiple children
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Booking summary */}
          <div className="px-5 sm:px-6 pb-6 pt-5 border-t border-gray-100 bg-gray-50">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Your booking</h3>

            {hasSelection ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-gray-200 px-3.5 py-3">
                <div className="min-w-0">
                  {selectedSlot && selectedISO ? (
                    <>
                      <p className="text-[14px] font-semibold text-gray-900 leading-tight">
                        {dayLabel(selectedISO)} · {selectedSlot.label}
                      </p>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        1-to-1 · {sessionDurationMinutes} min{childName.trim() ? ` · ${childName.trim()}` : ''}
                      </p>
                      {/* UX-14: selected slot venue — same MapPin style as the time-picker buttons */}
                      {selectedSlot.venueName && (
                        <p className="flex min-w-0 items-center gap-0.5 text-xs font-medium text-gray-500 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate" title={selectedSlot.venueName}>{selectedSlot.venueName}</span>
                        </p>
                      )}
                    </>
                  ) : selectedProgramme && selectedISO ? (
                    <>
                      <p className="text-[14px] font-semibold text-gray-900 leading-tight">{selectedProgramme.title}</p>
                      <p className="text-[12px] text-gray-500 mt-0.5">
                        {dayLabel(selectedISO)}{selectedProgramme.startTime ? ` · ${formatTimeLabel(selectedProgramme.startTime)}` : ''}
                        {childName.trim() ? ` · ${childName.trim()}` : ''}
                      </p>
                    </>
                  ) : null}
                </div>
                <span className="text-[15px] font-bold text-gray-900 flex-shrink-0">{formatPence(totalPence)}</span>
              </div>
            ) : (
              <p className="text-[13px] text-gray-500 py-1">No time selected yet.</p>
            )}

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <span className="text-[15px] font-semibold text-gray-900">Total</span>
              <span className="text-[18px] font-bold text-gray-900">{formatPence(totalPence)}</span>
            </div>

            <button
              type="button"
              onClick={handleBook}
              disabled={!hasSelection}
              className="mt-4 w-full h-[52px] rounded-xl bg-brand-600 text-white font-bold text-[15px] hover:bg-brand-700 active:scale-[0.99] transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-brand-600 disabled:active:scale-100 disabled:cursor-not-allowed"
              data-testid="book-cta"
            >
              {ctaLabel}
            </button>
            <p className="mt-2.5 text-[12px] text-center text-gray-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> You won&apos;t be charged yet · free cancellation {cancellationWindowHours}h before
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-between gap-4 shadow-[0_-4px_16px_rgba(15,23,42,0.07)]">
        <div className="min-w-0">
          {hasSelection ? (
            <>
              <p className="text-[15px] font-bold text-gray-900 leading-tight">
                {selectedProgramme ? '1 programme' : '1 session'} · {formatPence(totalPence)}
              </p>
              <p className="text-[12px] text-gray-500 truncate">
                {selectedISO ? dayLabel(selectedISO) : ''}
                {selectedSlot ? ` · ${selectedSlot.label}` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold text-gray-900 leading-tight">Select a time</p>
              <p className="text-[12px] text-gray-500 truncate flex items-center gap-1">
                <Clock className="w-3 h-3" /> {selectedISO ? dayLabel(selectedISO) : 'Pick a date to start'}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleBook}
          disabled={!hasSelection}
          className="flex-shrink-0 inline-flex items-center justify-center h-12 px-6 rounded-xl bg-brand-600 text-white font-bold text-[15px] hover:bg-brand-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
          data-testid="book-cta-mobile"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
