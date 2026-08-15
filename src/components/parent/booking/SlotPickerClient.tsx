'use client'

// P-10 Screen 1: authed parent slot picker (approved Claude Design
// "Parent Booking Flow P-10", S1 mobile + desktop frames). Calendar month
// view, available times for the selected date, "How many players?" when the
// coach offers group pricing, and an ADVISORY 10-minute hold countdown that
// starts on slot tap (approved Option C — the countdown is UX only; the real
// double-booking guard is the coach_time_claims exclusion constraint fired by
// the checkout's booking insert). The duration selector from the design was
// dropped per BUG-52 (one fixed duration per coach sport) — duration shows as
// fixed info in the times caption instead.
//
// Runs on live availability data via the same pure expansion the guest flow
// and the booking API validate with (lib/availability/slots.ts) — read side
// and write side cannot drift. Guest flow files are untouched.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import {
  bookableSlots,
  localISODate,
  type GeneratedSlot,
  type SlotTemplate,
} from '@/lib/availability/slots'
import { hhmmToMinutes, type Interval } from '@/lib/availability/overlap'
import type { GroupPriceTiers } from '@/lib/coach/group-pricing'
import { displayParentTotalPence } from '@/lib/booking/commission-display'
import {
  coachPricePence,
  formatHoldClock,
  formatPricePence,
  holdSecondsRemaining,
  playerCountOptions,
} from '@/lib/booking/authed-booking-pricing'
import {
  clearBookingHold,
  readBookingHold,
  stashBookingHold,
} from '@/lib/booking/authed-booking-handoff'

/** A live booking's occupied interval from the availability API — intervals
 * only, never booking identity (BUG-14 shape). */
export interface AuthedBookedSlot {
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM' (24h) */
  start_time: string
  /** 'HH:MM' (24h) */
  end_time: string
}

export interface SlotPickerData {
  coachId: string
  coachSlug: string
  coachName: string
  sportName: string
  sessionDurationMinutes: number
  priceIndividualPence: number | null
  sessionTypes: string[]
  maxGroupSize: number | null
  groupPriceTiers: GroupPriceTiers | null
  /** From getCommissionRate() — threaded server-side, never hardcoded (BUG-70). */
  commissionRate: number
  templates: SlotTemplate[]
  blockedDates: string[]
  bookedSlots: AuthedBookedSlot[]
  minAdvanceHours: number
  maxAdvanceDays: number
}

const MON_L = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Parse 'YYYY-MM-DD' into a local-time Date (no UTC shift). */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

interface MonthCell {
  day: number
  iso: string
  date: Date
}

export function SlotPickerClient({ data }: { data: SlotPickerData }) {
  const router = useRouter()

  // "now" captured once so calendar math stays stable across re-renders
  // (same convention as the guest AvailabilityClient).
  const [now] = useState(() => new Date())
  const today = useMemo(() => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d
  }, [now])

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedISO, setSelectedISO] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<GeneratedSlot | null>(null)
  const [players, setPlayers] = useState(1)
  const [holdStartedAt, setHoldStartedAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [holdExpired, setHoldExpired] = useState(false)

  const blockedSet = useMemo(() => new Set(data.blockedDates), [data.blockedDates])

  // Live bookings as minute-intervals per date (BUG-14) — a booked slot
  // disappears from the picker entirely.
  const bookedIntervalsByDate = useMemo(() => {
    const map: Record<string, Interval[]> = {}
    for (const b of data.bookedSlots) {
      ;(map[b.date] ??= []).push({
        startMinutes: hhmmToMinutes(b.start_time),
        endMinutes: hhmmToMinutes(b.end_time),
      })
    }
    return map
  }, [data.bookedSlots])

  const slotsFor = useMemo(
    () => (date: Date): GeneratedSlot[] =>
      bookableSlots(
        date,
        data.templates,
        blockedSet,
        data.minAdvanceHours,
        data.maxAdvanceDays,
        now,
        data.sessionDurationMinutes,
        bookedIntervalsByDate[localISODate(date)] ?? [],
      ),
    [
      data.templates,
      blockedSet,
      data.minAdvanceHours,
      data.maxAdvanceDays,
      now,
      data.sessionDurationMinutes,
      bookedIntervalsByDate,
    ],
  )

  // Resume a still-ticking hold on back-navigation from the summary page —
  // the countdown must continue, not restart (approved brief).
  useEffect(() => {
    const hold = readBookingHold()
    if (!hold || hold.coachSlug !== data.coachSlug) return
    const remaining = holdSecondsRemaining(hold.holdStartedAt, Date.now())
    if (remaining <= 0) {
      clearBookingHold()
      return
    }
    const slot = slotsFor(parseISO(hold.date)).find((s) => s.time === hold.startTime)
    if (!slot) {
      // Slot no longer bookable (someone else booked it) — drop the hold.
      clearBookingHold()
      return
    }
    setSelectedISO(hold.date)
    setSelectedSlot(slot)
    setPlayers(hold.players)
    setHoldStartedAt(hold.holdStartedAt)
    setSecondsLeft(remaining)
    // Mount-only restore by design: slotsFor is stable for the lifetime of
    // this page instance ("now" never changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Advisory countdown tick. On expiry the selection is released client-side
  // and an inline notice asks the parent to pick again.
  useEffect(() => {
    if (holdStartedAt === null) return
    const tick = () => {
      const remaining = holdSecondsRemaining(holdStartedAt, Date.now())
      setSecondsLeft(remaining)
      if (remaining <= 0) {
        setSelectedSlot(null)
        setHoldStartedAt(null)
        setSecondsLeft(null)
        setHoldExpired(true)
        clearBookingHold()
      }
    }
    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [holdStartedAt])

  const selectedDate = useMemo(
    () => (selectedISO ? parseISO(selectedISO) : null),
    [selectedISO],
  )
  const slots = useMemo<GeneratedSlot[]>(
    () => (selectedDate ? slotsFor(selectedDate) : []),
    [selectedDate, slotsFor],
  )

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

  const availableISOs = useMemo(() => {
    const set = new Set<string>()
    for (const cell of monthCells) {
      if (cell && slotsFor(cell.date).length > 0) set.add(cell.iso)
    }
    return set
  }, [monthCells, slotsFor])

  const hasAnyAvailability = useMemo(() => {
    if (availableISOs.size > 0) return true
    // Look across the whole booking horizon so the empty state only shows
    // when the coach truly has nothing bookable (not just a quiet month).
    for (let offset = 0; offset <= data.maxAdvanceDays; offset++) {
      const d = new Date(today)
      d.setDate(today.getDate() + offset)
      if (slotsFor(d).length > 0) return true
    }
    return false
  }, [availableISOs, data.maxAdvanceDays, slotsFor, today])

  const prevDisabled =
    viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const playerOptions = useMemo(
    () =>
      playerCountOptions(data.sessionTypes, data.maxGroupSize, data.groupPriceTiers),
    [data.sessionTypes, data.maxGroupSize, data.groupPriceTiers],
  )
  const offersGroups = playerOptions.length > 1

  const coachPence = coachPricePence(
    players,
    selectedSlot?.pricePence ?? null,
    data.priceIndividualPence,
    data.groupPriceTiers,
  )
  const totalPence =
    coachPence !== null
      ? displayParentTotalPence(coachPence, data.commissionRate)
      : null

  const durationMinutes =
    slots.length > 0 && slots.every((s) => s.durationMinutes === slots[0].durationMinutes)
      ? slots[0].durationMinutes
      : data.sessionDurationMinutes

  const shortDate = selectedDate
    ? `${DAY_S[selectedDate.getDay()]} ${selectedDate.getDate()} ${MON_S[selectedDate.getMonth()]}`
    : null

  const canContinue = selectedSlot !== null && selectedISO !== null && totalPence !== null

  // ── Handlers ───────────────────────────────────────────────────────────────

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

  const selectDay = (cell: MonthCell) => {
    if (!availableISOs.has(cell.iso)) return
    setSelectedISO(cell.iso)
    setSelectedSlot(null)
    setHoldStartedAt(null)
    setSecondsLeft(null)
    setHoldExpired(false)
    clearBookingHold()
  }

  const selectSlot = (slot: GeneratedSlot) => {
    setHoldExpired(false)
    if (selectedSlot?.minutes === slot.minutes) {
      // Tapping the held slot again releases it.
      setSelectedSlot(null)
      setHoldStartedAt(null)
      setSecondsLeft(null)
      clearBookingHold()
      return
    }
    setSelectedSlot(slot)
    // A fresh slot tap always starts a fresh 10-minute hold.
    setHoldStartedAt(Date.now())
  }

  const selectPlayers = (count: number) => {
    setPlayers(count)
    setHoldExpired(false)
  }

  const handleContinue = () => {
    if (!canContinue || !selectedSlot || !selectedISO || holdStartedAt === null) return
    stashBookingHold({
      coachSlug: data.coachSlug,
      date: selectedISO,
      startTime: selectedSlot.time,
      players,
      holdStartedAt,
    })
    // Slot facts only in the URL — never a child's name (docs/06 rules).
    const q = new URLSearchParams()
    q.set('date', selectedISO)
    q.set('startTime', selectedSlot.time)
    q.set('players', String(players))
    router.push(`/parent/book/${data.coachSlug}/summary?${q.toString()}`)
  }

  // ── Render pieces ──────────────────────────────────────────────────────────

  const timerLine =
    secondsLeft !== null ? (
      <div
        className="flex items-center justify-center gap-1.5"
        data-testid="hold-timer"
        aria-live="polite"
      >
        <Clock size={14} className="text-neutral-400" aria-hidden="true" />
        <span className="text-[12px] text-neutral-400">
          Slot held for {formatHoldClock(secondsLeft)}
        </span>
      </div>
    ) : null

  const expiredNotice = holdExpired ? (
    <p
      className="rounded-md bg-amber-100 px-3 py-2 text-[13px] font-medium text-amber-800"
      data-testid="hold-expired-notice"
      role="status"
    >
      Your slot hold expired — please pick a time again.
    </p>
  ) : null

  const calendarCard = (
    <div className="rounded-xl bg-white p-4 shadow-sm lg:p-6" data-testid="booking-calendar">
      <div className="mb-3 flex items-center justify-between lg:mb-4">
        <p className="text-[15px] font-medium text-neutral-900 lg:text-[16px]">
          {MON_L[viewMonth]} {viewYear}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={goPrev}
            disabled={prevDisabled}
            aria-label="Previous month"
            data-testid="calendar-prev"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-transparent"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next month"
            data-testid="calendar-next"
            className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-50"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 lg:gap-1">
        {WEEKDAY_HEADERS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="text-center text-xs font-medium uppercase tracking-label text-neutral-400"
            aria-hidden="true"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 lg:gap-1" role="grid" aria-label="Choose a date">
        {monthCells.map((cell, index) => {
          if (!cell) return <div key={`lead-${index}`} aria-hidden="true" />
          const available = availableISOs.has(cell.iso)
          const selected = cell.iso === selectedISO
          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => selectDay(cell)}
              disabled={!available}
              aria-pressed={selected}
              aria-label={`${DAY_S[cell.date.getDay()]} ${cell.day} ${MON_L[cell.date.getMonth()]}${available ? '' : ' — unavailable'}`}
              data-testid={`calendar-day-${cell.iso}`}
              className={`mx-auto flex h-11 w-11 items-center justify-center rounded-md text-[14px] transition-colors lg:h-12 lg:w-12 ${
                selected
                  ? 'bg-brand-600 font-medium text-white'
                  : available
                    ? 'bg-brand-50 font-medium text-brand-800 hover:bg-brand-100'
                    : 'cursor-default text-slate-300'
              }`}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )

  const timesSection = selectedISO && (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-medium uppercase tracking-label text-slate-500">
        Available times · {shortDate} · {durationMinutes} min
      </p>
      {slots.length === 0 ? (
        <p className="text-[14px] text-neutral-600">
          No times available this day — try another date.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {slots.map((slot) => {
            const selected = selectedSlot?.minutes === slot.minutes
            return (
              <button
                key={slot.time}
                type="button"
                onClick={() => selectSlot(slot)}
                aria-pressed={selected}
                data-testid={`slot-${slot.time}`}
                className={`flex h-11 items-center justify-center rounded-md text-[14px] font-medium transition-all ${
                  selected
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-neutral-900 shadow-sm hover:bg-brand-50'
                }`}
              >
                {slot.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const groupLine =
    offersGroups && totalPence !== null
      ? `${players} ${players === 1 ? 'player' : 'players'} · ${formatPricePence(totalPence)} total`
      : null

  const playersSection = offersGroups && selectedISO && (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-medium uppercase tracking-label text-slate-500">
        How many players?
      </p>
      <div className="flex gap-2">
        {playerOptions.map((count) => {
          const selected = players === count
          return (
            <button
              key={count}
              type="button"
              onClick={() => selectPlayers(count)}
              aria-pressed={selected}
              aria-label={`${count} ${count === 1 ? 'player' : 'players'}`}
              data-testid={`player-count-${count}`}
              className={`flex h-11 w-[52px] flex-shrink-0 items-center justify-center rounded-md text-[14px] font-medium transition-all ${
                selected
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-neutral-900 shadow-sm hover:bg-brand-50'
              }`}
            >
              {count}
            </button>
          )
        })}
      </div>
      {groupLine && <p className="text-[14px] text-neutral-600">{groupLine}</p>}
    </div>
  )

  const continueButton = (variant: 'mobile' | 'desktop') => (
    <button
      type="button"
      onClick={handleContinue}
      disabled={!canContinue}
      data-testid={variant === 'mobile' ? 'continue-cta' : 'continue-cta-desktop'}
      className={`flex items-center justify-center gap-2 rounded-md bg-brand-600 text-[15px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand-600 ${
        variant === 'mobile' ? 'h-btn-mobile flex-1' : 'h-btn-desktop w-full'
      }`}
    >
      Continue to payment
      {variant === 'desktop' && totalPence !== null && ` · ${formatPricePence(totalPence)}`}
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  )

  if (!hasAnyAvailability) {
    return (
      <div className="mx-auto max-w-md px-5 py-12 text-center" data-testid="no-availability">
        <p className="text-[16px] font-medium text-neutral-900">
          No available times right now
        </p>
        <p className="mt-2 text-[14px] text-neutral-600">
          {data.coachName} has no bookable sessions at the moment — check back
          soon.
        </p>
        <Link
          href={`/coaches/${data.coachSlug}`}
          data-testid="no-availability-back-link"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-md px-5 text-[14px] font-medium text-brand-600 ring-[1.5px] ring-inset ring-brand-600 transition-colors hover:bg-brand-50"
        >
          Back to {data.coachName.split(' ')[0]}&apos;s profile
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      {/* Screen header — per approved design (back + title) */}
      <div className="bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
          <Link
            href={`/coaches/${data.coachSlug}`}
            aria-label={`Back to ${data.coachName}'s profile`}
            data-testid="back-link"
            className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-slate-50"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[16px] font-medium leading-tight text-neutral-900">
              Book a session
            </p>
            <p className="text-[12px] text-slate-500 lg:hidden">
              with {data.coachName}
            </p>
          </div>
          <p className="hidden text-[16px] font-medium text-neutral-900 lg:block">
            &nbsp;with {data.coachName}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-40 pt-5 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <div className="lg:w-[480px] lg:flex-shrink-0">{calendarCard}</div>
          <div className="flex flex-1 flex-col gap-5 lg:gap-6">
            {expiredNotice}
            {!selectedISO && (
              <p className="text-[14px] text-neutral-600">
                Pick a date to see available times.
              </p>
            )}
            {timesSection}
            {playersSection}
            {/* Desktop CTA — inline in the right column per design */}
            {selectedISO && (
              <div className="mt-2 hidden flex-col gap-2.5 lg:flex">
                {continueButton('desktop')}
                {timerLine}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sticky footer per design */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2.5 bg-white px-5 pb-5 pt-2.5 shadow-[0_-1px_3px_rgba(15,23,42,0.06)] lg:hidden">
        {timerLine}
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <p className="text-xs font-medium uppercase tracking-label text-neutral-400">
              Total
            </p>
            <p
              className="text-[19px] font-semibold text-neutral-900"
              data-testid="total-price"
            >
              {totalPence !== null ? formatPricePence(totalPence) : '—'}
            </p>
          </div>
          {continueButton('mobile')}
        </div>
      </div>
    </div>
  )
}

export function SlotPickerSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
          <div className="h-9 w-9 rounded-md bg-slate-100" />
          <div className="h-4 w-40 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8 lg:pt-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
          <div className="h-[360px] rounded-xl bg-white p-4 shadow-sm lg:w-[480px]">
            <div className="mb-4 h-4 w-32 rounded bg-slate-100" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }, (_, i) => (
                <div key={i} className="mx-auto h-10 w-10 rounded-md bg-slate-50" />
              ))}
            </div>
          </div>
          <div className="flex-1">
            <div className="mb-3 h-3 w-48 rounded bg-slate-100" />
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-11 rounded-md bg-white shadow-sm" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
