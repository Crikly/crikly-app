'use client'

// UI-DATE-PICKER: BST-safe custom date picker replacing the platform-native
// <input type="date">. All date math uses local components (getFullYear /
// getMonth / getDate) — never toISOString — so a date selected in BST does
// not silently shift by a day.

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

export interface DatePickerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minDate?: string
  disabled?: boolean
}

// ── BST-safe date helpers ────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseLocalDate(s: string | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** BST-safe today as 'YYYY-MM-DD' — shared with all callers that need a `minDate`. */
export function todayYYYYMMDD(): string {
  return toLocalDateString(new Date())
}

// ── Component ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  minDate,
  disabled = false,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedDate = useMemo(() => parseLocalDate(value), [value])
  const minDateParsed = useMemo(() => parseLocalDate(minDate), [minDate])
  const todayLocal = useMemo(() => startOfDay(new Date()), [])

  // Initial calendar view: month of `value`, else max(today, minDate) month.
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (selectedDate) return startOfMonth(selectedDate)
    if (minDateParsed && minDateParsed > todayLocal) return startOfMonth(minDateParsed)
    return startOfMonth(todayLocal)
  })

  // Follow externally-set `value` to its month (no jump on clear).
  useEffect(() => {
    if (selectedDate) setViewMonth(startOfMonth(selectedDate))
  }, [selectedDate])

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // 6×7 grid for the visible month, Monday-first.
  const cells = useMemo(() => {
    const firstOfMonth = startOfMonth(viewMonth)
    const jsDow = firstOfMonth.getDay() // 0=Sun … 6=Sat
    const mondayOffset = (jsDow + 6) % 7
    const gridStart = new Date(firstOfMonth)
    gridStart.setDate(firstOfMonth.getDate() - mondayOffset)

    const selectedTime = selectedDate ? selectedDate.getTime() : null
    const todayTime = todayLocal.getTime()
    const minTime = minDateParsed ? minDateParsed.getTime() : null

    const out: Array<{
      date: Date
      iso: string
      inMonth: boolean
      isPast: boolean
      isToday: boolean
      isSelected: boolean
    }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      const t = d.getTime()
      out.push({
        date: d,
        iso: toLocalDateString(d),
        inMonth: d.getMonth() === viewMonth.getMonth(),
        isPast: minTime !== null && t < minTime,
        isToday: t === todayTime,
        isSelected: selectedTime !== null && t === selectedTime,
      })
    }
    return out
  }, [viewMonth, selectedDate, minDateParsed, todayLocal])

  const monthLabel = viewMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const displayText = selectedDate ? formatDisplay(selectedDate) : placeholder

  function prevMonth() {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  }
  function nextMonth() {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  }

  function selectDay(cell: (typeof cells)[number]) {
    if (cell.isPast || !cell.inMonth) return
    onChange(cell.iso)
    setOpen(false)
  }

  const baseCell =
    'w-[34px] h-[34px] mx-auto flex items-center justify-center text-[13px] rounded-full relative transition-colors'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`w-full h-11 px-3.5 rounded-[10px] border text-left flex items-center gap-2.5 transition-all ${
          open
            ? 'bg-white border-brand-600 shadow-[0_0_0_3px_rgba(0,119,204,0.18)]'
            : 'bg-neutral-50 border-neutral-100 hover:border-neutral-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <CalendarDays
          size={16}
          className={open ? 'text-brand-600' : 'text-neutral-400'}
        />
        <span
          className={`flex-1 truncate text-[15px] font-medium ${
            selectedDate ? 'text-neutral-900' : 'text-neutral-400'
          }`}
        >
          {displayText}
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${
            open ? 'rotate-180 text-brand-600' : 'text-neutral-400'
          }`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute z-50 mt-2 left-0 w-[280px] p-4 rounded-[12px] bg-white border border-neutral-100 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)]"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="w-7 h-7 rounded-lg bg-neutral-50 hover:bg-brand-50 hover:text-brand-600 text-neutral-600 flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[14px] font-bold tracking-tight text-neutral-900">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="w-7 h-7 rounded-lg bg-neutral-50 hover:bg-brand-50 hover:text-brand-600 text-neutral-600 flex items-center justify-center transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Weekday headers (Monday-first, UK) */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                className="text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400 py-1.5"
              >
                {w}
              </span>
            ))}
          </div>

          {/* Day grid (6×7) */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => {
              if (!cell.inMonth) {
                return (
                  <span key={i} className={`${baseCell} text-neutral-200`}>
                    {cell.date.getDate()}
                  </span>
                )
              }
              if (cell.isPast) {
                return (
                  <span
                    key={i}
                    className={`${baseCell} text-neutral-300 cursor-not-allowed`}
                  >
                    {cell.date.getDate()}
                  </span>
                )
              }
              if (cell.isSelected) {
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectDay(cell)}
                    className={`${baseCell} bg-brand-600 text-white font-bold cursor-pointer`}
                  >
                    {cell.date.getDate()}
                  </button>
                )
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDay(cell)}
                  className={`${baseCell} text-neutral-900 hover:bg-neutral-50 cursor-pointer ${
                    cell.isToday ? 'font-bold' : ''
                  }`}
                >
                  {cell.date.getDate()}
                  {cell.isToday && (
                    <span
                      aria-hidden="true"
                      className="absolute left-1/2 -translate-x-1/2 bottom-1 w-[3px] h-[3px] rounded-full bg-brand-600"
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
