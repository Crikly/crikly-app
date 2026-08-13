// CF-PRICE-01: shared validation for coach group session pricing.
//
// Group pricing lives on coach_sports as three coupled fields:
//   - session_types containing 'group'  → group sessions enabled
//   - max_group_size (2–6)              → the coach's group-size cap
//   - group_price_tiers jsonb           → {"2": 4500, "3": 5500} — group size
//     to TOTAL session price in integer pence (NOT per head). Sizes absent
//     from the map are unavailable to parents.
//
// The DB guards only jsonb_typeof = 'object' (migration 053); every deeper
// rule lives here so POST /api/coaches/sports and PATCH
// /api/coaches/sports/[sportId] cannot drift apart (the AF-H-56 lesson).

import type { Json } from '@/types/database'

export const GROUP_SIZE_MIN = 2
export const GROUP_SIZE_MAX = 6
export const GROUP_TIER_MIN_PENCE = 100

/** Group size ("2".."6") → total session price in integer pence. */
export type GroupPriceTiers = Record<string, number>

const TIER_KEY_RE = /^[2-6]$/

export function isGroupEnabled(sessionTypes: string[]): boolean {
  return sessionTypes.includes('group')
}

/**
 * Shape-check the raw group_price_tiers body field.
 * null is valid (it clears the tiers); undefined must be handled by the caller.
 * Returns validation error strings — empty array means the shape is sound.
 */
export function validateGroupTiersShape(raw: unknown): string[] {
  if (raw === null) return []
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return ['group_price_tiers must be an object mapping group size ("2".."6") to total price in pence']
  }
  // Distinct messages only — a 5-key map with 5 bad values reports one error.
  const errors = new Set<string>()
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!TIER_KEY_RE.test(key)) {
      errors.add(`group_price_tiers keys must be integers between ${GROUP_SIZE_MIN} and ${GROUP_SIZE_MAX}`)
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < GROUP_TIER_MIN_PENCE) {
      errors.add(`group_price_tiers values must be integer pence >= ${GROUP_TIER_MIN_PENCE} (£1.00)`)
    }
  }
  return [...errors]
}

/**
 * Cross-field rules, run against the EFFECTIVE state a write would produce
 * (for POST that is the body itself; for PATCH it is body merged over the
 * existing row). Assumes shapes have already passed validateGroupTiersShape.
 *
 * When group sessions are enabled:
 *   - max_group_size is required, integer 2–6
 *   - at least one tier is required (group with no tiers is unbookable)
 *   - every tier key must be <= max_group_size (max 4 allows tiers 2, 3, 4)
 */
export function validateGroupConsistency(state: {
  sessionTypes: string[]
  maxGroupSize: number | null
  groupPriceTiers: GroupPriceTiers | null
}): string[] {
  if (!isGroupEnabled(state.sessionTypes)) return []

  const errors: string[] = []
  const max = state.maxGroupSize
  if (
    max === null ||
    !Number.isInteger(max) ||
    max < GROUP_SIZE_MIN ||
    max > GROUP_SIZE_MAX
  ) {
    errors.push(
      `max_group_size must be a number between ${GROUP_SIZE_MIN} and ${GROUP_SIZE_MAX} when group sessions are enabled`,
    )
  }

  const tiers = state.groupPriceTiers
  if (tiers === null || Object.keys(tiers).length === 0) {
    errors.push('at least one group_price_tiers entry is required when group sessions are enabled')
  } else if (max !== null && Object.keys(tiers).some((k) => Number.parseInt(k, 10) > max)) {
    errors.push('group_price_tiers keys must not exceed max_group_size')
  }

  return errors
}

/**
 * Narrow a DB Json value to GroupPriceTiers for API responses. Rows are
 * written only through the validated routes (plus the migration-053 object
 * CHECK), so non-numeric entries should not exist — they are dropped rather
 * than thrown on, keeping reads total.
 */
export function toGroupPriceTiers(value: Json | null | undefined): GroupPriceTiers | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) return null
  const tiers: GroupPriceTiers = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number') tiers[key] = entry
  }
  return tiers
}
