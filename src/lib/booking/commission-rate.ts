// BUG-70 — server-side commission rate for checkout DISPLAY.
//
// Reads default_commission_rate (BR-02) from platform_config so the fee shown
// to a parent matches the amount the booking routes actually charge. Server
// components only — never import from a 'use client' module (the admin client
// must not reach the browser bundle).
//
// RLS bypass justification (docs/06_SECURITY_COMPLIANCE.md): platform_config's
// only SELECT policy is authenticated-users (migration 003), but the checkout
// pages are guest-facing, so the anon SSR client would read zero rows. We use
// the service-role client for a read of this single non-sensitive column —
// nothing else is selected and nothing is written. The guest booking routes
// read the same value the same way (see POST /api/guest/bookings).

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

// Display fallback if the config read fails — BR-02's default. The charge is
// unaffected: the booking routes do their own read and 500 before charging if
// it fails. This is NOT a display constant; real renders use the DB value.
const FALLBACK_COMMISSION_RATE = 0.1

/**
 * Platform commission rate (e.g. 0.1 for 10%) from platform_config.
 * Wrapped in React cache() — deduped per request, never cached across requests.
 */
export const getCommissionRate = cache(async (): Promise<number> => {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('platform_config')
    .select('default_commission_rate')
    .single()

  if (error || !data) {
    console.error('[getCommissionRate] platform_config lookup failed:', error)
    return FALLBACK_COMMISSION_RATE
  }

  const rate = Number(data.default_commission_rate)
  if (!Number.isFinite(rate) || rate < 0) {
    console.error('[getCommissionRate] invalid commission rate:', data.default_commission_rate)
    return FALLBACK_COMMISSION_RATE
  }

  return rate
})
