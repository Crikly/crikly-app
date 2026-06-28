// BUG-08 regression: bookableSlots must attach each slot's per-block price
// override (price_override_pence) so the availability time picker can price a
// slot instead of always falling back to the coach's sport default.

import { bookableSlots, type SlotTemplate } from '@/app/coaches/[id]/availability/_components/_data/slots'

// A fixed "now" well before the slots so the min-advance window never filters
// them out, and a target date on the matching weekday.
const NOW = new Date('2026-01-01T00:00:00') // Thursday
const SUNDAY = new Date('2026-01-04T00:00:00') // day_of_week === 0

function sunday(template: Partial<SlotTemplate>): SlotTemplate {
  return { day_of_week: 0, start_time: '09:00', end_time: '10:00', ...template }
}

describe('bookableSlots — per-slot price (BUG-08)', () => {
  it('carries the template price_override_pence onto each generated slot', () => {
    const slots = bookableSlots(SUNDAY, [sunday({ price_override_pence: 7500 })], new Set(), 0, 60, NOW, 60)
    expect(slots).toHaveLength(1)
    expect(slots[0].pricePence).toBe(7500)
  })

  it('yields null pricePence when the template has no override (use sport default)', () => {
    const slots = bookableSlots(SUNDAY, [sunday({ price_override_pence: null })], new Set(), 0, 60, NOW, 60)
    expect(slots).toHaveLength(1)
    expect(slots[0].pricePence).toBeNull()
  })

  it('treats a missing price_override_pence field as null', () => {
    const slots = bookableSlots(SUNDAY, [sunday({})], new Set(), 0, 60, NOW, 60)
    expect(slots[0].pricePence).toBeNull()
  })

  it('prices each start time from its own block', () => {
    const slots = bookableSlots(
      SUNDAY,
      [
        sunday({ start_time: '09:00', end_time: '10:00', price_override_pence: 7500 }),
        sunday({ start_time: '14:00', end_time: '15:00', price_override_pence: 6000 }),
      ],
      new Set(),
      0,
      60,
      NOW,
      60,
    )
    const byTime = Object.fromEntries(slots.map(s => [s.time, s.pricePence]))
    expect(byTime['09:00']).toBe(7500)
    expect(byTime['14:00']).toBe(6000)
  })
})

describe('bookableSlots — per-slot venue (UX-09)', () => {
  it('carries the template venue_name onto each generated slot', () => {
    const slots = bookableSlots(SUNDAY, [sunday({ venue_name: 'Kingston Hospital' })], new Set(), 0, 60, NOW, 60)
    expect(slots).toHaveLength(1)
    expect(slots[0].venueName).toBe('Kingston Hospital')
  })

  it('yields null venueName when the template has no venue', () => {
    const slots = bookableSlots(SUNDAY, [sunday({ venue_name: null })], new Set(), 0, 60, NOW, 60)
    expect(slots).toHaveLength(1)
    expect(slots[0].venueName).toBeNull()
  })

  it('treats a missing venue_name field as null', () => {
    const slots = bookableSlots(SUNDAY, [sunday({})], new Set(), 0, 60, NOW, 60)
    expect(slots[0].venueName).toBeNull()
  })

  it('attaches each start time its own block venue', () => {
    const slots = bookableSlots(
      SUNDAY,
      [
        sunday({ start_time: '09:00', end_time: '10:00', venue_name: 'Kingston Hospital' }),
        sunday({ start_time: '14:00', end_time: '15:00', venue_name: 'Lords Nets' }),
      ],
      new Set(),
      0,
      60,
      NOW,
      60,
    )
    const byTime = Object.fromEntries(slots.map(s => [s.time, s.venueName]))
    expect(byTime['09:00']).toBe('Kingston Hospital')
    expect(byTime['14:00']).toBe('Lords Nets')
  })
})
