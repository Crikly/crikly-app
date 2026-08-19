'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ParentBookingItem } from './types'

// P-14 Phase 3 — inline cancellation expansion (approved design; no page,
// no window.confirm — ever). Renders inside the mobile card and the desktop
// detail panel. The refund preview is computed live from the booking's own
// window snapshot; the API re-derives it authoritatively (Phase 2), so this
// copy is a preview, never the source of truth.

/** Reason keys accepted by POST /api/parent/bookings/[id]/cancel. */
const REASON_OPTIONS = [
  { value: 'plans', label: 'Change of plans' },
  { value: 'unwell', label: 'Child is unwell' },
  { value: 'conflict', label: 'Scheduling conflict' },
  { value: 'coach', label: 'Coach not responding' },
  { value: 'other', label: 'Other' },
] as const

export interface CancelResult {
  refunded: boolean
}

interface CancelPanelProps {
  booking: ParentBookingItem
  onKeep: () => void
  onCancelled: (result: CancelResult) => void
}

/** Live window check — same boundary as the API (BR-04/BR-05). */
export function isRefundEligible(booking: ParentBookingItem, nowMs: number): boolean {
  return nowMs <= booking.sessionStartMs - booking.cancellationWindowHours * 3_600_000
}

export function CancelPanel({ booking, onKeep, onCancelled }: CancelPanelProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refundEligible = isRefundEligible(booking, Date.now())

  const heading = refundEligible
    ? `You’ll receive a full refund of ${booking.paidLabel}`
    : 'Outside your coach’s cancellation window — no refund'
  const subCopy = refundEligible
    ? 'The refund goes back to your original payment method.'
    : `Your coach requires ${booking.cancellationWindowHours} hours’ notice for refunds.`
  const confirmLabel = refundEligible ? 'Cancel and refund' : 'Cancel session'

  const handleConfirm = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/parent/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      })
      if (res.ok) {
        const json = (await res.json()) as { refunded?: boolean }
        onCancelled({ refunded: Boolean(json.refunded) })
        return
      }
      let code = ''
      try {
        code = ((await res.json()) as { error?: string }).error ?? ''
      } catch {
        // Non-JSON error body — fall through to the generic message.
      }
      if (code === 'already_cancelled') {
        // Another tab/request already cancelled it — converge, don't error.
        onCancelled({ refunded: false })
        return
      }
      setError(
        code === 'refund_failed'
          ? 'The refund couldn’t be processed, so nothing was cancelled. Please try again, or contact hello@crikly.app.'
          : 'We couldn’t cancel this booking just now. Please try again.',
      )
    } catch {
      setError('We couldn’t cancel this booking just now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      data-testid="cancel-panel"
      className="bg-slate-50 rounded-md p-4 motion-safe:animate-[bookingCancelIn_200ms_ease-out]"
    >
      <div className="text-[15px] font-medium text-neutral-900">{heading}</div>
      <div className="text-sm text-slate-500 mt-1">{subCopy}</div>

      <div className="mt-3.5">
        <label
          htmlFor={`cancel-reason-${booking.id}`}
          className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5"
        >
          Reason
        </label>
        <select
          id={`cancel-reason-${booking.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full h-11 rounded-md border border-neutral-100 bg-white px-3 text-sm text-neutral-900 cursor-pointer focus:outline-none focus:border-brand-600"
        >
          <option value="">Select a reason</option>
          {REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 mt-3.5">
        <Button
          type="button"
          variant="secondary"
          onClick={onKeep}
          disabled={submitting}
          className="flex-1"
        >
          Keep booking
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleConfirm}
          loading={submitting}
          data-testid="confirm-cancel-button"
          className="flex-1"
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
