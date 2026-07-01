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

describe('bookableSlots — ad-hoc placement + isAdHoc flag (BUG-04)', () => {
  // SUNDAY is 2026-01-04; NEXT_SUNDAY shares the same weekday (day_of_week 0).
  const NEXT_SUNDAY = new Date('2026-01-11T00:00:00')

  it('places an ad-hoc block on its specific_date only', () => {
    const adHoc = sunday({ is_recurring: false, specific_date: '2026-01-04' })
    const slots = bookableSlots(SUNDAY, [adHoc], new Set(), 0, 60, NOW, 60)
    expect(slots).toHaveLength(1)
    expect(slots[0].time).toBe('09:00')
  })

  it('does NOT repeat an ad-hoc block on other matching weekdays', () => {
    // Same weekday as its specific_date, but a different date — must be empty.
    const adHoc = sunday({ is_recurring: false, specific_date: '2026-01-04' })
    const slots = bookableSlots(NEXT_SUNDAY, [adHoc], new Set(), 0, 60, NOW, 60)
    expect(slots).toHaveLength(0)
  })

  it('marks ad-hoc slots isAdHoc=true', () => {
    const adHoc = sunday({ is_recurring: false, specific_date: '2026-01-04' })
    const slots = bookableSlots(SUNDAY, [adHoc], new Set(), 0, 60, NOW, 60)
    expect(slots[0].isAdHoc).toBe(true)
  })

  it('keeps recurring blocks placing weekly and marks them isAdHoc=false', () => {
    // Default helper omits is_recurring (recurring). Appears on every matching
    // weekday (both SUNDAY and NEXT_SUNDAY) and is never flagged ad-hoc.
    const recurring = sunday({})
    expect(bookableSlots(SUNDAY, [recurring], new Set(), 0, 60, NOW, 60)[0].isAdHoc).toBe(false)
    expect(bookableSlots(NEXT_SUNDAY, [recurring], new Set(), 0, 60, NOW, 60)).toHaveLength(1)
  })

  it('explicit is_recurring=true also places weekly', () => {
    const recurring = sunday({ is_recurring: true, specific_date: null })
    expect(bookableSlots(NEXT_SUNDAY, [recurring], new Set(), 0, 60, NOW, 60)).toHaveLength(1)
  })

  it('surfaces both a recurring and an ad-hoc block on the same date with correct flags', () => {
    const slots = bookableSlots(
      SUNDAY,
      [
        sunday({ start_time: '09:00', end_time: '10:00' }), // recurring
        sunday({ start_time: '14:00', end_time: '15:00', is_recurring: false, specific_date: '2026-01-04' }), // ad-hoc
      ],
      new Set(),
      0,
      60,
      NOW,
      60,
    )
    const byTime = Object.fromEntries(slots.map(s => [s.time, s.isAdHoc]))
    expect(byTime['09:00']).toBe(false)
    expect(byTime['14:00']).toBe(true)
  })
})

describe('bookableSlots — programme collision suppression (BUG-16)', () => {
  // A whole-day 09:00–15:00 recurring template → hourly slots at 09,10,11,12,13,14.
  const wholeDay = () => sunday({ start_time: '09:00', end_time: '15:00' })

  it('is unchanged when no busy intervals are passed (default [])', () => {
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60)
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00', '14:00'])
  })

  it('suppresses the exact slot a programme session overlaps', () => {
    // Programme 11:00–12:00 removes only the 11:00 slot.
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 11 * 60, endMinutes: 12 * 60 },
    ])
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:00', '12:00', '13:00', '14:00'])
  })

  it('suppresses every slot a longer programme session straddles', () => {
    // Programme 10:30–12:30 overlaps the 10:00, 11:00 and 12:00 slots.
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 10 * 60 + 30, endMinutes: 12 * 60 + 30 },
    ])
    expect(slots.map(s => s.time)).toEqual(['09:00', '13:00', '14:00'])
  })

  it('does NOT suppress an adjacent (touching) session — half-open overlap', () => {
    // Programme 10:00–11:00 abuts the 09:00 slot's end and the 11:00 slot's start;
    // only the 10:00 slot itself is removed.
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 10 * 60, endMinutes: 11 * 60 },
    ])
    expect(slots.map(s => s.time)).toEqual(['09:00', '11:00', '12:00', '13:00', '14:00'])
  })

  it('can empty the day entirely when a session spans all slots', () => {
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 9 * 60, endMinutes: 15 * 60 },
    ])
    expect(slots).toHaveLength(0)
  })
})
