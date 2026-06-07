// TEST-PROG-SESSIONS-LIB: unit tests for the pure session-date generator
// shared between CreateProgramme / EditProgramme preview UI and the server-
// side ends_at derivation in the programmes POST + PATCH handlers.
//
// Anchor dates used throughout:
//   2026-06-01 = Monday    (getDay() === 1)
//   2026-06-03 = Wednesday (getDay() === 3)
//   2026-06-06 = Saturday  (getDay() === 6)  ← BST regression anchor
//   2026-06-07 = Sunday    (getDay() === 0)
//
// Camp-mode `slots[]` and SessionCalendar skip/restore behaviour are NOT
// covered here — they belong to SessionCalendar.tsx and will be tested in
// a future SessionCalendar.test.tsx (per the TEST-PROG-SESSIONS-LIB brief).

import {
  generateProgrammeSessionDates,
  type SessionDatesInput,
} from '@/lib/programme-sessions'

describe('generateProgrammeSessionDates', () => {
  // ── Invalid inputs — early-return guards ─────────────────────────────────

  describe('invalid inputs — early-return guards', () => {
    it('E1: returns [] when startDate is an empty string', () => {
      const out = generateProgrammeSessionDates({
        startDate: '',
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      expect(out).toEqual([])
    })

    it('E1: returns [] when startDate is missing (undefined cast)', () => {
      const out = generateProgrammeSessionDates({
        startDate: undefined as unknown as string,
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      expect(out).toEqual([])
    })

    it('E2: returns [] when days is an empty array', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      expect(out).toEqual([])
    })

    it('E3: returns [] when startDate is not a valid YYYY-MM-DD (e.g. "2026-13-99")', () => {
      // ISO strict-parse in V8 (Node): out-of-range fields produce NaN, not overflow-roll.
      // `'2026-02-99'` would also yield Invalid Date for the same reason.
      const out = generateProgrammeSessionDates({
        startDate: '2026-13-99',
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      expect(out).toEqual([])
    })
  })

  // ── Count mode (Fixed schedule) ──────────────────────────────────────────

  describe('count mode (Fixed schedule)', () => {
    it('C1: returns [] when count is 0', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'count',
        count: 0,
        endDate: '',
      })
      expect(out).toEqual([])
    })

    it('C1: returns [] when count is negative', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'count',
        count: -1,
        endDate: '',
      })
      expect(out).toEqual([])
    })

    it('C2: returns exactly `count` dates when days=[6] (Sat) and count=4 (weekly Saturday pattern)', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      expect(out).toEqual([
        '2026-06-06',
        '2026-06-13',
        '2026-06-20',
        '2026-06-27',
      ])
      expect(out).toHaveLength(4)
    })

    it('C2: returns dates that all fall on the requested weekday', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      for (const d of out) {
        // Parse as local-component date — same anchor the lib uses.
        const parsed = new Date(`${d}T00:00:00`)
        expect(parsed.getDay()).toBe(6)
      }
    })

    it('C2: returns dates in ascending order with 7-day spacing for a single-weekday pattern', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      })
      // Safe: no DST crossing within the June 2026 range. If this test is ever
      // extended across the late-October BST→GMT transition, clocks change by
      // one hour and `7 * msInDay` would no longer hold — use date-string
      // arithmetic instead at that point.
      const msInDay = 24 * 60 * 60 * 1000
      for (let i = 1; i < out.length; i++) {
        const prev = new Date(`${out[i - 1]}T00:00:00`).getTime()
        const curr = new Date(`${out[i]}T00:00:00`).getTime()
        expect(curr - prev).toBe(7 * msInDay)
      }
    })

    it('C2: returns dates that match a multi-day pattern (days=[1,3] = Mon+Wed) in calendar order', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-01', // Monday
        days: [1, 3],            // Mon, Wed
        mode: 'count',
        count: 4,
        endDate: '',
      })
      expect(out).toEqual([
        '2026-06-01', // Mon
        '2026-06-03', // Wed
        '2026-06-08', // Mon
        '2026-06-10', // Wed
      ])
    })

    it('C2: includes the startDate itself when it matches the requested weekday', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06', // Saturday
        days: [6],               // Sat
        mode: 'count',
        count: 1,
        endDate: '',
      })
      expect(out).toEqual(['2026-06-06'])
    })

    it('C2: starts from the next matching weekday when startDate falls on a non-matching day', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-07', // Sunday — does not match
        days: [6],               // Sat
        mode: 'count',
        count: 1,
        endDate: '',
      })
      expect(out).toEqual(['2026-06-13']) // next Saturday
    })
  })

  // ── End_date mode (Rolling schedule) ─────────────────────────────────────

  describe('end_date mode (Rolling schedule)', () => {
    it('R1: returns [] when endDate is an empty string', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'end_date',
        count: 0,
        endDate: '',
      })
      expect(out).toEqual([])
    })

    it('R2: returns [] when endDate is not a valid YYYY-MM-DD', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        days: [6],
        mode: 'end_date',
        count: 0,
        endDate: '2026-13-99',
      })
      expect(out).toEqual([])
    })

    it('R3: returns all matching weekdays in [startDate, endDate] inclusive', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        endDate: '2026-06-27',
        days: [6],
        mode: 'end_date',
        count: 0,
      })
      expect(out).toEqual([
        '2026-06-06',
        '2026-06-13',
        '2026-06-20',
        '2026-06-27',
      ])
    })

    it('R3: returns [] when endDate is before startDate', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-27',
        endDate: '2026-06-06',
        days: [6],
        mode: 'end_date',
        count: 0,
      })
      expect(out).toEqual([])
    })

    it('R3: returns [startDate] only when startDate === endDate and the day matches the pattern', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06',
        endDate: '2026-06-06',
        days: [6],
        mode: 'end_date',
        count: 0,
      })
      expect(out).toEqual(['2026-06-06'])
    })

    it('R3: returns dates in ascending order with no duplicates over a multi-week range', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-01', // Mon
        endDate: '2026-06-30',
        days: [1, 3], // Mon + Wed
        mode: 'end_date',
        count: 0,
      })
      // June 2026: Mon = 1, 8, 15, 22, 29; Wed = 3, 10, 17, 24
      expect(out).toEqual([
        '2026-06-01',
        '2026-06-03',
        '2026-06-08',
        '2026-06-10',
        '2026-06-15',
        '2026-06-17',
        '2026-06-22',
        '2026-06-24',
        '2026-06-29',
      ])
      expect(new Set(out).size).toBe(out.length) // no duplicates
      // Ascending order
      for (let i = 1; i < out.length; i++) {
        expect(out[i - 1] < out[i]).toBe(true)
      }
    })
  })

  // ── BST timezone safety ──────────────────────────────────────────────────
  //
  // The lib uses toYYYYMMDD(d) with getFullYear/getMonth/getDate (local
  // components) rather than toISOString().split('T')[0] (UTC). If a future
  // refactor swapped to UTC, dates selected in BST would silently shift to
  // the previous calendar day. These tests are the regression guard.

  describe('BST timezone safety', () => {
    it('produces dates whose getDay() matches the requested days[] regardless of runner TZ', () => {
      const input: SessionDatesInput = {
        startDate: '2026-06-06', // Saturday in any reasonable TZ
        days: [6],
        mode: 'count',
        count: 4,
        endDate: '',
      }
      const out = generateProgrammeSessionDates(input)
      // The output strings, when parsed as local dates, must all be Saturdays.
      // A UTC-based formatter would produce '2026-06-05' (Fri) in BST.
      for (const d of out) {
        expect(new Date(`${d}T00:00:00`).getDay()).toBe(6)
      }
    })

    it('does NOT shift dates by one day: a Saturday startDate is returned as Saturday, not Friday (BST regression)', () => {
      const out = generateProgrammeSessionDates({
        startDate: '2026-06-06', // Saturday
        days: [6],
        mode: 'count',
        count: 1,
        endDate: '',
      })
      expect(out).toEqual(['2026-06-06'])
      expect(out[0]).not.toBe('2026-06-05') // Friday — the BST drift bug's signature
    })
  })
})
