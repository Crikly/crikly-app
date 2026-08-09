// BUG-08 regression: bookableSlots must attach each slot's per-block price
// override (price_override_pence) so the availability time picker can price a
// slot instead of always falling back to the coach's sport default.

// BUG-19 Phase 1: canonical home is src/lib/availability/slots.ts (the old
// _components/_data path is a re-export shim kept for existing UI imports).
import { bookableSlots, type SlotTemplate } from '@/lib/availability/slots'

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

describe('bookableSlots — booked-slot suppression (BUG-14)', () => {
  // Busy intervals are source-agnostic: live bookings (pending_payment /
  // confirmed / completed — migration 034's slot-holding predicate) flow through
  // the same suppression as programme sessions. These cases document the BUG-14
  // read-side semantics specifically.
  const wholeDay = () => sunday({ start_time: '09:00', end_time: '15:00' })

  it('suppresses a slot held by a live booking at the same start time', () => {
    // A confirmed 10:00–11:00 booking removes exactly the 10:00 slot.
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 10 * 60, endMinutes: 11 * 60 },
    ])
    expect(slots.map(s => s.time)).toEqual(['09:00', '11:00', '12:00', '13:00', '14:00'])
  })

  it('suppresses overlapping slots even when the booking start is UNEQUAL (034 index gap)', () => {
    // A 09:30–10:30 booking (e.g. from another sport's 90-min grid) must kill
    // both the 09:00 and 10:00 slots — exact-start matching would miss it.
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 9 * 60 + 30, endMinutes: 10 * 60 + 30 },
    ])
    expect(slots.map(s => s.time)).toEqual(['11:00', '12:00', '13:00', '14:00'])
  })

  it('frees the slot again when the booking is cancelled (interval no longer passed)', () => {
    // Cancellation removes the row from the 034 predicate, so the caller stops
    // passing its interval — the slot reappears with no special-casing here.
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [])
    expect(slots.map(s => s.time)).toContain('10:00')
  })

  it('merges booking and programme intervals from mixed sources', () => {
    const slots = bookableSlots(SUNDAY, [wholeDay()], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 10 * 60, endMinutes: 11 * 60 }, // booking
      { startMinutes: 13 * 60, endMinutes: 14 * 60 }, // programme session
    ])
    expect(slots.map(s => s.time)).toEqual(['09:00', '11:00', '12:00', '14:00'])
  })
})

describe('bookableSlots — per-template sport duration (BUG-51)', () => {
  it('a 2-hour window with a 60-min sport yields exactly 2 slots', () => {
    const cricket = sunday({ start_time: '09:00', end_time: '11:00', session_duration_minutes: 60 })
    const slots = bookableSlots(SUNDAY, [cricket], new Set(), 0, 60, NOW, 60)
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:00'])
    expect(slots.every(s => s.durationMinutes === 60)).toBe(true)
  })

  it('strides each template by ITS OWN sport duration, not the call-wide fallback', () => {
    // Cricket 60 min (09:00–11:00) + Tennis 90 min (12:00–15:00) on one day.
    // Pre-BUG-51, a 60-min call-wide stride wrongly gave Tennis 12:00/13:00/14:00.
    const slots = bookableSlots(
      SUNDAY,
      [
        sunday({ start_time: '09:00', end_time: '11:00', session_duration_minutes: 60 }),
        sunday({ start_time: '12:00', end_time: '15:00', session_duration_minutes: 90 }),
      ],
      new Set(),
      0,
      60,
      NOW,
      60,
    )
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:00', '12:00', '13:30'])
    const byTime = Object.fromEntries(slots.map(s => [s.time, s.durationMinutes]))
    expect(byTime['09:00']).toBe(60)
    expect(byTime['12:00']).toBe(90)
    expect(byTime['13:30']).toBe(90)
  })

  it('falls back to the sessionDurationMinutes param for sport-agnostic templates', () => {
    // No session_duration_minutes on the template → the caller's 90 applies.
    const agnostic = sunday({ start_time: '09:00', end_time: '12:00' })
    const slots = bookableSlots(SUNDAY, [agnostic], new Set(), 0, 60, NOW, 90)
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:30'])
    expect(slots[0].durationMinutes).toBe(90)
  })

  it('treats null and non-positive template durations as absent (fallback)', () => {
    const nullDur = sunday({ start_time: '09:00', end_time: '11:00', session_duration_minutes: null })
    const zeroDur = sunday({ start_time: '09:00', end_time: '11:00', session_duration_minutes: 0 })
    expect(bookableSlots(SUNDAY, [nullDur], new Set(), 0, 60, NOW, 60)).toHaveLength(2)
    expect(bookableSlots(SUNDAY, [zeroDur], new Set(), 0, 60, NOW, 60)).toHaveLength(2)
  })

  it('an ad-hoc block splits by its own sport duration', () => {
    const adHoc = sunday({
      start_time: '09:00',
      end_time: '12:00',
      is_recurring: false,
      specific_date: '2026-01-04',
      session_duration_minutes: 90,
    })
    const slots = bookableSlots(SUNDAY, [adHoc], new Set(), 0, 60, NOW, 60)
    expect(slots.map(s => s.time)).toEqual(['09:00', '10:30'])
    expect(slots.every(s => s.isAdHoc && s.durationMinutes === 90)).toBe(true)
  })

  it('suppresses a busy collision using the slot OWN length, not the fallback', () => {
    // 90-min slot at 12:00 runs to 13:30; a 13:00–14:00 booking overlaps it even
    // though a 60-min window (12:00–13:00) would not.
    const tennis = sunday({ start_time: '12:00', end_time: '13:30', session_duration_minutes: 90 })
    const slots = bookableSlots(SUNDAY, [tennis], new Set(), 0, 60, NOW, 60, [
      { startMinutes: 13 * 60, endMinutes: 14 * 60 },
    ])
    expect(slots).toHaveLength(0)
  })
})
