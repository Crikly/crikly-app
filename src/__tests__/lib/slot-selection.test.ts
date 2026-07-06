// BUG-23: the slot-selection wire codec — "uuid" (slot 0) / "uuid.N" (camp
// block N) — used identically by the picker, the ?sessions= param, the
// checkout page, and the enrolments API. Identity only: these tests pin the
// parse/dedupe/encode contract; pricing is always re-derived server-side.

import {
  parseSelectionEntry,
  parseSelectionList,
  encodeSelection,
} from '@/lib/booking/slot-selection'

const UUID_A = '11111111-1111-4111-8111-111111111101'
const UUID_B = '11111111-1111-4111-8111-111111111102'

describe('parseSelectionEntry', () => {
  it('parses a bare uuid as slot 0 (non-camp wire format, unchanged)', () => {
    expect(parseSelectionEntry(UUID_A)).toEqual({ sessionId: UUID_A, slotIndex: 0 })
  })

  it('parses uuid.N as camp block N', () => {
    expect(parseSelectionEntry(`${UUID_A}.1`)).toEqual({ sessionId: UUID_A, slotIndex: 1 })
  })

  it('lowercases the uuid (stable identity)', () => {
    expect(parseSelectionEntry(UUID_A.toUpperCase())).toEqual({ sessionId: UUID_A, slotIndex: 0 })
  })

  it.each([
    ['not-a-uuid'],
    [''],
    [`${UUID_A}.`],
    [`${UUID_A}.x`],
    [`${UUID_A}.1.2`],
    [`${UUID_A}.20`], // beyond the migration-040 CHECK (0–19)
    [`${UUID_A},${UUID_B}`],
    ['11111111-1111-4111-8111-11111111110'], // truncated uuid
  ])('rejects malformed entry %s', (entry) => {
    expect(parseSelectionEntry(entry)).toBeNull()
  })
})

describe('parseSelectionList', () => {
  it('dedupes by (session, slot) PAIR — same slot twice pays once', () => {
    expect(parseSelectionList([UUID_A, UUID_A])).toEqual([{ sessionId: UUID_A, slotIndex: 0 }])
  })

  it('keeps two slots of the SAME session as two selections (full day = 2 sessions)', () => {
    expect(parseSelectionList([UUID_A, `${UUID_A}.1`])).toEqual([
      { sessionId: UUID_A, slotIndex: 0 },
      { sessionId: UUID_A, slotIndex: 1 },
    ])
  })

  it('rejects the whole list when ANY entry is malformed (no half-priced bodies)', () => {
    expect(parseSelectionList([UUID_A, 'garbage'])).toBeNull()
  })

  it('parses a mixed multi-session selection', () => {
    expect(parseSelectionList([UUID_A, `${UUID_B}.1`])).toEqual([
      { sessionId: UUID_A, slotIndex: 0 },
      { sessionId: UUID_B, slotIndex: 1 },
    ])
  })
})

describe('encodeSelection', () => {
  it('encodes slot 0 as the bare uuid (non-camp URLs byte-identical)', () => {
    expect(encodeSelection({ sessionId: UUID_A, slotIndex: 0 })).toBe(UUID_A)
  })

  it('encodes camp blocks as uuid.N', () => {
    expect(encodeSelection({ sessionId: UUID_A, slotIndex: 1 })).toBe(`${UUID_A}.1`)
  })

  it('round-trips through parseSelectionEntry', () => {
    for (const sel of [
      { sessionId: UUID_A, slotIndex: 0 },
      { sessionId: UUID_B, slotIndex: 3 },
    ]) {
      expect(parseSelectionEntry(encodeSelection(sel))).toEqual(sel)
    }
  })
})
