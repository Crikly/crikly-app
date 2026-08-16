// P-10 Phase 2: shared multi-player validation + group-tier pricing for the
// booking routes. Both POST /api/guest/bookings and POST /api/parent/bookings
// consume THIS module so their player rules cannot drift (the migration-053 /
// AF-H-56 lesson — the DB guards only the coarse jsonb type, every deeper
// rule lives here).
//
// Approved decisions (Lasith, 16 Aug):
//   - D4: group_price_tiers[player_count] is authoritative for ALL group
//     bookings; price_group_pence is DEPRECATED for price derivation.
//     No tier for the requested count → session_type_unavailable.
//   - D5: max total players = highest group_price_tiers key. The PRIMARY
//     player counts toward the total.
//   - Storage: primary player stays in bookings.participant_name /
//     participant_age (back-compat); players 2..N go to
//     bookings.additional_participants (migration 054) as
//     [{name, age, child_profile_id|null}].

import type { Json } from '@/types/database'
import {
  GROUP_SIZE_MAX,
  isGroupEnabled,
  toGroupPriceTiers,
} from '@/lib/coach/group-pricing'

/** One player on a booking. childProfileId links a parent's child profile
 * (authed bookings only — the guest route forbids it) and is null for
 * guest/free-text players. */
export interface BookingPlayer {
  /** Trimmed, 1..100 chars — what the coach sees ("who am I coaching?"). */
  name: string
  /** Age in years, 1..99, or null (adult players may omit it — UX-16). */
  age: number | null
  childProfileId: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Narrow an untrusted `players` array. Returns null when the shape is
 * invalid: not a non-empty array (hard-capped at GROUP_SIZE_MAX — the
 * per-coach cap is enforced separately against maxBookablePlayers), an
 * entry's name missing/empty/over-long, an age outside 1..99, a
 * childProfileId that is not a UUID, a childProfileId supplied when
 * `allowChildProfiles` is false (guest route), or the same child profile
 * appearing twice.
 */
export function parsePlayers(
  raw: unknown,
  opts: { allowChildProfiles: boolean },
): BookingPlayer[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > GROUP_SIZE_MAX) {
    return null
  }
  const players: BookingPlayer[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const e = entry as Record<string, unknown>

    if (typeof e.name !== 'string') return null
    const name = e.name.trim()
    if (name.length === 0 || name.length > 100) return null

    let age: number | null = null
    if (e.age !== undefined && e.age !== null) {
      if (
        typeof e.age !== 'number' ||
        !Number.isInteger(e.age) ||
        e.age < 1 ||
        e.age > 99
      ) {
        return null
      }
      age = e.age
    }

    let childProfileId: string | null = null
    if (e.childProfileId !== undefined && e.childProfileId !== null) {
      if (!opts.allowChildProfiles) return null
      if (typeof e.childProfileId !== 'string' || !UUID_RE.test(e.childProfileId)) {
        return null
      }
      childProfileId = e.childProfileId
    }

    players.push({ name, age, childProfileId })
  }

  // A child profile can occupy at most one player slot (approved pool rule).
  const childIds = players
    .map((p) => p.childProfileId)
    .filter((id): id is string => id !== null)
  if (new Set(childIds).size !== childIds.length) return null

  return players
}

/**
 * D5: the coach's bookable player cap — the highest group_price_tiers key
 * when group sessions are enabled (the primary counts toward it), else 1.
 */
export function maxBookablePlayers(
  sessionTypes: string[],
  tiersJson: Json | null,
): number {
  if (!isGroupEnabled(sessionTypes)) return 1
  const tiers = toGroupPriceTiers(tiersJson)
  if (!tiers) return 1
  const sizes = Object.keys(tiers)
    .map((key) => Number.parseInt(key, 10))
    .filter((size) => Number.isInteger(size) && size >= 2)
  return sizes.length > 0 ? Math.max(...sizes) : 1
}

/**
 * D4: the coach's TOTAL fee in pence for a group of `playerCount`, from
 * group_price_tiers — or null when no tier exists for that count (the
 * caller returns session_type_unavailable). Never falls back to
 * price_group_pence (deprecated) and never applies per-block overrides
 * (they are 1-on-1 only — BUG-09 scope).
 */
export function groupTierPricePence(
  tiersJson: Json | null,
  playerCount: number,
): number | null {
  const tiers = toGroupPriceTiers(tiersJson)
  const price = tiers?.[String(playerCount)]
  return typeof price === 'number' && price > 0 ? price : null
}

/**
 * Players 2..N as the bookings.additional_participants jsonb value
 * (migration 054), or null for a 1-player booking. The primary (players[0])
 * is stored in participant_name/participant_age by the caller.
 */
export function toAdditionalParticipantsJson(players: BookingPlayer[]): Json | null {
  if (players.length <= 1) return null
  return players.slice(1).map((p) => ({
    name: p.name,
    age: p.age,
    child_profile_id: p.childProfileId,
  }))
}
