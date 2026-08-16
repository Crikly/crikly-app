// Unit tests for src/lib/booking/participants.ts (P-10 Phase 2)
//
// Approved decisions covered:
//   D4  group_price_tiers[count] is authoritative; values are TOTAL pence.
//   D5  max players = highest tier key; primary counts toward the total.
//   Storage: players 2..N → additional_participants jsonb entries
//   [{name, age, child_profile_id}].
//
// No mocks needed — these are pure functions.

import {
  parsePlayers,
  maxBookablePlayers,
  groupTierPricePence,
  toAdditionalParticipantsJson,
} from '@/lib/booking/participants'

const CHILD_A = '33333333-3333-4333-8333-333333333333'
const CHILD_B = '44444444-4444-4444-8444-444444444444'

// ─── parsePlayers ─────────────────────────────────────────────────────────────

describe('parsePlayers', () => {
  it('parses a valid array, trimming names and defaulting age/childProfileId', () => {
    expect(
      parsePlayers(
        [{ name: '  Yuwin  ', age: 10 }, { name: 'Sam' }],
        { allowChildProfiles: false },
      ),
    ).toEqual([
      { name: 'Yuwin', age: 10, childProfileId: null },
      { name: 'Sam', age: null, childProfileId: null },
    ])
  })

  it('rejects non-arrays, empty arrays, and arrays beyond the hard cap (6)', () => {
    expect(parsePlayers(undefined, { allowChildProfiles: false })).toBeNull()
    expect(parsePlayers('Yuwin', { allowChildProfiles: false })).toBeNull()
    expect(parsePlayers([], { allowChildProfiles: false })).toBeNull()
    expect(
      parsePlayers(
        Array.from({ length: 7 }, (_, i) => ({ name: `P${i}` })),
        { allowChildProfiles: false },
      ),
    ).toBeNull()
  })

  it('rejects missing/empty/over-long names and out-of-range ages', () => {
    expect(parsePlayers([{ name: '   ' }], { allowChildProfiles: false })).toBeNull()
    expect(parsePlayers([{ name: 'x'.repeat(101) }], { allowChildProfiles: false })).toBeNull()
    expect(parsePlayers([{ name: 'A', age: 0 }], { allowChildProfiles: false })).toBeNull()
    expect(parsePlayers([{ name: 'A', age: 100 }], { allowChildProfiles: false })).toBeNull()
    expect(parsePlayers([{ name: 'A', age: 9.5 }], { allowChildProfiles: false })).toBeNull()
  })

  it('guest mode rejects any childProfileId; authed mode requires a UUID', () => {
    expect(
      parsePlayers([{ name: 'A', childProfileId: CHILD_A }], { allowChildProfiles: false }),
    ).toBeNull()
    expect(
      parsePlayers([{ name: 'A', childProfileId: 'not-a-uuid' }], { allowChildProfiles: true }),
    ).toBeNull()
    expect(
      parsePlayers([{ name: 'A', childProfileId: CHILD_A }], { allowChildProfiles: true }),
    ).toEqual([{ name: 'A', age: null, childProfileId: CHILD_A }])
  })

  it('rejects the same child profile in two player slots', () => {
    expect(
      parsePlayers(
        [
          { name: 'A', childProfileId: CHILD_A },
          { name: 'B', childProfileId: CHILD_A },
        ],
        { allowChildProfiles: true },
      ),
    ).toBeNull()
    expect(
      parsePlayers(
        [
          { name: 'A', childProfileId: CHILD_A },
          { name: 'B', childProfileId: CHILD_B },
        ],
        { allowChildProfiles: true },
      ),
    ).not.toBeNull()
  })
})

// ─── maxBookablePlayers (D5) ──────────────────────────────────────────────────

describe('maxBookablePlayers', () => {
  it('is the highest tier key when group sessions are enabled', () => {
    expect(maxBookablePlayers(['individual', 'group'], { '2': 9000, '4': 14000 })).toBe(4)
  })

  it('is 1 without the group session type, without tiers, or with empty tiers', () => {
    expect(maxBookablePlayers(['individual'], { '2': 9000 })).toBe(1)
    expect(maxBookablePlayers(['individual', 'group'], null)).toBe(1)
    expect(maxBookablePlayers(['individual', 'group'], {})).toBe(1)
  })
})

// ─── groupTierPricePence (D4) ─────────────────────────────────────────────────

describe('groupTierPricePence', () => {
  const tiers = { '2': 9000, '3': 12000 }

  it('returns the TOTAL tier price for the count', () => {
    expect(groupTierPricePence(tiers, 2)).toBe(9000)
    expect(groupTierPricePence(tiers, 3)).toBe(12000)
  })

  it('returns null for counts with no tier (caller 400s session_type_unavailable)', () => {
    expect(groupTierPricePence(tiers, 4)).toBeNull()
    expect(groupTierPricePence(null, 2)).toBeNull()
  })
})

// ─── toAdditionalParticipantsJson (migration 054 shape) ───────────────────────

describe('toAdditionalParticipantsJson', () => {
  it('is null for a 1-player booking (column stays NULL — the existing case)', () => {
    expect(
      toAdditionalParticipantsJson([{ name: 'Yuwin', age: 10, childProfileId: null }]),
    ).toBeNull()
  })

  it('maps players 2..N to snake_case entries, preserving child links', () => {
    expect(
      toAdditionalParticipantsJson([
        { name: 'Yuwin', age: 10, childProfileId: CHILD_A },
        { name: 'Arthur', age: 11, childProfileId: CHILD_B },
        { name: 'Sam', age: null, childProfileId: null },
      ]),
    ).toEqual([
      { name: 'Arthur', age: 11, child_profile_id: CHILD_B },
      { name: 'Sam', age: null, child_profile_id: null },
    ])
  })
})
