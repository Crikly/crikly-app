// P-10: pure pricing + player-count helpers for the authed parent booking
// flow. Framework-free so the maths is unit-testable in isolation (same
// convention as lib/availability/slots.ts).
//
// Pricing rules (BR-01, CF-PRICE-01):
//   - 1 player  → the slot's per-block price override, falling back to the
//     sport's price_individual_pence (mirrors the guest flow — BUG-08).
//   - 2+ players → group_price_tiers[String(players)], the TOTAL session
//     price in pence (not per head). Overrides never apply to group tiers.
// Commission is added ON TOP for display via displayParentTotalPence
// (commission-display.ts) — never here, never hardcoded (BUG-70).

import { isGroupEnabled, type GroupPriceTiers } from '@/lib/coach/group-pricing'

/** Advisory slot-hold length. UNUSED since the Step D route deletion (the
 * countdown UX was dropped — approved decision 2); retained with its two
 * helpers below for P-13, which may reinstate an advisory countdown at
 * checkout. Delete all three if P-13 ships without one. */
export const HOLD_DURATION_SECONDS = 600

/**
 * The player counts a parent can pick for this coach sport: always [1], plus
 * every group tier size when group sessions are enabled. Tier keys are
 * validated at write time to be "2".."6" and <= max_group_size
 * (group-pricing.ts), but maxGroupSize is re-applied here as a safety net.
 * A single-element result means the "How many players?" selector is hidden.
 */
export function playerCountOptions(
  sessionTypes: string[],
  maxGroupSize: number | null,
  tiers: GroupPriceTiers | null,
): number[] {
  const options = [1]
  if (!isGroupEnabled(sessionTypes) || tiers === null) return options
  const sizes = Object.keys(tiers)
    .map((key) => Number.parseInt(key, 10))
    .filter(
      (size) =>
        Number.isInteger(size) &&
        size >= 2 &&
        (maxGroupSize === null || size <= maxGroupSize),
    )
    .sort((a, b) => a - b)
  return [...options, ...sizes]
}

/**
 * The coach's price in pence for the current selection, or null when the
 * selection is unpriceable (no individual price set, or no tier for that
 * group size) — the caller must disable the CTA rather than show £0.
 */
export function coachPricePence(
  players: number,
  slotOverridePence: number | null,
  individualPence: number | null,
  tiers: GroupPriceTiers | null,
): number | null {
  if (players <= 1) return slotOverridePence ?? individualPence
  return tiers?.[String(players)] ?? null
}

/** Whole seconds left on an advisory hold started at `holdStartedAt` (epoch
 * ms), clamped to [0, HOLD_DURATION_SECONDS]. */
export function holdSecondsRemaining(holdStartedAt: number, now: number): number {
  const elapsed = Math.floor((now - holdStartedAt) / 1000)
  if (elapsed <= 0) return HOLD_DURATION_SECONDS
  return Math.max(0, HOLD_DURATION_SECONDS - elapsed)
}

/** 587 → "9:47" — the m:ss countdown label. */
export function formatHoldClock(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = String(seconds % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

/** Display-only pence → pounds: whole pounds drop the ".00" (6000 → "£60",
 * 4550 → "£45.50") — matches the parent dashboard's poundsLabel. No live
 * consumer since Step D; retained for P-13's checkout display. Never store
 * the result back (BR-10). */
export function formatPricePence(pence: number): string {
  const pounds = pence / 100
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`
}
