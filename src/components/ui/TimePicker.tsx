'use client'

// UI-DATE-PICKER: HH:MM picker with HR/MIN columns. Off-step values
// (e.g. '09:07' with default 15-min step) are injected into the MIN
// column so the existing value still shows selected without being
// silently mutated.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Clock } from 'lucide-react'

export interface TimePickerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minuteStep?: number
  disabled?: boolean
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function parseTime(s: string): { hour: number; minute: number } | null {
  if (!s) return null
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s)
  if (!m) return null
  const hour = Number(m[1])
  const minute = Number(m[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function formatTime(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'Select time',
  minuteStep = 15,
  disabled = false,
}: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hourColRef = useRef<HTMLDivElement>(null)
  const minuteColRef = useRef<HTMLDivElement>(null)

  const parsed = useMemo(() => parseTime(value), [value])

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), [])

  // Build the canonical step list, then inject the current minute if
  // it doesn't land on a step so the user's exact value stays selected.
  const minutes = useMemo(() => {
    const step = Math.max(1, Math.min(30, Math.floor(minuteStep)))
    const base: number[] = []
    for (let m = 0; m < 60; m += step) base.push(m)
    if (parsed && !base.includes(parsed.minute)) {
      base.push(parsed.minute)
      base.sort((a, b) => a - b)
    }
    return base
  }, [minuteStep, parsed])

  // Click-outside closes the dropdown.
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

  // Scroll the selected hour and minute rows into the centre of their columns
  // on open. requestAnimationFrame defers until after the popover paints.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      hourColRef.current
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: 'center' })
      minuteColRef.current
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  function selectHour(h: number) {
    const m = parsed?.minute ?? 0
    onChange(formatTime(h, m))
  }
  function selectMinute(m: number) {
    const h = parsed?.hour ?? 0
    onChange(formatTime(h, m))
  }

  const displayText = parsed ? formatTime(parsed.hour, parsed.minute) : placeholder

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full h-11 px-3.5 rounded-[10px] border text-left flex items-center gap-2.5 transition-all ${
          open
            ? 'bg-white border-brand-600 shadow-[0_0_0_3px_rgba(0,119,204,0.18)]'
            : 'bg-neutral-50 border-neutral-100 hover:border-neutral-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Clock size={16} className={open ? 'text-brand-600' : 'text-neutral-400'} />
        <span
          className={`flex-1 truncate text-[15px] font-medium tabular-nums ${
            parsed ? 'text-neutral-900' : 'text-neutral-400'
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
          aria-label="Choose time"
          className="absolute z-50 mt-2 left-0 w-[160px] rounded-[12px] bg-white border border-neutral-100 overflow-hidden shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)]"
        >
          <div className="grid grid-cols-[1fr_1px_1fr] h-[200px]">
            {/* Hour column */}
            <div ref={hourColRef} className="flex flex-col overflow-y-auto">
              <div className="sticky top-0 bg-white text-[10px] font-semibold uppercase tracking-wider text-neutral-400 text-center py-2 border-b border-neutral-100">
                Hr
              </div>
              {hours.map((h) => {
                const isSel = parsed?.hour === h
                return (
                  <button
                    key={h}
                    type="button"
                    data-selected={isSel ? 'true' : 'false'}
                    onClick={() => selectHour(h)}
                    className={`h-10 mx-1.5 my-0.5 rounded-lg flex-shrink-0 flex items-center justify-center text-[15px] tabular-nums transition-colors ${
                      isSel
                        ? 'bg-brand-600 text-white font-bold'
                        : 'text-neutral-900 hover:bg-neutral-50'
                    }`}
                  >
                    {pad2(h)}
                  </button>
                )
              })}
            </div>

            <div aria-hidden="true" className="bg-neutral-100" />

            {/* Minute column */}
            <div ref={minuteColRef} className="flex flex-col overflow-y-auto">
              <div className="sticky top-0 bg-white text-[10px] font-semibold uppercase tracking-wider text-neutral-400 text-center py-2 border-b border-neutral-100">
                Min
              </div>
              {minutes.map((m) => {
                const isSel = parsed?.minute === m
                return (
                  <button
                    key={m}
                    type="button"
                    data-selected={isSel ? 'true' : 'false'}
                    onClick={() => selectMinute(m)}
                    className={`h-10 mx-1.5 my-0.5 rounded-lg flex-shrink-0 flex items-center justify-center text-[15px] tabular-nums transition-colors ${
                      isSel
                        ? 'bg-brand-600 text-white font-bold'
                        : 'text-neutral-900 hover:bg-neutral-50'
                    }`}
                  >
                    {pad2(m)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
