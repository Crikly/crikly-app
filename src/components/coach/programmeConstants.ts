// CF-PROG-AGE-GROUP: programme age-group allowlist. Verbatim strings used as
// both display labels and stored values in group_programmes.age_groups.
// "All ages" is mutually exclusive with the specific groups (UI enforced).
// Minimum 1 selection required (UI + API enforced).
export const PROGRAMME_AGE_GROUPS = [
  'Under 8',
  'Under 10',
  'Under 13',
  'Under 16',
  'Adults (16+)',
  'All ages',
] as const

export type ProgrammeAgeGroup = (typeof PROGRAMME_AGE_GROUPS)[number]

export const ALL_AGES_LABEL: ProgrammeAgeGroup = 'All ages'

export function isProgrammeAgeGroup(value: unknown): value is ProgrammeAgeGroup {
  return typeof value === 'string' && (PROGRAMME_AGE_GROUPS as readonly string[]).includes(value)
}

// CF-PROG-SESSION-LIST: SessionEntry shape used by SessionCalendar + persisted
// (STUB this task — DB column lands in CF-PROG-SESSIONS-DB follow-up). When
// camp mode is on, `slots` holds the per-day time blocks and `startTime/endTime`
// mirror slots[0]. When camp mode is off, `slots` is omitted.
export interface SessionEntrySlot {
  startTime: string  // 'HH:MM'
  endTime: string    // 'HH:MM'
}

export interface SessionEntry {
  date: string       // 'YYYY-MM-DD'
  startTime: string  // 'HH:MM'
  endTime: string    // 'HH:MM'
  slots?: SessionEntrySlot[]
}
