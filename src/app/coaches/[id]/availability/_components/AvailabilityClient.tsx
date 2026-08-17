'use client'

// P-00b-D2: full-page coach availability calendar (ported from the approved
// Claude Design mock `availability-page.js` to React state). Two-column on
// desktop (calendar left, booking panel right), single column + sticky bottom
// bar on mobile. Surfaces BOTH 1-on-1 slots and group-programme sessions on one
// calendar. Guest state only — single participant per booking (UX-16);
// multi-participant, recurring booking and a multi-slot basket are out of
// scope for Block 0.

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  Clock,
  Calendar,
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
import { stashParticipant } from '@/lib/booking/participant-handoff'
import { hhmmToMinutes, type Interval } from '@/lib/availability/overlap'
import {
  AuthedPlayerPicker,
  type AuthedBookingContext,
  type PlayerPickerSelection,
} from '@/components/booking/AuthedPlayerPicker'
import {
  coachPricePence,
  playerCountOptions,
} from '@/lib/booking/authed-booking-pricing'
import { formatPlayersLabel } from '@/lib/booking/participants'
import type { GroupPriceTiers } from '@/lib/coach/group-pricing'
import { stashBookingHold } from '@/lib/booking/authed-booking-handoff'

/**
 * BUG-14: a live booking's occupied interval, as shaped by the availability
 * API's booked_slots field — intervals only, never booking identity. Statuses
 * pending_payment / confirmed / completed hold the slot (migration 034's
 * slot-holding predicate); cancelled and soft-deleted rows are never sent.
 */
export interface BookedSlot {
  /** 'YYYY-MM-DD' */
  date: string
  /** 'HH:MM' (24h) */
  start_time: string
  /** 'HH:MM' (24h) */
  end_time: string
}

interface Props {
  coachId: string
  pricePence: number | null
  sessionDurationMinutes: number
  templates: SlotTemplate[]
  blockedDates: string[]
  bookedSlots: BookedSlot[]
  minAdvanceHours: number
  maxAdvanceDays: number
  cancellationWindowHours: number
  programmesByDate: Record<string, DayProgramme[]>
  programmeDates: string[]
  /**
   * P-10 single-flow: server-assembled context for a signed-in PARENT, or
   * null/absent for everyone else. Forks "Who is this for?" + the CTA.
   */
  authedBooking?: AuthedBookingContext | null
  /**
   * P-10 Phase 3: the coach's group pricing, for EVERY visitor — drives the
   * guest "How many players?" chips + per-player rows. null/absent = no
   * group booking UI (1-player guest behaviour unchanged).
   */
  groupPricing?: GroupPricingInfo | null
}

/** The coach's group-pricing surface (first sport, BUG-51-deterministic). */
export interface GroupPricingInfo {
  sessionTypes: string[]
  maxGroupSize: number | null
  groupPriceTiers: GroupPriceTiers | null
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
  bookedSlots,
  minAdvanceHours,
  maxAdvanceDays,
  cancellationWindowHours,
  programmesByDate,
  programmeDates,
  authedBooking,
  groupPricing,
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
  const [participantName, setParticipantName] = useState('')
  const [participantAge, setParticipantAge] = useState('')
  const [showError, setShowError] = useState(false)

  // P-10 single-flow: the signed-in parent's player selection, reported by
  // AuthedPlayerPicker. `authed === null` (guests, coach-only, player-only)
  // leaves every pre-existing state and code path untouched.
  const authed = authedBooking ?? null
  const [pickerSelection, setPickerSelection] = useState<PlayerPickerSelection | null>(null)
  const [showPickerError, setShowPickerError] = useState(false)

  const handlePickerChange = (selection: PlayerPickerSelection) => {
    setPickerSelection(selection)
    setShowPickerError(false)
  }

  // P-10 Phase 3: GUEST group booking. Chips pick the player count; player 1
  // stays the pre-existing name/age inputs; players 2..N are extra rows. All
  // names travel to /book via URL params (the established guest handoff —
  // guest participant names already ride the URL, BUG-02/UX-16 precedent).
  const guestPlayerOptions = useMemo(
    () =>
      groupPricing
        ? playerCountOptions(
            groupPricing.sessionTypes,
            groupPricing.maxGroupSize,
            groupPricing.groupPriceTiers,
          )
        : [1],
    [groupPricing],
  )
  const guestOffersGroups = !authed && guestPlayerOptions.length > 1
  const [guestPlayers, setGuestPlayers] = useState(1)
  const [guestExtras, setGuestExtras] = useState<{ key: number; name: string; age: string }[]>([])
  const nextGuestExtraKey = useRef(1)

  const selectGuestPlayers = (count: number) => {
    setGuestPlayers(count)
    setGuestExtras((prev) => {
      const next = prev.slice(0, Math.max(0, count - 1))
      while (next.length < count - 1) {
        next.push({ key: nextGuestExtraKey.current++, name: '', age: '' })
      }
      return next
    })
    setShowError(false)
  }

  const updateGuestExtra = (key: number, patch: Partial<{ name: string; age: string }>) => {
    setGuestExtras((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
    setShowError(false)
  }

  const selectedDate = useMemo(() => (selectedISO ? parseISO(selectedISO) : null), [selectedISO])

  // BUG-16: a date's committed programme sessions as minute-intervals, so a
  // colliding 1-on-1 slot can be suppressed (the Programme always wins).
  //
  // BUG-19 P2.6: read `blocks`, never startTime/endTime — those are the first
  // block only (display). A camp day is one entry with several blocks, and
  // EVERY block must suppress (Option B: the afternoon block stays dead for
  // 1-on-1s even though the day renders as a single enrolment card).
  const programmeIntervalsFor = useMemo(
    () => (iso: string): Interval[] =>
      (programmesByDate[iso] ?? []).reduce<Interval[]>((acc, p) => {
        for (const b of p.blocks) {
          acc.push({ startMinutes: hhmmToMinutes(b.startTime), endMinutes: hhmmToMinutes(b.endTime) })
        }
        return acc
      }, []),
    [programmesByDate],
  )

  // BUG-14: live bookings as minute-intervals per date. Merged with programme
  // sessions below so a booked slot disappears from the picker exactly like a
  // programme collision — and reappears on the next page load once the booking
  // is cancelled (the API stops sending its interval).
  const bookedIntervalsByDate = useMemo(() => {
    const map: Record<string, Interval[]> = {}
    for (const b of bookedSlots) {
      ;(map[b.date] ??= []).push({
        startMinutes: hhmmToMinutes(b.start_time),
        endMinutes: hhmmToMinutes(b.end_time),
      })
    }
    return map
  }, [bookedSlots])

  // The single busy-interval feed for bookableSlots: programme sessions
  // (BUG-16) + live bookings (BUG-14).
  const busyIntervalsFor = useMemo(
    () => (iso: string): Interval[] => [
      ...programmeIntervalsFor(iso),
      ...(bookedIntervalsByDate[iso] ?? []),
    ],
    [programmeIntervalsFor, bookedIntervalsByDate],
  )

  const slotsFor = useMemo(
    () => (date: Date): GeneratedSlot[] =>
      bookableSlots(
        date,
        templates,
        blockedSet,
        minAdvanceHours,
        maxAdvanceDays,
        now,
        sessionDurationMinutes,
        busyIntervalsFor(localISODate(date)),
      ),
    [templates, blockedSet, minAdvanceHours, maxAdvanceDays, now, sessionDurationMinutes, busyIntervalsFor],
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

  // P-10 fix 4: an authed SLOT booking needs EVERY player slot filled before
  // the CTA enables (picker.isComplete). Programme selections keep guest
  // gating — enrolment stays on the guest funnel (approved decision 4).
  const ctaDisabled =
    !hasSelection ||
    (authed !== null &&
      selectedSlot !== null &&
      !(pickerSelection?.isComplete ?? false))

  const handleBook = () => {
    if (!hasSelection) return
    // BUG-24: programmes enrol through the detail page's SessionPicker — the
    // ONE programme funnel. (The old /book/[coachId]?programme=… destination
    // never read the param; the enrolment silently evaporated.) The
    // participant is captured and validated at the enrolment checkout, so no
    // name gate here; anything already typed on this panel travels via
    // sessionStorage — never the URL, a child's name must not land in a
    // shareable link (docs/06 child-data rules).
    if (selectedProgramme) {
      stashParticipant(participantName, participantAge)
      router.push(`/coaches/${coachId}/programmes/${selectedProgramme.id}`)
      return
    }
    // P-10 bug 4 (single checkout page): a signed-in parent books through
    // the SAME /book/[coachId] checkout as guests — the page detects auth
    // and swaps the POST target to /api/parent/bookings. Player identities
    // travel via the sessionStorage handoff — never the URL (docs/06); the
    // URL carries the same non-PII slot facts as the guest handoff.
    if (authed && selectedSlot && selectedISO) {
      if (!pickerSelection || !pickerSelection.isComplete) {
        setShowPickerError(true)
        return
      }
      // P-10 bug 1: the primary is stashed SEPARATELY — it must never appear
      // inside additionalParticipants (which mirrors the DB column exactly).
      // The picker reports one entry per slot (index 0 = primary), so the
      // split happens here; a 1-on-1 pick builds the primary from the child
      // profile so checkout can always show the name.
      const assignments = pickerSelection.playerAssignments ?? []
      const primaryChild = authed.childrenList.find(
        (c) => c.id === pickerSelection.childProfileId,
      )
      stashBookingHold({
        coachId,
        date: selectedISO,
        startTime: selectedSlot.time,
        players: pickerSelection.players,
        holdStartedAt: Date.now(),
        childProfileId: pickerSelection.childProfileId,
        primaryPlayer:
          assignments[0] ??
          (primaryChild
            ? {
                kind: 'child',
                childProfileId: primaryChild.id,
                firstName: primaryChild.firstName,
                age: String(primaryChild.age),
              }
            : undefined),
        additionalParticipants:
          assignments.length > 1 ? assignments.slice(1) : undefined,
      })
      const q = new URLSearchParams()
      q.set('date', selectedISO)
      q.set('startTime', selectedSlot.time)
      q.set('sessionType', pickerSelection.players > 1 ? 'group' : 'individual')
      const authedPrice = coachPricePence(
        pickerSelection.players,
        selectedSlot.pricePence ?? null,
        pricePence,
        authed.groupPriceTiers,
      )
      if (authedPrice != null) q.set('price', String(authedPrice))
      if (pickerSelection.players > 1) q.set('players', String(pickerSelection.players))
      router.push(`/book/${coachId}?${q.toString()}`)
      return
    }
    // UX-16: every player needs a name; ages are optional (adult players may
    // omit them). P-10 Phase 3 extends the gate to the extra guest rows.
    if (
      !participantName.trim() ||
      (guestPlayers > 1 && guestExtras.some((row) => !row.name.trim()))
    ) {
      setShowError(true)
      return
    }
    const q = new URLSearchParams()
    if (selectedSlot && selectedISO) {
      // Param names mirror what the checkout page reads (date + startTime) so the
      // booking summary shows the slot the guest picked (BUG-02).
      q.set('date', selectedISO)
      q.set('startTime', selectedSlot.time)
      // P-10 Phase 3: a group booking is exactly a multi-player booking (the
      // guest API enforces the same coherence rule).
      q.set('sessionType', guestPlayers > 1 ? 'group' : 'individual')
      // BUG-08: individual bookings prefer the slot's per-block override, then
      // the sport default; groups price from the tier (D4 — overrides never
      // apply). Display-only — the booking server re-derives the authoritative
      // price (BUG-09).
      const effectivePrice =
        guestPlayers > 1
          ? coachPricePence(
              guestPlayers,
              selectedSlot.pricePence ?? null,
              pricePence,
              groupPricing?.groupPriceTiers ?? null,
            )
          : selectedSlot.pricePence ?? pricePence
      if (effectivePrice != null) q.set('price', String(effectivePrice))
    }
    // Param names mirror what the checkout page reads (UX-16).
    q.set('participant', participantName.trim())
    if (participantAge) q.set('age', participantAge)
    // P-10 Phase 3: extra players ride numbered params (participant2/age2…) —
    // the same established guest URL handoff as the primary.
    if (guestPlayers > 1) {
      q.set('players', String(guestPlayers))
      guestExtras.forEach((row, index) => {
        q.set(`participant${index + 2}`, row.name.trim())
        if (row.age) q.set(`age${index + 2}`, row.age)
      })
    }
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
  // P-10: a GROUP selection — authed picker count or guest chips — prices
  // from the coach's group tier instead (TOTAL pence for that size —
  // CF-PRICE-01, overrides never apply to tiers); 1 player keeps the exact
  // pre-existing derivation (coachPricePence(1, …) ≡ override ?? default).
  // Coach fee only — the platform fee is itemised at checkout (decision 1).
  const authedPlayers = authed ? pickerSelection?.players ?? 1 : 1
  const displayPlayers = authed ? authedPlayers : guestPlayers
  const totalPence = selectedSlot
    ? authed
      ? coachPricePence(
          authedPlayers,
          selectedSlot.pricePence ?? null,
          pricePence,
          authed.groupPriceTiers,
        ) ?? 0
      : guestPlayers > 1
        ? coachPricePence(
            guestPlayers,
            selectedSlot.pricePence ?? null,
            pricePence,
            groupPricing?.groupPriceTiers ?? null,
          ) ?? 0
        : selectedSlot.pricePence ?? pricePence ?? 0
    : selectedProgramme
      ? selectedProgramme.pricePence
      : 0

  // Summary-card participant (P-10 fix 2): EVERY player, not just the
  // primary — "Yuwin + Arthur + Sam", or "Yuwin + 3 others" past three.
  const participantLabel = authed
    ? pickerSelection && pickerSelection.players > 1
      ? formatPlayersLabel(
          (pickerSelection.playerAssignments ?? []).map((p) => p.firstName),
        )
      : authed.childrenList.find((c) => c.id === pickerSelection?.childProfileId)
          ?.firstName ?? ''
    : guestPlayers > 1
      ? formatPlayersLabel([participantName, ...guestExtras.map((row) => row.name)])
      : participantName.trim()
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

          {/* Who is this for? — P-10 fix 1: player selection (chips, child
              picker, name/age inputs) appears only AFTER a booking selection
              is made — never on page load. A time slot reveals it in both
              modes; a GUEST programme selection also reveals the name inputs
              so the BUG-24 enrolment pre-fill keeps working (decision 4:
              programme behaviour unchanged — the authed picker stays hidden
              for programme-only selections since Enrol never reads it).
              Deselecting the slot (or changing day) unmounts this block and
              AuthedPlayerPicker resets, re-reporting a fresh selection on
              remount; a DIRECT slot-to-slot switch keeps it mounted, so the
              player selection intentionally survives — player identity is
              coach-level, not slot-level. */}
          {(selectedSlot !== null || (!authed && selectedProgramme !== null)) && (
          <div className="px-5 sm:px-6 pb-6 pt-5 border-t border-gray-100">
            {authed ? (
              /* P-10 single-flow: signed-in parents pick from child profiles
                 (plus guest players for groups) instead of free-text inputs.
                 The guest markup below is untouched. */
              <AuthedPlayerPicker
                context={authed}
                showError={showPickerError}
                onChange={handlePickerChange}
              />
            ) : (
              <>
            {/* P-10 Phase 3: guest player count — only when the coach has
                group pricing tiers AND a 1-on-1 slot is selected (player
                counts don't apply to programme enrolments). Total updates
                live per selection. */}
            {guestOffersGroups && selectedSlot !== null && (
              <div className="mb-4">
                <h4 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-2.5">
                  How many players?
                </h4>
                <div className="flex items-center gap-2.5">
                  {guestPlayerOptions.map(count => {
                    const isSel = guestPlayers === count
                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() => selectGuestPlayers(count)}
                        aria-pressed={isSel}
                        aria-label={`${count} ${count === 1 ? 'player' : 'players'}`}
                        data-testid={`guest-player-count-${count}`}
                        className={`flex h-11 w-12 items-center justify-center rounded-xl border-[1.5px] text-base font-semibold tabular-nums transition-all ${
                          isSel
                            ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                            : 'bg-white border-gray-300 text-gray-900 hover:border-brand-600 hover:bg-brand-50'
                        }`}
                      >
                        {count}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <h3 className="text-[16px] font-bold text-gray-900">Who is this for?</h3>
            <p className="text-[13px] text-gray-500 mt-1 mb-4">Tell us about the player. Used for this booking only.</p>

            {/* P-10 bug 2: Player 1 uses the SAME compact one-line layout as
                players 2+ (label · name · age) — ids unchanged (UX-16 e2e
                relies on #participant-name). */}
            <div
              className="grid grid-cols-[56px_1fr_72px] items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2"
              data-testid="guest-primary-row"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Player 1
              </span>
              <input
                id="participant-name"
                type="text"
                autoComplete="off"
                placeholder="Name"
                aria-label="Player 1 name"
                value={participantName}
                onChange={e => {
                  setParticipantName(e.target.value)
                  setShowError(false)
                }}
                aria-invalid={showError && !participantName.trim()}
                aria-describedby={
                  showError && !participantName.trim() ? 'guest-players-error' : undefined
                }
                className={`w-full h-11 px-3 rounded-xl bg-gray-50 border text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-600 transition-all ${
                  showError && !participantName.trim() ? 'border-danger' : 'border-gray-200'
                }`}
              />
              <select
                id="participant-age"
                aria-label="Player 1 age"
                value={participantAge}
                onChange={e => {
                  setParticipantAge(e.target.value)
                  setShowError(false)
                }}
                className="w-full h-11 px-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[15px] text-gray-900 outline-none focus:bg-white focus:border-brand-600 transition-all"
              >
                {/* UX-16: optional — adults booking for themselves may skip it */}
                <option value="">Age</option>
                {Array.from({ length: 16 }, (_, i) => i + 3).map(age => (
                  <option key={age} value={age}>{age}</option>
                ))}
              </select>
            </div>
            {showError && (
              <p id="guest-players-error" className="text-[12px] text-danger mt-2.5" role="alert">
                {guestPlayers > 1
                  ? 'Add each player’s name to continue.'
                  : 'Add the player’s name to continue.'}
              </p>
            )}

            {/* P-10 fix 3: players 2..N — ONE compact line per player
                (label · name · age), so four players never stretch the
                panel. Same behaviour as the full rows, tighter layout. */}
            {guestOffersGroups &&
              selectedSlot !== null &&
              guestPlayers > 1 &&
              guestExtras.map((row, index) => {
                const playerNumber = index + 2
                const nameMissing = showError && !row.name.trim()
                return (
                  <div
                    key={row.key}
                    className="mt-2.5 grid grid-cols-[56px_1fr_72px] items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2"
                    data-testid={`guest-extra-row-${playerNumber}`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Player {playerNumber}
                    </span>
                    <input
                      id={`participant-${playerNumber}-name`}
                      type="text"
                      autoComplete="off"
                      placeholder="Name"
                      aria-label={`Player ${playerNumber} name`}
                      value={row.name}
                      onChange={e => updateGuestExtra(row.key, { name: e.target.value })}
                      aria-invalid={nameMissing}
                      aria-describedby={nameMissing ? 'guest-players-error' : undefined}
                      data-testid={`guest-extra-name-${playerNumber}`}
                      className={`w-full h-11 px-3 rounded-xl bg-gray-50 border text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-600 transition-all ${
                        nameMissing ? 'border-danger' : 'border-gray-200'
                      }`}
                    />
                    <select
                      id={`participant-${playerNumber}-age`}
                      aria-label={`Player ${playerNumber} age`}
                      value={row.age}
                      onChange={e => updateGuestExtra(row.key, { age: e.target.value })}
                      data-testid={`guest-extra-age-${playerNumber}`}
                      className="w-full h-11 px-2.5 rounded-xl bg-gray-50 border border-gray-200 text-[15px] text-gray-900 outline-none focus:bg-white focus:border-brand-600 transition-all"
                    >
                      <option value="">Age</option>
                      {Array.from({ length: 16 }, (_, i) => i + 3).map(age => (
                        <option key={age} value={age}>{age}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
              </>
            )}
          </div>
          )}

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
                        {displayPlayers > 1 ? `Group · ${displayPlayers} players` : '1-to-1'} · {sessionDurationMinutes} min{participantLabel ? ` · ${participantLabel}` : ''}
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
                        {participantName.trim() ? ` · ${participantName.trim()}` : ''}
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
              disabled={ctaDisabled}
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
                {selectedProgramme ? '1 programme' : displayPlayers > 1 ? `Group · ${displayPlayers} players` : '1 session'} · {formatPence(totalPence)}
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
          disabled={ctaDisabled}
          className="flex-shrink-0 inline-flex items-center justify-center h-12 px-6 rounded-xl bg-brand-600 text-white font-bold text-[15px] hover:bg-brand-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
          data-testid="book-cta-mobile"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
