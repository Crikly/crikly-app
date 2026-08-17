/** @jest-environment jsdom */
// Unit tests for src/lib/booking/authed-booking-handoff.ts (P-10 bug 1
// restructure): the hold carries primaryPlayer + additionalParticipants
// (players 2..N ONLY — mirrors bookings.additional_participants), so a
// consumer composing [primary, ...additional] can never duplicate the
// primary. readBookingHold shape-guards every optional field and drops
// malformed values instead of throwing (defence-in-depth against stale or
// hand-edited sessionStorage).

import {
  stashBookingHold,
  readBookingHold,
  clearBookingHold,
  type AuthedBookingHold,
} from '@/lib/booking/authed-booking-handoff'

const KEY = 'crikly:p10-booking-hold'
const CHILD_A = '33333333-3333-4333-8333-333333333333'

const GROUP_HOLD: AuthedBookingHold = {
  coachId: '11111111-1111-4111-8111-111111111111',
  date: '2099-07-06',
  startTime: '10:00',
  players: 3,
  holdStartedAt: 1_755_000_000_000,
  childProfileId: CHILD_A,
  primaryPlayer: { kind: 'child', childProfileId: CHILD_A, firstName: 'Yuwin', age: '9' },
  additionalParticipants: [
    { kind: 'child', childProfileId: '44444444-4444-4444-8444-444444444444', firstName: 'Arthur', age: '11' },
    { kind: 'guest', firstName: 'Sam', age: '8' },
  ],
}

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('stash/read round-trip', () => {
  it('returns the full hold, primary and additional kept separate', () => {
    stashBookingHold(GROUP_HOLD)
    const read = readBookingHold()
    expect(read).toEqual(GROUP_HOLD)
    // Bug-1 invariant: the primary never appears inside additionalParticipants.
    expect(
      read?.additionalParticipants?.some(
        (p) => p.kind === 'child' && p.childProfileId === CHILD_A,
      ),
    ).toBe(false)
  })

  it('round-trips a 1-player hold (no additionalParticipants field)', () => {
    const hold: AuthedBookingHold = {
      coachId: GROUP_HOLD.coachId,
      date: GROUP_HOLD.date,
      startTime: GROUP_HOLD.startTime,
      players: 1,
      holdStartedAt: GROUP_HOLD.holdStartedAt,
      childProfileId: CHILD_A,
      primaryPlayer: GROUP_HOLD.primaryPlayer,
    }
    stashBookingHold(hold)
    expect(readBookingHold()).toEqual(hold)
  })

  it('clearBookingHold removes the key', () => {
    stashBookingHold(GROUP_HOLD)
    clearBookingHold()
    expect(readBookingHold()).toBeNull()
  })
})

describe('shape-guarding malformed storage', () => {
  it('returns null when a required field is missing or mistyped', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ...GROUP_HOLD, players: '3' }))
    expect(readBookingHold()).toBeNull()

    const withoutStart: Record<string, unknown> = { ...GROUP_HOLD }
    delete withoutStart.startTime
    window.sessionStorage.setItem(KEY, JSON.stringify(withoutStart))
    expect(readBookingHold()).toBeNull()
  })

  it('drops a malformed primaryPlayer but keeps the rest of the hold', () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...GROUP_HOLD, primaryPlayer: 'Yuwin' }),
    )
    const read = readBookingHold()
    expect(read).not.toBeNull()
    expect(read?.primaryPlayer).toBeUndefined()
    expect(read?.additionalParticipants).toEqual(GROUP_HOLD.additionalParticipants)
  })

  it('drops a malformed additionalParticipants array but keeps the rest', () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        ...GROUP_HOLD,
        additionalParticipants: [{ kind: 'guest', firstName: 42, age: '8' }],
      }),
    )
    const read = readBookingHold()
    expect(read).not.toBeNull()
    expect(read?.additionalParticipants).toBeUndefined()
    expect(read?.primaryPlayer).toEqual(GROUP_HOLD.primaryPlayer)
  })

  it('drops a child entry missing its childProfileId', () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        ...GROUP_HOLD,
        additionalParticipants: [{ kind: 'child', firstName: 'Arthur', age: '11' }],
      }),
    )
    expect(readBookingHold()?.additionalParticipants).toBeUndefined()
  })

  it('returns null for unparseable JSON', () => {
    window.sessionStorage.setItem(KEY, '{not json')
    expect(readBookingHold()).toBeNull()
  })
})
