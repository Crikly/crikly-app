// Fix-NAV-01: single source of truth for the coach profile-completeness score.
//
// The completeness % is a 6-check rollup (3 client-side signals + 3 from
// /api/coaches/profile-completeness). It was previously computed inline only in
// CoachRightPanel; extracting it here lets ProfileDropdown show the SAME number
// without the two drifting apart (the inconsistency BUG-QA-03/04 fixed).
//
// Callers resolve the 6 booleans from their own data sources (cached profile,
// Stripe status cache, completeness endpoint) and pass them in. This module
// owns only the arithmetic, so the denominator (6) and rounding stay identical
// everywhere.

export interface CompletenessChecks {
  // Basic profile: full_name + bio + location set.
  basicProfile: boolean
  // Booking policy: cancellation_window_hours > 0.
  bookingPolicy: boolean
  // Stripe: charges AND payouts enabled.
  stripe: boolean
  // coach_sports count > 0.
  sports: boolean
  // coach_qualifications count > 0.
  qualifications: boolean
  // availability_templates count > 0.
  availability: boolean
}

export interface CompletenessScore {
  completed: number
  total: number
  pct: number
}

const TOTAL_CHECKS = 6

export function scoreCompleteness(checks: CompletenessChecks): CompletenessScore {
  const completed = [
    checks.basicProfile,
    checks.bookingPolicy,
    checks.stripe,
    checks.sports,
    checks.qualifications,
    checks.availability,
  ].filter(Boolean).length

  return {
    completed,
    total: TOTAL_CHECKS,
    pct: Math.round((completed / TOTAL_CHECKS) * 100),
  }
}
