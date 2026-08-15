'use client'

// P-00c-D1: State 2 — block_upfront enrolment for the public programme detail
// page. No session picker: the full schedule is shown (numbered, collapsible)
// purely for reassurance, with a single enrol CTA. Data is fetched server-side
// and passed in; this component owns only the collapse toggle.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { ScheduleRow } from './_data/programmeDetail'
import { displayParentTotalPence } from '@/lib/booking/commission-display'

const COLLAPSED_COUNT = 4

/** 2-dp format for the total — commission on top introduces pence (e.g. £246.40). */
function formatTotal(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100)
}

interface ProgrammeScheduleProps {
  coachId: string
  programmeId: string
  schedule: ScheduleRow[]
  sessionCount: number
  blockTotalPence: number | null
  spanLabel: string | null
  scheduleLabel: string
  /** BUG-70: real platform rate from platform_config, fetched server-side. */
  commissionRate: number
}

export function ProgrammeSchedule({
  coachId,
  programmeId,
  schedule,
  sessionCount,
  blockTotalPence,
  spanLabel,
  scheduleLabel,
  commissionRate,
}: ProgrammeScheduleProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)

  const collapsible = schedule.length > COLLAPSED_COUNT
  const visible = collapsible && !expanded ? schedule.slice(0, COLLAPSED_COUNT) : schedule

  // Parent total = coach block price + commission ON TOP (BR-01, display only).
  const parentTotalPence =
    blockTotalPence !== null ? displayParentTotalPence(blockTotalPence, commissionRate) : null

  function handleEnrol(): void {
    router.push(`/book/${coachId}/programmes/${programmeId}?block=true`)
  }

  return (
    <>
      <section aria-labelledby="schedule-heading" data-testid="programme-schedule" className="pb-28 lg:pb-0">
        <div className="flex items-baseline justify-between mb-1 px-0.5">
          <h2 id="schedule-heading" className="text-lg font-semibold text-gray-900 tracking-tight">
            Full programme
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 h-[22px] px-2.5 rounded-full">
            Enrol once
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-4 px-0.5">
          {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          {scheduleLabel !== 'Schedule TBC' ? ` · ${scheduleLabel.replace(/ · .*/, '')}` : ''}
          {spanLabel ? ` · ${spanLabel}` : ''}
        </p>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {visible.map((row) => (
            <div
              key={row.number}
              className="flex items-center gap-3 px-3.5 py-2.5 border-b border-gray-200 last:border-b-0"
              data-testid="schedule-row"
            >
              <span className="w-[22px] h-[22px] rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                {row.number}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-900">{row.dateLabel}</span>
              <span className="text-sm text-gray-500">{row.timeShort}</span>
            </div>
          ))}
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              data-testid="toggle-schedule"
              className="w-full h-12 bg-white text-brand-600 text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors border-t border-gray-200"
            >
              {expanded ? 'Show fewer' : `Show all ${schedule.length} sessions`}
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </section>

      {/* ── Single enrol CTA — fixed bottom bar on mobile, card on desktop ── */}
      {/* Mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-5 pt-3.5 pb-3 shadow-[0_-6px_20px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''} · whole programme
          </span>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</div>
            <div className="text-xl font-bold text-gray-900 tracking-tight tabular-nums leading-tight">
              {parentTotalPence !== null ? formatTotal(parentTotalPence) : '—'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleEnrol}
          disabled={parentTotalPence === null}
          data-testid="enrol-cta"
          className="w-full h-[52px] rounded-[10px] bg-brand-600 text-white text-base font-semibold transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:bg-gray-200 disabled:text-gray-500 disabled:active:scale-100"
        >
          {parentTotalPence !== null ? `Enrol for full programme — ${formatTotal(parentTotalPence)}` : 'Enrol for full programme'}
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden lg:flex items-center gap-5 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] px-5 py-[18px]">
        <div>
          <div className="text-base font-semibold text-gray-900">
            Whole programme · {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          </div>
          <div className="text-sm text-gray-500 mt-0.5">One payment secures every session.</div>
        </div>
        <div className="flex items-baseline gap-2 ml-auto">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total</span>
          <span className="text-2xl font-bold text-gray-900 tracking-tight tabular-nums">
            {parentTotalPence !== null ? formatTotal(parentTotalPence) : '—'}
          </span>
        </div>
        <button
          type="button"
          onClick={handleEnrol}
          disabled={parentTotalPence === null}
          data-testid="enrol-cta-desktop"
          className="h-[54px] px-7 rounded-[10px] bg-brand-600 text-white text-base font-semibold whitespace-nowrap transition-colors hover:bg-brand-700 active:scale-[0.99] disabled:bg-gray-200 disabled:text-gray-500 disabled:active:scale-100"
        >
          {parentTotalPence !== null ? `Enrol for full programme — ${formatTotal(parentTotalPence)}` : 'Enrol for full programme'}
        </button>
      </div>
    </>
  )
}
