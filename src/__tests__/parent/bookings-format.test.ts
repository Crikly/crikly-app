import {
  coachInitials,
  formatDayLabel,
  formatDurationLabel,
  formatPaidLabel,
  formatSessionLine,
  formatShortWhenLabel,
  formatTimeLabel,
  formatWhenLabel,
  stableColourIndex,
  formatProgrammeDateLabel,
  formatProgrammeShortWhenLabel,
  formatProgrammeWhenLabel,
} from '@/components/parent/bookings/format'
import { childIdentityColour } from '@/constants/childIdentity'

// P-14 — display formatters for the parent bookings page.

const TODAY = '2026-08-17'
const TOMORROW = '2026-08-18'

describe('formatTimeLabel', () => {
  it('formats on-the-hour times without minutes', () => {
    expect(formatTimeLabel('10:00:00')).toBe('10am')
    expect(formatTimeLabel('16:00:00')).toBe('4pm')
  })

  it('formats half-hour and odd-minute times with a dot separator', () => {
    expect(formatTimeLabel('10:30:00')).toBe('10.30am')
    expect(formatTimeLabel('16:05')).toBe('4.05pm')
  })

  it('handles midnight and midday', () => {
    expect(formatTimeLabel('00:00')).toBe('12am')
    expect(formatTimeLabel('12:00')).toBe('12pm')
  })
})

describe('formatDurationLabel', () => {
  it('formats whole hours', () => {
    expect(formatDurationLabel('10:00', '11:00')).toBe('(1 hr)')
    expect(formatDurationLabel('10:00', '12:00')).toBe('(2 hrs)')
  })

  it('formats half hours as decimal hours', () => {
    expect(formatDurationLabel('09:00', '10:30')).toBe('(1.5 hrs)')
  })

  it('formats sub-hour sessions in minutes', () => {
    expect(formatDurationLabel('10:00', '10:45')).toBe('(45 mins)')
  })
})

describe('formatDayLabel', () => {
  it('uses the weekday for ordinary dates', () => {
    expect(formatDayLabel('2026-08-27', TODAY, TOMORROW)).toBe('Thursday, 27 August')
  })

  it('substitutes Today and Tomorrow', () => {
    expect(formatDayLabel(TODAY, TODAY, TOMORROW)).toBe('Today, 17 August')
    expect(formatDayLabel(TOMORROW, TODAY, TOMORROW)).toBe('Tomorrow, 18 August')
  })
})

describe('formatWhenLabel', () => {
  it('assembles the full card line', () => {
    expect(
      formatWhenLabel('2026-08-27', '10:00:00', '11:00:00', TODAY, TOMORROW),
    ).toBe('Thursday, 27 August · 10am – 11am (1 hr)')
  })
})

describe('formatShortWhenLabel', () => {
  it('assembles the compact list line', () => {
    expect(formatShortWhenLabel('2026-08-27', '10:00:00', TODAY, TOMORROW)).toBe(
      'Thu 27 Aug, 10am',
    )
    expect(formatShortWhenLabel(TOMORROW, '16:00:00', TODAY, TOMORROW)).toBe(
      'Tomorrow, 4pm',
    )
  })
})

describe('formatPaidLabel', () => {
  it('always shows two decimal places for GBP', () => {
    expect(formatPaidLabel(5500, 'GBP')).toBe('£55.00')
    expect(formatPaidLabel(1850, 'GBP')).toBe('£18.50')
  })

  it('falls back to the ISO code for non-GBP currencies', () => {
    expect(formatPaidLabel(5500, 'USD')).toBe('USD 55.00')
  })
})

describe('coachInitials', () => {
  it('takes at most two initials', () => {
    expect(coachInitials('Ravi Patel')).toBe('RP')
    expect(coachInitials('Mary Jane Watson')).toBe('MJ')
    expect(coachInitials('Cher')).toBe('C')
  })
})

describe('stableColourIndex', () => {
  it('is deterministic for the same id', () => {
    const id = '09641cfb-9089-4426-baf6-ff4f5dc4f1d2'
    expect(stableColourIndex(id)).toBe(stableColourIndex(id))
  })

  it('always maps into the identity palette', () => {
    for (const id of ['a', 'b', 'coach-1', 'coach-2', '']) {
      const colour = childIdentityColour(stableColourIndex(id))
      expect(colour).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

describe('formatSessionLine', () => {
  it('labels individual sessions 1-to-1', () => {
    expect(formatSessionLine('Cricket', 'individual', 1)).toBe('Cricket · 1-to-1')
  })

  it('labels group sessions with the player count', () => {
    expect(formatSessionLine('Cricket', 'group', 6)).toBe('Cricket · Group · 6 players')
  })
})

// ── PROGRAMME-BOOKINGS-LIST — enrolment labels ───────────────────────────────

describe('formatProgrammeDateLabel', () => {
  it('formats a compact weekday date', () => {
    expect(formatProgrammeDateLabel('2026-09-05')).toBe('Sat 5 Sept')
  })
})

describe('formatProgrammeWhenLabel', () => {
  it('formats a multi-date range with a session count', () => {
    expect(formatProgrammeWhenLabel(4, '2026-09-05', '2026-09-26')).toBe(
      '4 sessions · Sat 5 Sept – Sat 26 Sept',
    )
  })

  it('collapses to a single date when first and last match', () => {
    expect(formatProgrammeWhenLabel(1, '2026-09-05', '2026-09-05')).toBe(
      '1 session · Sat 5 Sept',
    )
  })
})

describe('formatProgrammeShortWhenLabel', () => {
  it('formats the compact list-row line', () => {
    expect(formatProgrammeShortWhenLabel(4, '2026-09-05')).toBe('4 sessions from Sat 5 Sept')
  })

  it('uses the single-session form for one date', () => {
    expect(formatProgrammeShortWhenLabel(1, '2026-09-05')).toBe('1 session · Sat 5 Sept')
  })
})
