'use client'
// CF-PROG-SESSION-LIST: calendar-first session scheduling for programme
// creation + editing. Replaces the previous separate date input + flat sessions
// list. Self-contained — the parent only owns `sessions: SessionEntry[]` and
// triggers re-seeds via prop changes.
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import { generateProgrammeSessionDates } from '@/lib/programme-sessions'
import type { SessionEntry, SessionEntrySlot } from './programmeConstants'

// Week header — UK convention (Monday first) to match design.
const WEEK_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
// Map JS getDay() (0=Sun..6=Sat) to UK column index (0=Mon..6=Sun).
function toUkCol(jsDay: number): number {
  return (jsDay + 6) % 7
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function todayLocalYYYYMMDD(): string {
  return toYYYYMMDD(new Date())
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((s) => parseInt(s, 10))
  const total = h * 60 + m + minutes
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`
}

function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map((s) => parseInt(s, 10))
  const [eh, em] = end.split(':').map((s) => parseInt(s, 10))
  const diff = eh * 60 + em - (sh * 60 + sm)
  return diff < 0 ? diff + 1440 : diff
}

function formatLongDate(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

interface SessionCalendarProps {
  scheduleType: 'fixed' | 'rolling'
  selectedDays: number[]            // 0=Sun..6=Sat
  defaultStartTime: string          // 'HH:MM'
  // CF-PROG-SESSION-LIST: end time replaces duration as the user-facing input.
  defaultEndTime: string            // 'HH:MM'
  campMode: boolean
  startDate: string                 // 'YYYY-MM-DD' (Rolling = required, Fixed = '' falls back to today)
  endDate: string                   // 'YYYY-MM-DD' (Rolling end, optional)
  sessionCount: number              // Fixed seed count
  sessions: SessionEntry[]          // controlled
  onChange: (sessions: SessionEntry[]) => void
  // CF-PROG-SESSION-LIST: called when the coach taps a non-pattern calendar
  // day. Parent should add `day` (0=Sun..6=Sat) to its days_of_week so the
  // matching pill highlights. The internal re-seed is suppressed for this
  // change so manual session selections are preserved.
  onSelectedDaysAdd?: (day: number) => void
  disabled?: boolean
}

export function SessionCalendar({
  scheduleType,
  selectedDays,
  defaultStartTime,
  defaultEndTime,
  campMode,
  startDate,
  endDate,
  sessionCount,
  sessions,
  onChange,
  onSelectedDaysAdd,
  disabled = false,
}: SessionCalendarProps) {
  // CF-PROG-SESSION-LIST: derived in-component because CampEditor + makeEntry
  // still need a minutes value to advance "+ Add another slot" entries.
  const defaultDurationMinutes = diffMinutes(defaultStartTime, defaultEndTime)
  // ── State ──
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const seed = startDate || todayLocalYYYYMMDD()
    const d = new Date(seed + 'T00:00:00')
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [editorDate, setEditorDate] = useState<string | null>(null)
  const [autoSeeded, setAutoSeeded] = useState<string[]>([])

  // CF-PROG-SESSION-LIST: when the coach taps a non-pattern calendar day, we
  // call onSelectedDaysAdd → parent updates days_of_week → our effect re-fires.
  // Without suppression the auto-seed would wipe the just-added session. Set
  // this ref before the parent callback so the next effect run is skipped.
  const skipNextSeedRef = useRef(false)

  // ── Auto-seed when schedule inputs change ──
  // Per CF-PROG-SESSION-LIST flag 1: re-seed wipes user customizations.
  // Per flag 2: server derives day-of-week from session_dates rather than from
  // the form input — the calendar is the truth.
  useEffect(() => {
    if (skipNextSeedRef.current) {
      skipNextSeedRef.current = false
      return
    }
    if (selectedDays.length === 0) {
      setAutoSeeded([])
      onChange([])
      return
    }
    const anchor = startDate || todayLocalYYYYMMDD()
    let candidates: string[] = []
    if (scheduleType === 'fixed') {
      candidates = generateProgrammeSessionDates({
        startDate: anchor,
        days: selectedDays,
        mode: 'count',
        count: Math.max(1, sessionCount),
        endDate: '',
      })
    } else if (endDate) {
      candidates = generateProgrammeSessionDates({
        startDate: anchor,
        days: selectedDays,
        mode: 'end_date',
        count: 0,
        endDate,
      })
    } else {
      // Rolling, no end date — preview-only seed of 12 ahead.
      candidates = generateProgrammeSessionDates({
        startDate: anchor,
        days: selectedDays,
        mode: 'count',
        count: 12,
        endDate: '',
      })
    }
    const seeded: SessionEntry[] = candidates.map((d) => ({
      date: d,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      ...(campMode
        ? { slots: [{ startTime: defaultStartTime, endTime: defaultEndTime }] }
        : {}),
    }))
    setAutoSeeded(candidates)
    onChange(seeded)
    // defaultStartTime + defaultDurationMinutes are intentionally omitted from
    // deps. Re-seeding on those would wipe per-session customisations made via
    // the inline TimeEditor whenever the coach tweaks the default duration.
    // Per-session times remain editable through the editor; only structural
    // schedule changes (which days, how many, date range, mode) re-seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleType, selectedDays.join(','), startDate, endDate, sessionCount, campMode])

  // When campMode flips ON, ensure each existing session has at least one slot.
  // When it flips OFF, leave slots in place (parent strips before send) — keeps
  // user-entered slot data recoverable if they toggle back on.
  // (Handled implicitly: the seed effect above re-runs because campMode is in deps.)

  // ── Derived ──
  const sessionByDate = useMemo(() => {
    const map = new Map<string, SessionEntry>()
    sessions.forEach((s) => map.set(s.date, s))
    return map
  }, [sessions])

  const skippedDates = useMemo(() => {
    return autoSeeded.filter((d) => !sessionByDate.has(d))
  }, [autoSeeded, sessionByDate])

  // ── Cell action helpers ──
  const makeEntry = useCallback(
    (date: string): SessionEntry => {
      return campMode
        ? { date, startTime: defaultStartTime, endTime: defaultEndTime, slots: [{ startTime: defaultStartTime, endTime: defaultEndTime }] }
        : { date, startTime: defaultStartTime, endTime: defaultEndTime }
    },
    [defaultStartTime, defaultEndTime, campMode],
  )

  function addSession(date: string) {
    if (disabled) return
    if (sessionByDate.has(date)) return
    // CF-PROG-SESSION-LIST: auto-add day-of-week when the coach taps a date
    // outside the current pattern. Suppress the upcoming re-seed so the
    // freshly-added session isn't wiped when selectedDays changes.
    const jsDay = new Date(date + 'T00:00:00').getDay()
    if (!selectedDays.includes(jsDay) && onSelectedDaysAdd) {
      skipNextSeedRef.current = true
      onSelectedDaysAdd(jsDay)
    }
    const next = [...sessions, makeEntry(date)].sort((a, b) => a.date.localeCompare(b.date))
    onChange(next)
  }

  function removeSession(date: string) {
    if (disabled) return
    onChange(sessions.filter((s) => s.date !== date))
    if (editorDate === date) setEditorDate(null)
  }

  function updateSession(date: string, patch: Partial<SessionEntry>) {
    if (disabled) return
    onChange(sessions.map((s) => (s.date === date ? { ...s, ...patch } : s)))
  }

  function openEditor(date: string) {
    if (disabled) return
    setEditorDate(date)
  }

  // ── Month grid build ──
  const grid = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstOfMonth = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const startCol = toUkCol(firstOfMonth.getDay())  // 0..6 col index (Mon=0)
    const cells: { date: string; inMonth: boolean }[] = []
    // Leading days from previous month
    if (startCol > 0) {
      const daysInPrev = new Date(year, month, 0).getDate()
      for (let i = startCol - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, daysInPrev - i)
        cells.push({ date: toYYYYMMDD(d), inMonth: false })
      }
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: toYYYYMMDD(new Date(year, month, d)), inMonth: true })
    }
    // Trailing days from next month to complete 6 rows × 7 cols (= 42).
    while (cells.length < 42) {
      const last = cells[cells.length - 1]
      const ld = new Date(last.date + 'T00:00:00')
      ld.setDate(ld.getDate() + 1)
      cells.push({ date: toYYYYMMDD(ld), inMonth: ld.getMonth() === month })
    }
    return cells
  }, [viewMonth])

  const todayKey = todayLocalYYYYMMDD()

  // ── Render ──
  const editorEntry = editorDate ? sessionByDate.get(editorDate) : undefined

  // <fieldset disabled> propagates the disabled state to every nested
  // <button>/<input>, which natively blocks both pointer AND keyboard focus.
  // Without this, pointer-events-none alone left buttons tab-reachable —
  // a WCAG gap given this is the post-enrolment schedule lock surface.
  return (
    <fieldset disabled={disabled} className={disabled ? 'opacity-60 border-0 p-0 m-0' : 'border-0 p-0 m-0'}>
      {/* Calendar card header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Session schedule</div>
          <div className="text-[12px] text-neutral-400 mt-0.5">Tap dates to add or remove.</div>
        </div>
        <div className="text-[13px] font-semibold text-brand-600">
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
          {campMode && sessions.length > 0 && ` · ${countSlots(sessions)} slot${countSlots(sessions) === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Month nav */}
      <div className="flex justify-between items-center mb-2">
        <button
          type="button"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="w-7 h-7 rounded-md bg-neutral-50 text-neutral-600 flex items-center justify-center hover:bg-neutral-100 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[15px] font-semibold text-neutral-900">{formatMonthYear(viewMonth)}</span>
        <button
          type="button"
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="w-7 h-7 rounded-md bg-neutral-50 text-neutral-600 flex items-center justify-center hover:bg-neutral-100 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_LABELS.map((l) => (
          <span
            key={l}
            className="text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wide"
          >
            {l}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {grid.map(({ date, inMonth }) => {
          const d = new Date(date + 'T00:00:00')
          const jsDay = d.getDay()
          const isPattern = selectedDays.includes(jsDay)
          const isPast = date < todayKey
          const isToday = date === todayKey
          const isSession = sessionByDate.has(date)
          const isSkipped = autoSeeded.includes(date) && !isSession
          const isAddable = isPattern && inMonth && !isPast && !isSession && !isSkipped
          // CF-PROG-SESSION-LIST: non-pattern future in-month days are now
          // tappable. Tapping triggers auto-add of the day-of-week (via
          // addSession → onSelectedDaysAdd) so the matching pill highlights.
          const isNonPatternTappable = !isPattern && inMonth && !isPast && !isSession
          const isActiveRing = editorDate === date

          // Custom-time indicator: session uses non-default times.
          // Active-ring (editor open) takes visual priority over custom-time ring.
          const session = isSession ? sessionByDate.get(date) : undefined
          const isCustomTime = !!session && !isActiveRing && (
            campMode
              ? ((session.slots?.length ?? 1) > 1 ||
                 session.slots?.[0]?.startTime !== defaultStartTime ||
                 session.slots?.[0]?.endTime !== defaultEndTime)
              : (session.startTime !== defaultStartTime || session.endTime !== defaultEndTime)
          )

          const slotCount = campMode && isSession ? (session?.slots?.length ?? 1) : 0

          return (
            <CellButton
              key={date}
              date={date}
              dayNum={d.getDate()}
              inMonth={inMonth}
              isPast={isPast}
              isToday={isToday}
              isSession={isSession}
              isSkipped={isSkipped}
              isAddable={isAddable}
              isNonPatternTappable={isNonPatternTappable}
              isActiveRing={isActiveRing}
              isCustomTime={isCustomTime}
              campBadgeCount={slotCount}
              campMode={campMode}
              // CF-PROG-SESSION-LIST: dot tap on a session ALWAYS opens the
              // editor (no pencil badge). Removal happens via the editor's
              // "Remove date" button.
              onSessionTap={() => openEditor(date)}
              onSkippedTap={() => addSession(date)}
              onAddableTap={() => addSession(date)}
              onNonPatternTap={() => addSession(date)}
            />
          )
        })}
      </div>

      {/* Skipped dates section — always visible per design */}
      <SkippedSection
        skipped={skippedDates}
        onRestore={(date) => addSession(date)}
      />

      {/* Inline editor */}
      {editorEntry && (
        campMode ? (
          <CampEditor
            entry={editorEntry}
            defaultDuration={defaultDurationMinutes}
            onClose={() => setEditorDate(null)}
            onRemove={() => removeSession(editorEntry.date)}
            onSlotsChange={(slots) => {
              const first = slots[0]
              updateSession(editorEntry.date, {
                slots,
                startTime: first?.startTime ?? editorEntry.startTime,
                endTime: first?.endTime ?? editorEntry.endTime,
              })
            }}
          />
        ) : (
          <TimeEditor
            entry={editorEntry}
            onClose={() => setEditorDate(null)}
            onRemove={() => removeSession(editorEntry.date)}
            onChange={(patch) => updateSession(editorEntry.date, patch)}
          />
        )
      )}
    </fieldset>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function countSlots(sessions: SessionEntry[]): number {
  return sessions.reduce((n, s) => n + (s.slots?.length ?? 1), 0)
}

interface CellButtonProps {
  date: string
  dayNum: number
  inMonth: boolean
  isPast: boolean
  isToday: boolean
  isSession: boolean
  isSkipped: boolean
  isAddable: boolean
  isNonPatternTappable: boolean
  isActiveRing: boolean
  isCustomTime: boolean
  campBadgeCount: number
  campMode: boolean
  onSessionTap: () => void
  onSkippedTap: () => void
  onAddableTap: () => void
  onNonPatternTap: () => void
}

function CellButton({
  date,
  dayNum,
  inMonth,
  isPast,
  isToday,
  isSession,
  isSkipped,
  isAddable,
  isNonPatternTappable,
  isActiveRing,
  isCustomTime,
  campBadgeCount,
  campMode,
  onSessionTap,
  onSkippedTap,
  onAddableTap,
  onNonPatternTap,
}: CellButtonProps) {
  const baseCls = 'relative w-10 h-10 mx-auto rounded-full flex items-center justify-center text-[13px] select-none'

  if (isSession) {
    // Ring priority: active-ring (editor open) wins over custom-time ring.
    // Both wrap the brand-600 dot in a white inner halo so the indicator is
    // visible against the white page; active-ring adds an outer brand ring.
    let ringCls = ''
    if (isActiveRing) {
      ringCls = 'shadow-[0_0_0_2px_white,0_0_0_4px_var(--color-brand-600)]'
    } else if (isCustomTime) {
      ringCls = 'shadow-[0_0_0_2px_white,0_0_0_3px_var(--color-brand-100)]'
    }
    return (
      <div className={`${baseCls} bg-brand-600 text-white font-semibold ${ringCls}`}>
        <button
          type="button"
          onClick={onSessionTap}
          className="absolute inset-0 rounded-full"
          aria-label={`Edit session on ${date}`}
        />
        <span className="pointer-events-none">{dayNum}</span>
        {/* Camp-mode slot-count badge top-right. No pencil badge in normal mode. */}
        {campMode && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-white text-brand-600 text-[10px] font-bold flex items-center justify-center shadow-sm pointer-events-none">
            {campBadgeCount || 1}
          </span>
        )}
      </div>
    )
  }

  if (isSkipped) {
    return (
      <button
        type="button"
        onClick={onSkippedTap}
        className={`${baseCls} bg-neutral-100 text-neutral-400 line-through hover:bg-slate-300 transition-colors`}
        aria-label={`Restore session on ${date}`}
      >
        {dayNum}
      </button>
    )
  }

  if (isAddable) {
    return (
      <button
        type="button"
        onClick={onAddableTap}
        className={`${baseCls} border-[1.5px] border-dashed border-brand-100 text-brand-600 hover:bg-brand-50 transition-colors`}
        aria-label={`Add session on ${date}`}
      >
        {dayNum}
      </button>
    )
  }

  if (isNonPatternTappable) {
    return (
      <button
        type="button"
        onClick={onNonPatternTap}
        className={`${baseCls} text-neutral-900 hover:bg-brand-50 hover:text-brand-600 transition-colors`}
        aria-label={`Add session on ${date} (also adds this weekday to the pattern)`}
      >
        {dayNum}
      </button>
    )
  }

  // Inert (non-pattern, past, or other-month)
  const colour =
    !inMonth || isPast ? 'text-slate-300' : 'text-neutral-900'
  const todayCls = isToday
    ? 'font-bold after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-[3px] after:h-[3px] after:rounded-full after:bg-brand-600'
    : ''
  return <div className={`${baseCls} ${colour} ${todayCls}`}>{dayNum}</div>
}

// ── Skipped section ────────────────────────────────────────────────────────────

function SkippedSection({
  skipped,
  onRestore,
}: {
  skipped: string[]
  onRestore: (date: string) => void
}) {
  return (
    <div className="mt-4">
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-[13px] font-semibold text-neutral-900">Skipped dates</span>
        {skipped.length > 0 && (
          <span className="text-[12px] text-neutral-400">{skipped.length}</span>
        )}
      </div>
      {skipped.length === 0 ? (
        <div className="bg-neutral-50 border border-dashed border-neutral-100 rounded-md px-3 py-3 text-center text-[13px] text-slate-500">
          None — tap a session dot to remove it
        </div>
      ) : (
        <div className="space-y-1.5">
          {skipped.map((d) => (
            <div
              key={d}
              className="flex justify-between items-center bg-neutral-50 rounded-md px-3 py-2.5"
            >
              <span className="text-[13px] font-medium text-slate-500 line-through">
                {formatLongDate(d)}
              </span>
              <button
                type="button"
                onClick={() => onRestore(d)}
                className="text-[13px] font-semibold text-brand-600 hover:text-brand-800 transition-colors"
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Time editor (single-session, normal mode) ──────────────────────────────────

function TimeEditor({
  entry,
  onClose,
  onRemove,
  onChange,
}: {
  entry: SessionEntry
  onClose: () => void
  onRemove: () => void
  onChange: (patch: Partial<SessionEntry>) => void
}) {
  return (
    <div className="mt-4 bg-neutral-50 border border-neutral-100 rounded-md p-3.5">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[13px] font-semibold text-neutral-900">
          Session · {formatLongDate(entry.date)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-md text-neutral-400 hover:bg-white flex items-center justify-center transition-colors"
          aria-label="Close editor"
        >
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div>
          <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">
            Start
          </label>
          <input
            type="time"
            value={entry.startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
            className="w-full h-11 px-3 rounded-md bg-white border border-neutral-100 text-sm text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-neutral-600 uppercase tracking-wide mb-1.5">
            End
          </label>
          <input
            type="time"
            value={entry.endTime}
            onChange={(e) => onChange({ endTime: e.target.value })}
            className="w-full h-11 px-3 rounded-md bg-white border border-neutral-100 text-sm text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
      </div>
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onRemove}
          className="text-[13px] font-medium text-red-600 hover:underline"
        >
          Remove date
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-4 rounded-full bg-brand-600 text-white text-[13px] font-semibold hover:bg-brand-800 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ── Camp slot editor (multiple slots per day) ──────────────────────────────────

function CampEditor({
  entry,
  defaultDuration,
  onClose,
  onRemove,
  onSlotsChange,
}: {
  entry: SessionEntry
  defaultDuration: number
  onClose: () => void
  onRemove: () => void
  onSlotsChange: (slots: SessionEntrySlot[]) => void
}) {
  const slots: SessionEntrySlot[] = entry.slots && entry.slots.length > 0
    ? entry.slots
    : [{ startTime: entry.startTime, endTime: entry.endTime }]

  function setSlot(idx: number, patch: Partial<SessionEntrySlot>) {
    const next = slots.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    onSlotsChange(next)
  }

  function removeSlot(idx: number) {
    if (slots.length <= 1) return
    onSlotsChange(slots.filter((_, i) => i !== idx))
  }

  function addSlot() {
    const last = slots[slots.length - 1]
    const newStart = last.endTime
    const newEnd = addMinutes(newStart, defaultDuration)
    onSlotsChange([...slots, { startTime: newStart, endTime: newEnd }])
  }

  return (
    <div className="mt-4 bg-neutral-50 border border-neutral-100 rounded-md p-3.5">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[13px] font-semibold text-neutral-900">
          {formatLongDate(entry.date)} · {slots.length} session{slots.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-md text-neutral-400 hover:bg-white flex items-center justify-center transition-colors"
          aria-label="Close editor"
        >
          <X size={16} />
        </button>
      </div>

      {slots.map((slot, idx) => (
        // Composite key from content + index — without this, removing a
        // middle slot causes React to reconcile by position and bleed
        // uncontrolled input state into the wrong remaining slots.
        <div key={`${idx}-${slot.startTime}-${slot.endTime}`} className="mb-3">
          <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Slot {idx + 1}
          </span>
          <div className="grid grid-cols-[1fr_1fr_32px] gap-2 items-center">
            <input
              type="time"
              value={slot.startTime}
              onChange={(e) => setSlot(idx, { startTime: e.target.value })}
              className="h-10 px-3 rounded-md bg-white border border-neutral-100 text-sm text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
            <input
              type="time"
              value={slot.endTime}
              onChange={(e) => setSlot(idx, { endTime: e.target.value })}
              className="h-10 px-3 rounded-md bg-white border border-neutral-100 text-sm text-neutral-900 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
            />
            <button
              type="button"
              onClick={() => removeSlot(idx)}
              disabled={slots.length <= 1}
              className="w-8 h-8 rounded-md bg-white border border-neutral-100 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={`Remove slot ${idx + 1}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addSlot}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors mb-3"
      >
        <Plus size={14} /> Add another slot
      </button>

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onRemove}
          className="text-[13px] font-medium text-red-600 hover:underline"
        >
          Remove date
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-5 rounded-full bg-brand-600 text-white text-sm font-semibold hover:bg-brand-800 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}
