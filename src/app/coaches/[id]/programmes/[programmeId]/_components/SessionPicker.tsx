'use client'

// P-00c-D1: State 1 — per_session picker for the public programme detail page.
// Parent selects individual sessions; a running count + total drive a sticky
// CTA (fixed bottom bar on mobile, sticky card on desktop — same responsive
// split the live coach profile uses). Data is fetched server-side and passed
// in; this component owns only the selection state and the collapse toggle.

import { useMemo, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { SessionView, CampDay } from './_data/programmeDetail'

const COLLAPSED_COUNT = 4

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

interface SessionPickerProps {
  pricePerSessionPence: number | null
  campMode: boolean
  sessions: SessionView[]
  campDays: CampDay[]
}

// ─── Single selectable session row ─────────────────────────────────────────────

function SessionRow({
  session,
  selected,
  onToggle,
}: {
  session: SessionView
  selected: boolean
  onToggle: (key: string) => void
}) {
  if (!session.selectable) {
    return (
      <div
        className="flex items-center gap-3 px-3.5 py-3 border border-gray-200 rounded-[10px] bg-gray-50"
        data-testid="session-row-closed"
      >
        <span className="w-5 h-5 rounded-md border-[1.6px] border-gray-300 bg-white flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-gray-400">
            {session.slotName ?? session.dateLabel}
          </div>
          <div className="text-sm text-gray-400 mt-px">{session.timeLabel}</div>
        </div>
        <span className="text-base font-bold text-gray-400 tabular-nums line-through">
          {formatPence(session.pricePence)}
        </span>
        <span className="h-9 px-4 rounded-lg bg-gray-100 text-gray-500 text-sm font-semibold inline-flex items-center">
          {session.closedLabel}
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onToggle(session.key)}
      aria-pressed={selected}
      data-testid="session-row"
      className={[
        'flex items-center gap-3 px-3.5 py-3 rounded-[10px] text-left transition-colors w-full',
        selected
          ? 'border-[1.5px] border-brand-600 bg-brand-50'
          : 'border border-gray-200 bg-white hover:border-gray-300',
      ].join(' ')}
    >
      <span
        className={[
          'w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center',
          selected ? 'bg-brand-600' : 'border-[1.6px] border-gray-300',
        ].join(' ')}
      >
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-base font-semibold ${selected ? 'text-brand-800' : 'text-gray-900'}`}>
          {session.slotName ?? session.dateLabel}
        </div>
        <div className={`text-sm mt-px ${selected ? 'text-brand-600' : 'text-gray-500'}`}>
          {session.timeLabel}
        </div>
      </div>
      <span className={`text-base font-bold tabular-nums ${selected ? 'text-brand-800' : 'text-gray-900'}`}>
        {formatPence(session.pricePence)}
      </span>
      <span
        className={[
          'h-9 px-3.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 flex-shrink-0',
          selected
            ? 'bg-brand-600 text-white'
            : 'border-[1.5px] border-brand-600 text-brand-600',
        ].join(' ')}
      >
        {selected && <Check className="w-3.5 h-3.5" strokeWidth={2.6} />}
        {selected ? 'Selected' : 'Select'}
      </span>
    </button>
  )
}

// ─── Picker ────────────────────────────────────────────────────────────────────

export function SessionPicker({ pricePerSessionPence, campMode, sessions, campDays }: SessionPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState(false)

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Per-session price is uniform across sessions (one price_per_session_pence on
  // the programme), so the running total is count × price.
  const count = selected.size
  const total = count * (pricePerSessionPence ?? 0)

  const collapsible = !campMode && sessions.length > COLLAPSED_COUNT
  const visibleSessions = collapsible && !expanded ? sessions.slice(0, COLLAPSED_COUNT) : sessions

  const ctaLabel = useMemo(() => {
    if (count === 0) return 'Select sessions to continue'
    return `Pay for ${count} session${count !== 1 ? 's' : ''} — ${formatPence(total)}`
  }, [count, total])

  // TODO(P-00c-ENROL): wire to programme enrolment checkout. Block 0 ships the
  // picker UI only — the CTA is inert (no /book/[coachId] link; that route is
  // for 1-to-1 sessions and uses a different API).
  const disabled = count === 0

  return (
    <>
      <section aria-labelledby="picker-heading" data-testid="session-picker" className="pb-28 lg:pb-0">
        <div className="flex items-baseline justify-between mb-1 px-0.5">
          <h2 id="picker-heading" className="text-lg font-semibold text-gray-900 tracking-tight">
            Select your sessions
          </h2>
          {pricePerSessionPence !== null && (
            <span className="text-sm text-gray-500">{formatPence(pricePerSessionPence)} per session</span>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4 px-0.5">Pick the dates that suit you and pay only for those.</p>

        {campMode ? (
          <div className="flex flex-col gap-4">
            {campDays.map((day) => (
              <div key={day.dateISO}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-xs font-semibold tracking-wider uppercase text-gray-500">
                    {day.dateLabel}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="flex flex-col gap-2.5">
                  {day.slots.map((s) => (
                    <SessionRow key={s.key} session={s} selected={selected.has(s.key)} onToggle={toggle} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visibleSessions.map((s) => (
              <SessionRow key={s.key} session={s} selected={selected.has(s.key)} onToggle={toggle} />
            ))}
          </div>
        )}

        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            data-testid="toggle-sessions"
            className="w-full h-11 mt-3.5 bg-white border border-gray-200 rounded-[10px] text-gray-700 text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            {expanded ? 'Show fewer' : `Show all ${sessions.length} sessions`}
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </section>

      {/* ── Sticky CTA — fixed bottom bar on mobile, sticky card on desktop ── */}
      {/* Mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-5 pt-3.5 pb-3 shadow-[0_-6px_20px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-brand-600 text-white text-sm font-bold tabular-nums">
              {count}
            </span>
            <span className="text-sm text-gray-600">session{count !== 1 ? 's' : ''} selected</span>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</div>
            <div className="text-xl font-bold text-gray-900 tracking-tight tabular-nums leading-tight">
              {formatPence(total)}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          data-testid="pay-cta"
          className="w-full h-[52px] rounded-[10px] bg-brand-600 text-white text-base font-semibold transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:bg-gray-200 disabled:text-gray-500 disabled:active:scale-100"
        >
          {ctaLabel}
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block sticky bottom-0 -mx-6 mt-1.5 px-6 pt-4 pb-7 bg-gradient-to-t from-white via-white to-transparent">
        <div className="flex items-center gap-5 bg-white border border-gray-200 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center min-w-[26px] h-[26px] px-2 rounded-full bg-brand-600 text-white text-sm font-bold tabular-nums">
              {count}
            </span>
            <span className="text-base text-gray-600">session{count !== 1 ? 's' : ''} selected</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</span>
            <span className="text-2xl font-bold text-gray-900 tracking-tight tabular-nums">{formatPence(total)}</span>
          </div>
          <button
            type="button"
            disabled={disabled}
            data-testid="pay-cta-desktop"
            className="ml-auto h-[54px] px-7 rounded-[10px] bg-brand-600 text-white text-base font-semibold whitespace-nowrap transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:bg-gray-200 disabled:text-gray-500 disabled:active:scale-100"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </>
  )
}
