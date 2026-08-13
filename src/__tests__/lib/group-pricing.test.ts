// CF-PRICE-01: unit tests for the shared group pricing validation module.

import {
  GROUP_SIZE_MAX,
  GROUP_SIZE_MIN,
  GROUP_TIER_MIN_PENCE,
  isGroupEnabled,
  toGroupPriceTiers,
  validateGroupConsistency,
  validateGroupTiersShape,
} from '@/lib/coach/group-pricing'

describe('isGroupEnabled', () => {
  it('is true only when session_types contains group', () => {
    expect(isGroupEnabled(['individual', 'group'])).toBe(true)
    expect(isGroupEnabled(['group'])).toBe(true)
    expect(isGroupEnabled(['individual'])).toBe(false)
    expect(isGroupEnabled([])).toBe(false)
  })
})

describe('validateGroupTiersShape', () => {
  it('accepts null (clears tiers)', () => {
    expect(validateGroupTiersShape(null)).toEqual([])
  })

  it('accepts a valid tier map', () => {
    expect(validateGroupTiersShape({ '2': 4500, '3': 5500, '6': 9000 })).toEqual([])
  })

  it('rejects non-object values', () => {
    for (const bad of [4500, 'tiers', true, [4500]]) {
      const errors = validateGroupTiersShape(bad)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('must be an object')
    }
  })

  it('rejects keys outside 2-6', () => {
    for (const bad of [{ '1': 4500 }, { '7': 4500 }, { '2.5': 4500 }, { '-2': 4500 }, { two: 4500 }]) {
      expect(validateGroupTiersShape(bad)).toEqual(
        expect.arrayContaining([expect.stringContaining('keys must be integers between 2 and 6')])
      )
    }
  })

  it('rejects non-integer, sub-minimum, and non-numeric values', () => {
    for (const bad of [{ '2': 45.5 }, { '2': 99 }, { '2': -4500 }, { '2': '4500' }, { '2': null }]) {
      expect(validateGroupTiersShape(bad)).toEqual(
        expect.arrayContaining([expect.stringContaining('integer pence')])
      )
    }
  })

  it('reports each distinct problem once, not per entry', () => {
    const errors = validateGroupTiersShape({ '7': 45.5, '8': 12.3, '9': 1 })
    expect(errors).toHaveLength(2)
  })
})

describe('validateGroupConsistency', () => {
  it('passes a coherent enabled state', () => {
    expect(
      validateGroupConsistency({
        sessionTypes: ['individual', 'group'],
        maxGroupSize: 4,
        groupPriceTiers: { '2': 4500, '3': 5500, '4': 6500 },
      })
    ).toEqual([])
  })

  it('is a no-op when group is disabled', () => {
    expect(
      validateGroupConsistency({ sessionTypes: ['individual'], maxGroupSize: null, groupPriceTiers: null })
    ).toEqual([])
  })

  it('requires max_group_size 2-6 when enabled', () => {
    for (const max of [null, 1, 7, 3.5]) {
      expect(
        validateGroupConsistency({
          sessionTypes: ['group'],
          maxGroupSize: max,
          groupPriceTiers: { '2': 4500 },
        })
      ).toEqual(expect.arrayContaining([expect.stringContaining('max_group_size must be a number between 2 and 6')]))
    }
  })

  it('requires at least one tier when enabled', () => {
    for (const tiers of [null, {}]) {
      expect(
        validateGroupConsistency({ sessionTypes: ['group'], maxGroupSize: 4, groupPriceTiers: tiers })
      ).toEqual(expect.arrayContaining([expect.stringContaining('at least one group_price_tiers entry')]))
    }
  })

  it('rejects tier keys above max_group_size (max 4 allows 2, 3, 4 only)', () => {
    expect(
      validateGroupConsistency({
        sessionTypes: ['group'],
        maxGroupSize: 4,
        groupPriceTiers: { '2': 4500, '5': 7000 },
      })
    ).toEqual(expect.arrayContaining([expect.stringContaining('must not exceed max_group_size')]))
  })

  it('accepts sparse tiers within the cap (coach offers 2 and 4 but not 3)', () => {
    expect(
      validateGroupConsistency({
        sessionTypes: ['group'],
        maxGroupSize: 4,
        groupPriceTiers: { '2': 4500, '4': 6500 },
      })
    ).toEqual([])
  })
})

describe('toGroupPriceTiers', () => {
  it('passes through null and undefined as null', () => {
    expect(toGroupPriceTiers(null)).toBeNull()
    expect(toGroupPriceTiers(undefined)).toBeNull()
  })

  it('narrows a valid Json object', () => {
    expect(toGroupPriceTiers({ '2': 4500, '3': 5500 })).toEqual({ '2': 4500, '3': 5500 })
  })

  it('returns null for non-object Json and drops non-numeric entries', () => {
    expect(toGroupPriceTiers('nope')).toBeNull()
    expect(toGroupPriceTiers([4500])).toBeNull()
    expect(toGroupPriceTiers({ '2': 4500, '3': 'bad' })).toEqual({ '2': 4500 })
  })
})

describe('exported bounds', () => {
  it('match the locked CF-PRICE-01 contract', () => {
    expect(GROUP_SIZE_MIN).toBe(2)
    expect(GROUP_SIZE_MAX).toBe(6)
    expect(GROUP_TIER_MIN_PENCE).toBe(100)
  })
})
