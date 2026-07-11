// BUG-19 Phase 2 (Option B): expandSessionBlocks is the single expansion of a
// programme session's time blocks — camp-mode slots jsonb when present, else
// the row's own start/end. Both the write-side guard (commitments.ts) and the
// public calendar (programmeSchedule.ts) consume it, so its edge cases ARE the
// read/write-parity contract.

import { expandSessionBlocks } from '@/lib/availability/campSlots'

describe('expandSessionBlocks', () => {
  it('returns the row interval when slots is null', () => {
    expect(expandSessionBlocks({ start_time: '09:00:00', end_time: '10:00:00', slots: null })).toEqual([
      { startTime: '09:00', endTime: '10:00' },
    ])
  })

  it('returns the row interval when slots is absent', () => {
    expect(expandSessionBlocks({ start_time: '09:00', end_time: '10:00' })).toEqual([
      { startTime: '09:00', endTime: '10:00' },
    ])
  })

  it('expands a camp slots array to one block per element (row interval NOT re-added)', () => {
    const blocks = expandSessionBlocks({
      start_time: '09:00:00',
      end_time: '12:00:00',
      slots: [
        { startTime: '09:00', endTime: '12:00' },
        { startTime: '13:00', endTime: '17:00' },
      ],
    })
    // slots[0] mirrors the row columns (migration 031 convention) — exactly
    // two blocks, never three.
    expect(blocks).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '13:00', endTime: '17:00' },
    ])
  })

  it('normalises HH:MM:SS slot times to HH:MM', () => {
    expect(
      expandSessionBlocks({
        start_time: '09:00',
        end_time: '10:00',
        slots: [{ startTime: '13:00:00', endTime: '17:30:00' }],
      }),
    ).toEqual([{ startTime: '13:00', endTime: '17:30' }])
  })

  it('skips malformed entries and keeps the valid ones', () => {
    expect(
      expandSessionBlocks({
        start_time: '09:00',
        end_time: '10:00',
        slots: [
          'not-an-object',
          { startTime: '25:00', endTime: '26:00' }, // unparseable hour
          { startTime: '14:00' }, // missing endTime
          { startTime: '15:00', endTime: '14:00' }, // inverted
          { startTime: '13:00', endTime: '17:00' },
        ],
      }),
    ).toEqual([{ startTime: '13:00', endTime: '17:00' }])
  })

  it('falls back to the row interval when every slot entry is malformed', () => {
    expect(
      expandSessionBlocks({
        start_time: '09:00',
        end_time: '10:00',
        slots: [{ bad: true }],
      }),
    ).toEqual([{ startTime: '09:00', endTime: '10:00' }])
  })

  it('falls back to the row interval when slots is an empty array', () => {
    expect(expandSessionBlocks({ start_time: '09:00', end_time: '10:00', slots: [] })).toEqual([
      { startTime: '09:00', endTime: '10:00' },
    ])
  })

  it('returns [] when there are no usable times at all', () => {
    expect(expandSessionBlocks({ start_time: null, end_time: null, slots: null })).toEqual([])
  })
})
