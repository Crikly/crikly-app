'use client'

// C-PAY-04 — live estimated-payout line rendered under every coach price
// input. Display only: the figure comes from estimatePayoutPence (integer
// pence; ÷100 only here at render) and the remark is mandatory alongside it.
// Renders nothing when no valid estimate exists (empty/zero/too-low price),
// so callers can mount it unconditionally under a controlled input.

import React from 'react'
import { estimatePayoutPence, PAYOUT_ESTIMATE_REMARK } from '@/lib/payout-estimate'

interface PayoutEstimateProps {
  /** Price in integer pence, or null when the input is empty/unparsed. */
  pricePence: number | null
  className?: string
}

export function PayoutEstimate({ pricePence, className }: PayoutEstimateProps) {
  const estimate = pricePence === null ? null : estimatePayoutPence(pricePence)
  if (estimate === null) return null

  return (
    <div className={className ?? 'mt-1.5'} data-testid="payout-estimate">
      <p className="text-[12px] text-gray-500">
        You&apos;d receive approx{' '}
        <span className="font-medium text-gray-900">£{(estimate / 100).toFixed(2)}</span>
      </p>
      <p className="text-[11px] text-gray-400 mt-0.5">{PAYOUT_ESTIMATE_REMARK}</p>
    </div>
  )
}
