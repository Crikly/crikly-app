// P-07: shared validation + serialisation for the /api/children routes.
//
// Field rules (Step 0 decisions C/D/E/F):
//   - full_name required (the form's "First name" — child_profiles has no
//     first-name column, full_name only; see src/constants/childIdentity.ts)
//   - date_of_birth required: real calendar date, in the past, age under 16
//     (16+ are Player accounts, BR-09)
//   - gender optional — the migration-048 enum
//   - medical_notes optional ("Safety note for coaches", BR-08: always
//     visible to confirmed coaches — no share toggle applies)
//   - sports optional; when a sport is selected its skill_level is required
//     (per-sport skill lives on child_sports, REQ-P-015 / migration 050)

// Type-only import — erased at compile time, so this lib stays free of the
// next/headers runtime dependency the server client carries.
import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export const CHILD_GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const
export type ChildGender = (typeof CHILD_GENDERS)[number]

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]

export const MAX_CHILD_NAME_LENGTH = 100
export const MAX_MEDICAL_NOTES_LENGTH = 500
export const CHILD_MAX_AGE_EXCLUSIVE = 16

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/

export const CHILD_TOO_OLD_MESSAGE =
  `Children must be under ${CHILD_MAX_AGE_EXCLUSIVE}. If they're ${CHILD_MAX_AGE_EXCLUSIVE} or over, they can create their own Player account.`

export interface ChildSportInput {
  sport_id: string
  skill_level: SkillLevel
}

export interface ChildWriteInput {
  full_name?: string
  date_of_birth?: string
  gender?: ChildGender | null
  medical_notes?: string | null
  sports?: ChildSportInput[]
}

export interface ChildSportResponse {
  sport_id: string
  sport_name: string
  skill_level: string
}

export interface ChildResponse {
  id: string
  full_name: string
  date_of_birth: string
  age: number
  gender: string | null
  medical_notes: string | null
  sports: ChildSportResponse[]
  created_at: string
  updated_at: string
}

/** Whole-year age from an ISO date-only string, in UTC (date-only data). */
export function ageFromDateOfBirth(dateOfBirth: string, today: Date = new Date()): number {
  const [year = 0, month = 0, day = 0] = dateOfBirth.split('-').map(Number)
  let age = today.getUTCFullYear() - year
  const birthdayPassed =
    today.getUTCMonth() + 1 > month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() >= day)
  if (!birthdayPassed) age -= 1
  return age
}

function isRealDate(value: string): boolean {
  if (!DOB_RE.test(value)) return false
  const [year = 0, month = 0, day = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

interface ValidatedChildWrite {
  childFields: {
    full_name?: string
    date_of_birth?: string
    gender?: ChildGender | null
    medical_notes?: string | null
  }
  sports?: ChildSportInput[]
}

/**
 * Validates a create (mode 'create': name + DOB required) or update
 * (mode 'update': all fields optional, only provided ones validated)
 * payload. Returns trimmed, DB-ready fields or a list of error strings.
 */
export function validateChildWrite(
  body: unknown,
  mode: 'create' | 'update',
):
  | { input: ValidatedChildWrite; errors: null }
  | { input: null; errors: string[] } {
  const errors: string[] = []

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { input: null, errors: ['Request body must be a JSON object'] }
  }
  const raw = body as Record<string, unknown>
  const childFields: ValidatedChildWrite['childFields'] = {}
  let sports: ChildSportInput[] | undefined

  // full_name
  if (raw.full_name !== undefined) {
    if (typeof raw.full_name !== 'string') {
      errors.push('full_name must be a string')
    } else if (raw.full_name.trim().length === 0) {
      errors.push('full_name cannot be empty')
    } else if (raw.full_name.trim().length > MAX_CHILD_NAME_LENGTH) {
      errors.push(`full_name must be ${MAX_CHILD_NAME_LENGTH} characters or less`)
    } else {
      childFields.full_name = raw.full_name.trim()
    }
  } else if (mode === 'create') {
    errors.push('full_name is required')
  }

  // date_of_birth
  if (raw.date_of_birth !== undefined) {
    if (typeof raw.date_of_birth !== 'string' || !isRealDate(raw.date_of_birth)) {
      errors.push('date_of_birth must be a valid date in YYYY-MM-DD format')
    } else {
      const age = ageFromDateOfBirth(raw.date_of_birth)
      if (age < 0) {
        errors.push('date_of_birth must be in the past')
      } else if (age >= CHILD_MAX_AGE_EXCLUSIVE) {
        errors.push(CHILD_TOO_OLD_MESSAGE)
      } else {
        childFields.date_of_birth = raw.date_of_birth
      }
    }
  } else if (mode === 'create') {
    errors.push('date_of_birth is required')
  }

  // gender (optional; null clears)
  if (raw.gender !== undefined) {
    if (raw.gender === null) {
      childFields.gender = null
    } else if (
      typeof raw.gender !== 'string' ||
      !CHILD_GENDERS.includes(raw.gender as ChildGender)
    ) {
      errors.push(`gender must be one of: ${CHILD_GENDERS.join(', ')}`)
    } else {
      childFields.gender = raw.gender as ChildGender
    }
  }

  // medical_notes (optional; null or empty string clears). Trim before the
  // length check — surrounding whitespace must not fail an otherwise-valid note.
  if (raw.medical_notes !== undefined) {
    if (raw.medical_notes === null) {
      childFields.medical_notes = null
    } else if (typeof raw.medical_notes !== 'string') {
      errors.push('medical_notes must be a string')
    } else {
      const trimmed = raw.medical_notes.trim()
      if (trimmed.length > MAX_MEDICAL_NOTES_LENGTH) {
        errors.push(`medical_notes must be ${MAX_MEDICAL_NOTES_LENGTH} characters or less`)
      } else {
        childFields.medical_notes = trimmed.length > 0 ? trimmed : null
      }
    }
  }

  // sports (optional; [] clears all)
  if (raw.sports !== undefined) {
    if (!Array.isArray(raw.sports)) {
      errors.push('sports must be an array')
    } else {
      const parsed: ChildSportInput[] = []
      const seen = new Set<string>()
      for (const entry of raw.sports) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          errors.push('each sports entry must be an object with sport_id and skill_level')
          continue
        }
        const { sport_id, skill_level } = entry as Record<string, unknown>
        if (typeof sport_id !== 'string' || !UUID_RE.test(sport_id)) {
          errors.push('each sports entry needs a valid sport_id')
          continue
        }
        if (
          typeof skill_level !== 'string' ||
          !SKILL_LEVELS.includes(skill_level as SkillLevel)
        ) {
          errors.push(`skill_level must be one of: ${SKILL_LEVELS.join(', ')}`)
          continue
        }
        if (seen.has(sport_id)) {
          errors.push('sports entries must not repeat the same sport')
          continue
        }
        seen.add(sport_id)
        parsed.push({ sport_id, skill_level: skill_level as SkillLevel })
      }
      sports = parsed
    }
  }

  if (errors.length > 0) return { input: null, errors }
  return { input: { childFields, sports }, errors: null }
}

// Supabase nested joins come back object-or-array depending on inferred
// cardinality (same normalisation as parent/dashboard/page.tsx).
function firstOf<T>(value: T | T[] | null): T | null {
  if (value === null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export interface ChildRowWithSports {
  id: string
  full_name: string
  date_of_birth: string
  gender: string | null
  medical_notes: string | null
  created_at: string
  updated_at: string
  child_sports: Array<{
    sport_id: string
    skill_level: string
    sports: { name: string } | { name: string }[] | null
  }> | null
}

export function serializeChild(row: ChildRowWithSports): ChildResponse {
  return {
    id: row.id,
    full_name: row.full_name,
    date_of_birth: row.date_of_birth,
    age: ageFromDateOfBirth(row.date_of_birth),
    gender: row.gender,
    medical_notes: row.medical_notes,
    sports: (row.child_sports ?? []).map((sport) => ({
      sport_id: sport.sport_id,
      sport_name: firstOf(sport.sports)?.name ?? '',
      skill_level: sport.skill_level,
    })),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Verifies every submitted sport_id is a real, active sport. Shared by
 * POST /api/children and PATCH /api/children/[id]. Sport names for the
 * response come from the CHILD_SELECT join, not from here.
 */
export async function verifyActiveSports(
  supabase: SupabaseServerClient,
  sports: ChildSportInput[],
): Promise<boolean> {
  if (sports.length === 0) return true
  const ids = sports.map((sport) => sport.sport_id)
  const { data, error } = await supabase
    .from('sports')
    .select('id')
    .in('id', ids)
    .eq('is_active', true)
  if (error) throw new Error(`sports lookup failed: ${error.message}`)
  const found = new Set((data ?? []).map((sport) => sport.id))
  return ids.every((id) => found.has(id))
}

/** The SELECT used by every /api/children read (list + detail + re-fetch). */
export const CHILD_SELECT = `
  id,
  full_name,
  date_of_birth,
  gender,
  medical_notes,
  created_at,
  updated_at,
  child_sports (
    sport_id,
    skill_level,
    sports ( name )
  )
`
