'use client'

// P-10 Screen 1 (rev 4, Lasith 16 Aug): authed parent slot picker at
// /parent/book/[coachSlug], pattern-copied from the LIVE guest picker
// (src/app/coaches/[id]/availability/_components/AvailabilityClient.tsx) so
// the two flows look identical. The guest file itself is untouched — it stays
// the guest funnel. Additions over the live layout:
//   1. "How many players?" chips below the time slots — only when the coach
//      has coach_sports.group_price_tiers; the total updates live.
//   2. Player selection replacing the guest "Who is this for?" inputs:
//      - players === 1: ChildSelector (P-07) — primary child from profiles.
//      - players > 1: ONE row of tappable child avatars (tap to select —
//        green check ring; tap again to deselect) plus a "+" button that
//        appends a guest row (first name + age + remove). Selections are
//        capped at the player count: at max, unselected avatars dim and the
//        "+" hides. Guest players are ONE-SESSION details only — never child
//        profiles, no Supabase write (approved Option C).
// Programme surfaces (Groups tab, purple calendar dots) are omitted:
// programmes are a separate funnel and not part of P-10.
//
// Carried over unchanged: the ADVISORY 10-minute hold countdown (approved
// Option C — UX only; the real double-booking guard is the coach_time_claims
// exclusion constraint fired by checkout's booking insert), the
// commission-inclusive total from getCommissionRate() (BUG-70), and the
// sessionStorage handoff (child ids and player names never go in the URL —
// docs/06 rules).

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react'
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
  type PlayerAssignment,
} from '@/lib/booking/authed-booking-handoff'
import {
  ChildSelector,
  type ChildSelectorOption,
} from '@/components/parent/children/ChildSelector'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'

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
  cancellationWindowHours: number
  /** Parent's child profiles, assembled server-side (COPPA — never fetched
   * client-side). Empty for a parent with no children yet. */
  childrenList: ChildSelectorOption[]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Selected-avatar ring/badge colour — the --success design token (#1A7A4A;
// bg-success in Tailwind). CriklyAvatar's ringColor prop takes a colour
// value, same as ChildSelector passing child.colour.
const SUCCESS_GREEN = '#1A7A4A'

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

/** A guest player row (players > 1 mode) — ONE-SESSION details only, never a
 * child profile, never written to Supabase. `key` is a local render key so
 * removing a middle row never re-associates input state. */
interface GuestRow {
  key: number
  firstName: string
  age: string
}

export function SlotPickerClient({ data }: { data: SlotPickerData }) {
  const router = useRouter()

  // "now" captured once via a lazy initializer so calendar math stays stable
  // across re-renders (same convention as the guest AvailabilityClient).
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
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([])
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [holdStartedAt, setHoldStartedAt] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [holdExpired, setHoldExpired] = useState(false)
  const [showSlotError, setShowSlotError] = useState(false)
  const nextGuestKey = useRef(1)

  const blockedSet = useMemo(() => new Set(data.blockedDates), [data.blockedDates])

  // BUG-14: live bookings as minute-intervals per date — a booked slot
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

  const childById = useMemo(
    () => new Map(data.childrenList.map((child) => [child.id, child])),
    [data.childrenList],
  )

  const makeGuestRow = (firstName = '', age = ''): GuestRow => ({
    key: nextGuestKey.current++,
    firstName,
    age,
  })

  // Resume a still-ticking hold on back-navigation from a later step — the
  // countdown must continue, not restart (approved brief).
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
    if (hold.players > 1 && hold.playerAssignments) {
      const kids: string[] = []
      const guestRows: GuestRow[] = []
      for (const pa of hold.playerAssignments) {
        if (
          pa.kind === 'child' &&
          childById.has(pa.childProfileId) &&
          !kids.includes(pa.childProfileId)
        ) {
          kids.push(pa.childProfileId)
        } else {
          // Guest entry, or a child whose profile has since disappeared —
          // restore as one-session details from the denormalised name/age.
          guestRows.push(makeGuestRow(pa.firstName, pa.age))
        }
      }
      const cappedKids = kids.slice(0, hold.players)
      setSelectedChildIds(cappedKids)
      setGuests(guestRows.slice(0, Math.max(0, hold.players - cappedKids.length)))
    }
    if (hold.childProfileId) setSelectedChildId(hold.childProfileId)
    setHoldStartedAt(hold.holdStartedAt)
    setSecondsLeft(remaining)
    // Mount-only restore by design: slotsFor/childById are stable for the
    // lifetime of this page instance ("now" and props never change).
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

  const hasAnyAvailability = useMemo(() => {
    for (let offset = 0; offset <= data.maxAdvanceDays; offset++) {
      const d = new Date(today)
      d.setDate(today.getDate() + offset)
      if (slotsFor(d).length > 0) return true
    }
    return false
  }, [data.maxAdvanceDays, slotsFor, today])

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
  // BUG-70/BR-01: the shown total is commission-inclusive so it always
  // matches what checkout will charge (unlike the guest picker, which shows
  // the coach fee and itemises the platform fee on the next page).
  const totalPence =
    coachPence !== null
      ? displayParentTotalPence(coachPence, data.commissionRate)
      : null

  const selectedChild =
    data.childrenList.find((child) => child.id === selectedChildId) ?? null

  // Pool cap: profile children + guest rows never exceed the player count.
  const totalSelected = selectedChildIds.length + guests.length
  const atMax = players > 1 && totalSelected >= players

  const hasSelection = selectedSlot !== null && totalPence !== null

  // CTA rule (Lasith, 16 Aug): disabled until at least one player is
  // selected (a profile child) or has a name entered (a guest row).
  const primaryAssigned =
    players === 1
      ? selectedChildId !== null
      : selectedChildIds.length > 0 || guests.some((g) => g.firstName.trim() !== '')
  const canBook = hasSelection && primaryAssigned

  // ── Handlers (calendar handlers mirror the guest AvailabilityClient) ───────

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
    setSelectedISO(cell.iso)
    setSelectedSlot(null)
    setHoldStartedAt(null)
    setSecondsLeft(null)
    setHoldExpired(false)
    setShowSlotError(false)
    clearBookingHold()
  }

  // UX-10: jump the view back to the current month and select today if it has
  // any availability — otherwise just reset the view.
  const goToday = () => {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    if (slotsFor(today).length > 0) {
      selectDay({ day: today.getDate(), iso: localISODate(today), date: today })
    }
  }

  const toggleSlot = (slot: GeneratedSlot) => {
    setHoldExpired(false)
    setShowSlotError(false)
    if (selectedSlot?.minutes === slot.minutes) {
      // Tapping the held slot again releases it (guest toggle behaviour).
      setSelectedSlot(null)
      setHoldStartedAt(null)
      setSecondsLeft(null)
      clearBookingHold()
      return
    }
    setSelectedSlot(slot)
    // A fresh slot tap always starts a fresh 10-minute advisory hold.
    setHoldStartedAt(Date.now())
  }

  const selectPlayers = (count: number) => {
    // Selection is sticky across the 1 ↔ group toggle, and the pool is
    // trimmed to the new cap when the count shrinks (children keep priority
    // over guest rows, both in selection order).
    if (count > 1) {
      let kids = selectedChildIds
      if (
        players === 1 &&
        selectedChildId &&
        !kids.includes(selectedChildId)
      ) {
        kids = [selectedChildId, ...kids]
      }
      kids = kids.slice(0, count)
      setSelectedChildIds(kids)
      setGuests(guests.slice(0, Math.max(0, count - kids.length)))
    } else if (count === 1 && players > 1) {
      // Collapse the pool to the primary so a later group re-entry starts
      // from truth — a stale pool would silently resurrect players the
      // parent deselected (or replaced) while in 1-on-1 mode.
      const primary = selectedChildIds[0] ?? selectedChildId
      setSelectedChildId(primary)
      setSelectedChildIds(primary ? [primary] : [])
      setGuests([])
    }
    setPlayers(count)
    setHoldExpired(false)
    setShowSlotError(false)
  }

  const handleChildSelect = (childId: string) => {
    setSelectedChildId(childId)
    // Keep the pool in lockstep while in 1-on-1 mode — a later group
    // re-entry must seed from the CURRENT primary, not a stale pool.
    setSelectedChildIds([childId])
    setShowSlotError(false)
  }

  const toggleChild = (childId: string) => {
    setShowSlotError(false)
    setSelectedChildIds((prev) => {
      if (prev.includes(childId)) return prev.filter((id) => id !== childId)
      // At the cap the avatar renders disabled, but guard anyway.
      if (prev.length + guests.length >= players) return prev
      return [...prev, childId]
    })
  }

  const addGuest = () => {
    setShowSlotError(false)
    if (totalSelected >= players) return
    setGuests((prev) => [...prev, makeGuestRow()])
  }

  const removeGuest = (key: number) => {
    setShowSlotError(false)
    setGuests((prev) => prev.filter((guest) => guest.key !== key))
  }

  const updateGuest = (key: number, patch: Partial<{ firstName: string; age: string }>) => {
    setShowSlotError(false)
    setGuests((prev) =>
      prev.map((guest) => (guest.key === key ? { ...guest, ...patch } : guest)),
    )
  }

  // Group context (Lasith, 16 Aug): when the coach offers group sessions and
  // the parent already has children, the ChildSelector "+" tile (1-on-1 mode
  // only) means "add another player to THIS session" — bump the player count
  // instead of navigating to /parent/children/new. With NO children the
  // default add-child navigation stands (a parent must create their first
  // child profile). Implemented as a capture-phase intercept because
  // ChildSelector (P-07) is reused untouched; next/link skips navigation once
  // default is prevented.
  const handleAddTileCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!offersGroups || data.childrenList.length === 0) return
    const target = event.target as Element
    if (!target.closest('[data-testid="child-selector-add"]')) return
    event.preventDefault()
    const next = playerOptions.find((count) => count > players)
    if (next !== undefined) selectPlayers(next)
  }

  const handleBook = () => {
    if (!canBook || !selectedSlot || !selectedISO || holdStartedAt === null) return

    if (players === 1) {
      if (!selectedChildId) return // canBook already guarantees this
      // Child id travels via sessionStorage only — never the URL (docs/06).
      stashBookingHold({
        coachSlug: data.coachSlug,
        date: selectedISO,
        startTime: selectedSlot.time,
        players,
        holdStartedAt,
        childProfileId: selectedChildId,
      })
    } else {
      // Every guest row that was added needs a first name (age optional, as
      // in the guest flow). Inline error, never a dialog.
      if (guests.some((g) => !g.firstName.trim())) {
        setShowSlotError(true)
        return
      }
      const playerAssignments: PlayerAssignment[] = [
        ...selectedChildIds.map((id): PlayerAssignment => {
          const child = childById.get(id)
          return {
            kind: 'child',
            childProfileId: id,
            firstName: child?.firstName ?? '',
            age: child ? String(child.age) : '',
          }
        }),
        ...guests.map(
          (g): PlayerAssignment => ({
            kind: 'guest',
            firstName: g.firstName.trim(),
            age: g.age,
          }),
        ),
      ]
      stashBookingHold({
        coachSlug: data.coachSlug,
        date: selectedISO,
        startTime: selectedSlot.time,
        players,
        holdStartedAt,
        childProfileId: selectedChildIds[0],
        playerAssignments,
      })
    }

    const q = new URLSearchParams()
    q.set('date', selectedISO)
    q.set('startTime', selectedSlot.time)
    q.set('players', String(players))
    router.push(`/parent/book/${data.coachSlug}/summary?${q.toString()}`)
  }

  // ── Display helpers ─────────────────────────────────────────────────────────

  const dayLabel = (iso: string): string => {
    const d = parseISO(iso)
    return `${DAY_S[d.getDay()]} ${d.getDate()} ${MON_S[d.getMonth()]}`
  }

  const durationMinutes = selectedSlot?.durationMinutes ?? data.sessionDurationMinutes
  const sessionTypeLabel =
    players === 1 ? '1-to-1' : `Group · ${players} players`

  const primaryFirstName = (() => {
    if (players === 1) return selectedChild?.firstName ?? null
    const firstChildId = selectedChildIds[0]
    if (firstChildId) return childById.get(firstChildId)?.firstName ?? null
    const namedGuest = guests.find((g) => g.firstName.trim())
    return namedGuest ? namedGuest.firstName.trim() : null
  })()

  if (!hasAnyAvailability) {
    return (
      <div className="py-10 text-center" data-testid="no-availability">
        <p className="text-[16px] font-bold text-gray-900">No available times right now</p>
        <p className="mt-2 text-sm text-gray-500">
          {data.coachName} has no bookable sessions at the moment — check back soon.
        </p>
        <Link
          href={`/coaches/${data.coachSlug}`}
          data-testid="no-availability-back-link"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 text-[14px] font-semibold text-brand-600 ring-[1.5px] ring-inset ring-brand-600 transition-colors hover:bg-brand-50"
        >
          Back to {data.coachName.split(' ')[0]}&apos;s profile
        </Link>
      </div>
    )
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-10 items-stretch">
      {/* LEFT — month calendar (guest layout, minus programme dots) */}
      <section aria-label="Calendar" className="rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[17px] font-bold text-gray-900" aria-live="polite">
            {MON_L[viewMonth]} {viewYear}
          </h3>
          <div className="flex items-center gap-1.5">
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
              data-testid="calendar-prev"
              className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next month"
              data-testid="calendar-next"
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
            // BUG-04: split availability by recurrence so the dots match the
            // legend — recurring slots are blue, ad-hoc (one-off) are teal.
            const hasRecurring = daySlots.some(s => !s.isAdHoc)
            const hasAdHoc = daySlots.some(s => s.isAdHoc)
            const selected = cell.iso === selectedISO
            const isToday = cell.iso === localISODate(today)

            let cls =
              'relative flex flex-col items-center justify-center aspect-square rounded-xl text-[15px] sm:text-[16px] font-semibold tabular-nums transition-all '
            if (selected) cls += 'bg-brand-600 text-white shadow-md'
            else if (bookable) cls += 'bg-white text-gray-900 border border-gray-200 hover:border-blue-500 cursor-pointer'
            else cls += 'text-gray-300 cursor-default'

            return (
              <button
                key={cell.iso}
                type="button"
                disabled={!bookable}
                aria-pressed={selected}
                aria-label={bookable ? `${dayLabel(cell.iso)}, sessions available` : undefined}
                onClick={() => bookable && selectDay(cell)}
                className={cls}
                data-testid={`cal-day-${cell.iso}`}
              >
                <span>{cell.day}</span>
                {bookable && (
                  <span aria-hidden className="flex flex-row items-center gap-0.5 mt-0.5">
                    {hasRecurring && (
                      <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-blue-500'}`} />
                    )}
                    {hasAdHoc && (
                      <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : 'bg-teal-500'}`} />
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

        {/* Legend — matches the guest picker minus the programme swatch */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 pt-5 border-t border-gray-100 text-[13px] text-gray-500">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
            1-on-1
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
          {/* Available times */}
          <div className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h3 className="text-[16px] font-bold text-gray-900">Available times</h3>
              {selectedISO && <span className="text-[14px] font-semibold text-brand-600">{dayLabel(selectedISO)}</span>}
            </div>

            {holdExpired && (
              <p
                className="mb-4 rounded-xl bg-amber-100 px-3.5 py-2.5 text-[13px] font-medium text-amber-800"
                data-testid="hold-expired-notice"
                role="status"
              >
                Your slot hold expired — please pick a time again.
              </p>
            )}

            {!selectedISO ? (
              <p className="text-sm text-gray-500 py-1">Select a date to see available times.</p>
            ) : slots.length > 0 ? (
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
                          <span className="min-w-0 truncate" title={slot.venueName}>{slot.venueName}</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-1">No times on this date — try another day.</p>
            )}

            {/* P-10 addition 1: player count — only when the coach has group
                pricing tiers. Total updates live per selection. */}
            {offersGroups && selectedISO && (
              <div className="mt-5">
                <h4 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-2.5">
                  How many players?
                </h4>
                <div className="flex items-center gap-2.5">
                  {playerOptions.map(count => {
                    const isSel = players === count
                    return (
                      <button
                        key={count}
                        type="button"
                        onClick={() => selectPlayers(count)}
                        aria-pressed={isSel}
                        aria-label={`${count} ${count === 1 ? 'player' : 'players'}`}
                        data-testid={`player-count-${count}`}
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
                {totalPence !== null && (
                  <p className="text-[13px] text-gray-500 mt-2" data-testid="group-price-line">
                    {players} {players === 1 ? 'player' : 'players'} · {formatPricePence(totalPence)} total
                  </p>
                )}
              </div>
            )}
          </div>

          {/* P-10 addition 2: player selection. 1-on-1 keeps ChildSelector
              (P-07, untouched — capture wrapper redirects the "+" tile in the
              group context, see handleAddTileCapture). Group mode renders ONE
              row of toggleable child avatars plus a "+" that appends guest
              rows, capped at the player count. */}
          <div className="px-5 sm:px-6 pb-6 pt-5 border-t border-gray-100">
            {players === 1 ? (
              <div onClickCapture={handleAddTileCapture}>
                <ChildSelector
                  childrenList={data.childrenList}
                  selectedChildId={selectedChildId}
                  onSelect={handleChildSelect}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3" data-testid="player-selection">
                <span className="text-base font-medium text-neutral-900">
                  Who is this session for?
                </span>
                <p className="text-[13px] text-gray-500">
                  Guest players are for this session only — no profile needed.
                </p>

                <div
                  role="group"
                  aria-label="Who is this session for?"
                  className="flex items-start gap-4 overflow-x-auto pb-1"
                >
                  {data.childrenList.map((child) => {
                    const selected = selectedChildIds.includes(child.id)
                    const dimmed = !selected && atMax
                    return (
                      <button
                        key={child.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={dimmed}
                        onClick={() => toggleChild(child.id)}
                        data-testid={`select-child-${child.id}`}
                        className={`flex min-w-[72px] flex-col items-center gap-2 ${
                          dimmed ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                      >
                        <span className="relative inline-block">
                          <CriklyAvatar
                            seed={child.firstName}
                            style="adventurer"
                            size={56}
                            ringColor={selected ? SUCCESS_GREEN : child.colour}
                            ringWidth={selected ? 3 : 1.5}
                            alt={`${child.firstName}, age ${child.age}`}
                          />
                          {selected && (
                            <span
                              className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-white"
                              aria-hidden
                            >
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-sm text-neutral-900 ${
                            selected ? 'font-bold' : 'font-normal'
                          }`}
                        >
                          {child.firstName}
                        </span>
                      </button>
                    )
                  })}

                  {!atMax && (
                    <button
                      type="button"
                      onClick={addGuest}
                      aria-label="Add a guest player"
                      data-testid="add-guest-player"
                      className="flex min-w-[72px] flex-col items-center gap-2"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full border-[1.5px] border-dashed border-neutral-400 bg-white">
                        <Plus size={22} className="text-neutral-400" aria-hidden />
                      </span>
                      <span className="text-sm text-neutral-600">Add player</span>
                    </button>
                  )}
                </div>

                {guests.map((guest, index) => {
                  const guestNumber = index + 1
                  const nameMissing = showSlotError && !guest.firstName.trim()
                  return (
                    <div
                      key={guest.key}
                      className="grid grid-cols-[1fr_84px_auto] items-end gap-3 rounded-xl border border-gray-200 p-4"
                      data-testid={`guest-row-${guestNumber}`}
                    >
                      <div>
                        <label
                          htmlFor={`guest-${guest.key}-name`}
                          className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5"
                        >
                          First name
                        </label>
                        <input
                          id={`guest-${guest.key}-name`}
                          type="text"
                          autoComplete="off"
                          placeholder="e.g. Sam"
                          value={guest.firstName}
                          onChange={(e) => updateGuest(guest.key, { firstName: e.target.value })}
                          aria-invalid={nameMissing}
                          aria-describedby={showSlotError ? 'player-selection-error' : undefined}
                          data-testid={`guest-name-${guestNumber}`}
                          className={`w-full h-11 px-3.5 rounded-xl bg-gray-50 border text-[15px] text-gray-900 placeholder:text-gray-400 outline-none focus:bg-white focus:border-brand-600 transition-all ${
                            nameMissing ? 'border-danger' : 'border-gray-200'
                          }`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`guest-${guest.key}-age`}
                          className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5"
                        >
                          Age
                        </label>
                        <select
                          id={`guest-${guest.key}-age`}
                          value={guest.age}
                          onChange={(e) => updateGuest(guest.key, { age: e.target.value })}
                          data-testid={`guest-age-${guestNumber}`}
                          className="w-full h-11 px-3 rounded-xl bg-gray-50 border border-gray-200 text-[15px] text-gray-900 outline-none focus:bg-white focus:border-brand-600 transition-all"
                        >
                          <option value="">–</option>
                          {Array.from({ length: 16 }, (_, i) => i + 3).map((age) => (
                            <option key={age} value={age}>{age}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeGuest(guest.key)}
                        aria-label={`Remove guest player ${guestNumber}`}
                        data-testid={`remove-guest-${guestNumber}`}
                        className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}

                {showSlotError && (
                  <p
                    id="player-selection-error"
                    className="text-[12px] text-danger"
                    role="alert"
                    data-testid="player-selection-error"
                  >
                    Add each guest player&apos;s first name to continue.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Booking summary */}
          <div className="px-5 sm:px-6 pb-6 pt-5 border-t border-gray-100 bg-gray-50">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Your booking</h3>

            {hasSelection && selectedSlot && selectedISO ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-gray-200 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900 leading-tight">
                    {dayLabel(selectedISO)} · {selectedSlot.label}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5">
                    {sessionTypeLabel} · {durationMinutes} min{primaryFirstName ? ` · ${primaryFirstName}` : ''}
                  </p>
                  {selectedSlot.venueName && (
                    <p className="flex min-w-0 items-center gap-0.5 text-xs font-medium text-gray-500 mt-0.5">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate" title={selectedSlot.venueName}>{selectedSlot.venueName}</span>
                    </p>
                  )}
                </div>
                <span className="text-[15px] font-bold text-gray-900 flex-shrink-0" data-testid="summary-price">
                  {totalPence !== null ? formatPricePence(totalPence) : ''}
                </span>
              </div>
            ) : (
              <p className="text-[13px] text-gray-500 py-1">No time selected yet.</p>
            )}

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <span className="text-[15px] font-semibold text-gray-900">Total</span>
              <span className="text-[18px] font-bold text-gray-900" data-testid="total-price">
                {totalPence !== null && hasSelection ? formatPricePence(totalPence) : '£0'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleBook}
              disabled={!canBook}
              className="mt-4 w-full h-[52px] rounded-xl bg-brand-600 text-white font-bold text-[15px] hover:bg-brand-700 active:scale-[0.99] transition-all shadow-sm disabled:opacity-40 disabled:hover:bg-brand-600 disabled:active:scale-100 disabled:cursor-not-allowed"
              data-testid="book-cta"
            >
              Book this slot
            </button>
            {secondsLeft !== null && (
              <p
                className="mt-2.5 text-[12px] text-center text-gray-400 flex items-center justify-center gap-1.5"
                data-testid="hold-timer"
                aria-live="polite"
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Slot held for {formatHoldClock(secondsLeft)}
              </p>
            )}
            <p className="mt-2.5 text-[12px] text-center text-gray-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> You won&apos;t be charged yet · free cancellation {data.cancellationWindowHours}h before
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile sticky bottom bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex items-center justify-between gap-4 shadow-[0_-4px_16px_rgba(15,23,42,0.07)]">
        <div className="min-w-0">
          {hasSelection && totalPence !== null ? (
            <>
              <p className="text-[15px] font-bold text-gray-900 leading-tight">
                1 session · {formatPricePence(totalPence)}
              </p>
              <p className="text-[12px] text-gray-500 truncate">
                {selectedISO ? dayLabel(selectedISO) : ''}
                {selectedSlot ? ` · ${selectedSlot.label}` : ''}
                {secondsLeft !== null ? ` · held ${formatHoldClock(secondsLeft)}` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold text-gray-900 leading-tight">Select a time</p>
              <p className="text-[12px] text-gray-500 truncate flex items-center gap-1">
                <Clock className="w-3 h-3" aria-hidden="true" /> {selectedISO ? dayLabel(selectedISO) : 'Pick a date to start'}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleBook}
          disabled={!canBook}
          className="flex-shrink-0 inline-flex items-center justify-center h-12 px-6 rounded-xl bg-brand-600 text-white font-bold text-[15px] hover:bg-brand-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
          data-testid="book-cta-mobile"
        >
          Book this slot
        </button>
      </div>
    </div>
  )
}

export function SlotPickerSkeleton() {
  return (
    <div className="grid animate-pulse lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-10">
      <div className="rounded-2xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div className="mb-5 h-5 w-36 rounded bg-gray-100" />
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-gray-50" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <div className="mb-4 h-5 w-32 rounded bg-gray-100" />
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-11 rounded-xl bg-gray-50" />
          ))}
        </div>
        <div className="mt-6 h-14 rounded-xl bg-gray-50" />
        <div className="mt-4 h-[52px] rounded-xl bg-gray-100" />
      </div>
    </div>
  )
}
