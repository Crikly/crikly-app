import { Calendar, Clock, User, Check } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

/**
 * Shape of the booking summary shown on the guest checkout + confirmation
 * screens. All money is stored as integer pence (never decimals) per BR-10.
 * In P-00c-API this is populated from the real coach profile and the slot the
 * guest selected on the availability page.
 */
export interface BookingSummary {
  coachName: string
  /** Display label only, e.g. "Cricket" — rendered as a text-only teal pill. */
  sportLabel: string
  /** Pre-formatted session date, e.g. "Saturday, 27 June". */
  sessionDate: string
  /** Pre-formatted time + duration, e.g. "10:00am · 60 minutes". */
  sessionTime: string
  /** Session type label, e.g. "1-to-1 technical session". */
  sessionType: string
  /** Coach's fee in pence (the amount the coach receives — BR-01). */
  sessionFeePence: number
  /** Platform commission in pence, added on top of the coach fee (BR-01). */
  platformFeePence: number
}

interface BookingSummaryCardProps {
  summary: BookingSummary
  /** `checkout` shows the fee breakdown; `paid` shows the settled total. */
  variant: 'checkout' | 'paid'
}

/** Format integer pence as GBP, e.g. 4000 → "£40.00". */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100)
}

function Divider() {
  return <div className="my-4 h-px bg-neutral-100" />
}

export function BookingSummaryCard({ summary, variant }: BookingSummaryCardProps) {
  const totalPence = summary.sessionFeePence + summary.platformFeePence
  // Derive the displayed rate from the fee values so the label stays correct
  // when P-00c-API supplies a non-default commission rate (BR-02).
  const feePercent =
    summary.sessionFeePence > 0
      ? Math.round((summary.platformFeePence / summary.sessionFeePence) * 100)
      : 0

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      {/* Coach header */}
      <div className="flex items-center gap-3">
        <Avatar name={summary.coachName} size="md" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-neutral-900">
            {summary.coachName}
          </p>
          <span className="mt-1.5 inline-flex h-6 items-center rounded-full bg-teal-50 px-2.5 text-sm font-medium text-teal-800">
            {summary.sportLabel}
          </span>
        </div>
      </div>

      <Divider />

      {/* Session details */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Calendar size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-sm text-neutral-900">{summary.sessionDate}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Clock size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-sm text-neutral-900">{summary.sessionTime}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <User size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-sm text-neutral-900">{summary.sessionType}</span>
        </div>
      </div>

      <Divider />

      {variant === 'checkout' ? (
        <>
          <div className="flex flex-col gap-2.5">
            <div className="flex justify-between">
              <span className="text-sm text-neutral-600">Session fee</span>
              <span className="text-sm tabular-nums text-neutral-900">
                {formatPence(summary.sessionFeePence)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-600">Platform fee ({feePercent}%)</span>
              <span className="text-sm tabular-nums text-neutral-900">
                {formatPence(summary.platformFeePence)}
              </span>
            </div>
          </div>

          <Divider />

          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold text-neutral-900">Total</span>
            <span className="text-xl font-semibold tabular-nums text-neutral-900">
              {formatPence(totalPence)}
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-label text-success">
            <Check size={15} strokeWidth={2.2} aria-hidden="true" />
            Paid
          </span>
          <span className="text-lg font-semibold tabular-nums text-neutral-900">
            {formatPence(totalPence)}
          </span>
        </div>
      )}
    </div>
  )
}
