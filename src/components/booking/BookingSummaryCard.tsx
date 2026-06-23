import type { ReactNode } from 'react'
import { Calendar, Clock, User, Check } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

export interface BookingSummary {
  coachName: string
  sportLabel: string
  sessionDate: string
  sessionTime: string
  sessionType: string
  /** Coach's fee in pence (BR-10). */
  sessionFeePence: number
  /** Platform commission in pence, added on top of coach fee (BR-01). */
  platformFeePence: number
}

interface BookingSummaryCardProps {
  summary: BookingSummary
  variant: 'checkout' | 'paid'
  /** Desktop only: Pay button and stripe note fused inside the card below Total. */
  footer?: ReactNode
}

/** Format integer pence as GBP — e.g. 4400 → "£44.00". */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pence / 100)
}

export function BookingSummaryCard({ summary, variant, footer }: BookingSummaryCardProps) {
  const totalPence = summary.sessionFeePence + summary.platformFeePence
  const feePercent =
    summary.sessionFeePence > 0
      ? Math.round((summary.platformFeePence / summary.sessionFeePence) * 100)
      : 0
  const isCheckout = variant === 'checkout'

  return (
    <div
      className={
        isCheckout
          ? 'rounded-[12px] border border-neutral-100 bg-white p-4 lg:rounded-[14px] lg:border-none lg:p-[22px] lg:shadow-md'
          : 'rounded-[12px] border border-neutral-100 bg-white p-4'
      }
    >
      {/* Coach header */}
      <div className="flex items-center gap-3">
        {/* 52px per guest checkout design spec — larger than avatar-md token (44px) */}
        <Avatar
          name={summary.coachName}
          size="md"
          className="!h-[52px] !w-[52px] !text-[18px]"
        />
        <div className="min-w-0">
          <p className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">
            {summary.coachName}
          </p>
          <span className="mt-1.5 inline-flex h-6 items-center rounded-full bg-brand-50 px-2.5 text-xs font-semibold text-brand-800">
            {summary.sportLabel}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className={`h-px bg-neutral-100 ${isCheckout ? 'my-4 lg:my-[18px]' : 'my-4'}`} />

      {/* Session details */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <Calendar size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-[14.5px] text-[#1E293B]">{summary.sessionDate}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Clock size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-[14.5px] text-[#1E293B]">{summary.sessionTime}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <User size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
          <span className="text-[14.5px] text-[#1E293B]">{summary.sessionType}</span>
        </div>
      </div>

      {/* Divider */}
      <div className={`h-px bg-neutral-100 ${isCheckout ? 'my-4 lg:my-[18px]' : 'my-4'}`} />

      {isCheckout ? (
        <>
          {/* Fee breakdown */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-neutral-600">Session fee</span>
              <span className="tabular-nums text-[14px] text-neutral-900">
                {formatPence(summary.sessionFeePence)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-neutral-600">
                Platform fee ({feePercent}%)
              </span>
              <span className="tabular-nums text-[14px] text-neutral-900">
                {formatPence(summary.platformFeePence)}
              </span>
            </div>
          </div>

          {/* Sub-divider */}
          <div className="my-[14px] h-px bg-neutral-100" />

          {/* Total */}
          <div className="flex items-baseline justify-between">
            <span className="text-[15px] font-semibold text-neutral-900">Total</span>
            <span className="tabular-nums text-xl font-bold tracking-[-0.01em] text-neutral-900 lg:text-[22px]">
              {formatPence(totalPence)}
            </span>
          </div>

          {footer}
        </>
      ) : (
        /* Paid variant — shows check badge + total */
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#15803D]">
            <Check size={15} strokeWidth={2.2} aria-hidden="true" />
            Paid
          </span>
          <span className="tabular-nums text-[16px] font-bold text-neutral-900">
            {formatPence(totalPence)}
          </span>
        </div>
      )}
    </div>
  )
}
