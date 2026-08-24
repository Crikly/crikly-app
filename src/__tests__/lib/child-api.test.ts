// P-07 — validation + serialisation rules for /api/children.
// Step 0 decisions under test: name + DOB required (D), gender optional (D/E),
// sport optional with skill required per selected sport (D), medical notes
// optional (C), DOB in the past + under 16 with Player-account copy (F).

import {
  ageFromDateOfBirth,
  CHILD_TOO_OLD_MESSAGE,
  serializeChild,
  validateChildWrite,
  type ChildRowWithSports,
} from '@/lib/children/child-api'

const SPORT_ID = '11111111-2222-3333-4444-555555555555'
const OTHER_SPORT_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa'

// DOBs safe against the real clock: 2020 stays under 16 until 2036;
// 2005 is 16+ from 2021 onward.
const YOUNG_DOB = '2020-03-14'
const ADULT_DOB = '2005-03-14'

describe('ageFromDateOfBirth', () => {
  const today = new Date('2026-08-11T12:00:00Z')

  it('counts whole years, birthday passed', () => {
    expect(ageFromDateOfBirth('2017-03-14', today)).toBe(9)
  })

  it('subtracts a year before the birthday', () => {
    expect(ageFromDateOfBirth('2017-09-01', today)).toBe(8)
  })

  it('treats today as the birthday having passed', () => {
    expect(ageFromDateOfBirth('2017-08-11', today)).toBe(9)
  })
})

describe('validateChildWrite — create mode', () => {
  it('accepts a minimal valid payload (name + DOB only, decision D)', () => {
    const result = validateChildWrite({ full_name: 'Kiran', date_of_birth: YOUNG_DOB }, 'create')
    expect(result.errors).toBeNull()
    expect(result.input?.childFields).toEqual({
      full_name: 'Kiran',
      date_of_birth: YOUNG_DOB,
    })
    expect(result.input?.sports).toBeUndefined()
  })

  it('requires full_name and date_of_birth', () => {
    const result = validateChildWrite({}, 'create')
    expect(result.errors).toEqual(
      expect.arrayContaining(['full_name is required', 'date_of_birth is required']),
    )
  })

  it('rejects a whitespace-only name', () => {
    const result = validateChildWrite({ full_name: '   ', date_of_birth: YOUNG_DOB }, 'create')
    expect(result.errors).toEqual(['full_name cannot be empty'])
  })

  it('trims the name', () => {
    const result = validateChildWrite({ full_name: '  Kiran ', date_of_birth: YOUNG_DOB }, 'create')
    expect(result.input?.childFields.full_name).toBe('Kiran')
  })

  it('rejects an impossible calendar date', () => {
    const result = validateChildWrite({ full_name: 'Kiran', date_of_birth: '2020-02-30' }, 'create')
    expect(result.errors).toEqual(['date_of_birth must be a valid date in YYYY-MM-DD format'])
  })

  it('rejects a future date of birth', () => {
    const result = validateChildWrite({ full_name: 'Kiran', date_of_birth: '2999-01-01' }, 'create')
    expect(result.errors).toEqual(['date_of_birth must be in the past'])
  })

  it('rejects 16+ with the Player-account copy (decision F)', () => {
    const result = validateChildWrite({ full_name: 'Kiran', date_of_birth: ADULT_DOB }, 'create')
    expect(result.errors).toEqual([CHILD_TOO_OLD_MESSAGE])
  })

  it('accepts every migration-048 gender value and null', () => {
    for (const gender of ['male', 'female', 'other', 'prefer_not_to_say', null]) {
      const result = validateChildWrite(
        { full_name: 'Kiran', date_of_birth: YOUNG_DOB, gender },
        'create',
      )
      expect(result.errors).toBeNull()
      expect(result.input?.childFields.gender).toBe(gender)
    }
  })

  it('rejects an unknown gender', () => {
    const result = validateChildWrite(
      { full_name: 'Kiran', date_of_birth: YOUNG_DOB, gender: 'boy' },
      'create',
    )
    expect(result.errors).toEqual([
      'gender must be one of: male, female, other, prefer_not_to_say',
    ])
  })

  it('normalises an empty medical note to null', () => {
    const result = validateChildWrite(
      { full_name: 'Kiran', date_of_birth: YOUNG_DOB, medical_notes: '   ' },
      'create',
    )
    expect(result.errors).toBeNull()
    expect(result.input?.childFields.medical_notes).toBeNull()
  })

  it('accepts a max-length medical note with surrounding whitespace (trim before length check)', () => {
    const result = validateChildWrite(
      { full_name: 'Kiran', date_of_birth: YOUNG_DOB, medical_notes: `  ${'x'.repeat(500)}  ` },
      'create',
    )
    expect(result.errors).toBeNull()
    expect(result.input?.childFields.medical_notes).toBe('x'.repeat(500))
  })

  it('rejects an over-long medical note', () => {
    const result = validateChildWrite(
      { full_name: 'Kiran', date_of_birth: YOUNG_DOB, medical_notes: 'x'.repeat(501) },
      'create',
    )
    expect(result.errors).toEqual(['medical_notes must be 500 characters or less'])
  })

  it('accepts sports with per-sport skill (REQ-P-015)', () => {
    const result = validateChildWrite(
      {
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        sports: [
          { sport_id: SPORT_ID, skill_level: 'beginner' },
          { sport_id: OTHER_SPORT_ID, skill_level: 'advanced' },
        ],
      },
      'create',
    )
    expect(result.errors).toBeNull()
    expect(result.input?.sports).toHaveLength(2)
  })

  it('rejects a sport without a valid skill level', () => {
    const result = validateChildWrite(
      {
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        sports: [{ sport_id: SPORT_ID, skill_level: 'pro' }],
      },
      'create',
    )
    expect(result.errors).toEqual(['skill_level must be one of: beginner, intermediate, advanced'])
  })

  it('rejects a non-UUID sport_id', () => {
    const result = validateChildWrite(
      {
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        sports: [{ sport_id: 'cricket', skill_level: 'beginner' }],
      },
      'create',
    )
    expect(result.errors).toEqual(['each sports entry needs a valid sport_id'])
  })

  it('rejects duplicate sports', () => {
    const result = validateChildWrite(
      {
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        sports: [
          { sport_id: SPORT_ID, skill_level: 'beginner' },
          { sport_id: SPORT_ID, skill_level: 'advanced' },
        ],
      },
      'create',
    )
    expect(result.errors).toEqual(['sports entries must not repeat the same sport'])
  })

  it('rejects a non-object body', () => {
    expect(validateChildWrite(null, 'create').errors).toEqual([
      'Request body must be a JSON object',
    ])
    expect(validateChildWrite([], 'create').errors).toEqual([
      'Request body must be a JSON object',
    ])
  })
})

describe('validateChildWrite — update mode', () => {
  it('accepts an empty object (nothing to change)', () => {
    const result = validateChildWrite({}, 'update')
    expect(result.errors).toBeNull()
    expect(result.input?.childFields).toEqual({})
  })

  it('validates only the provided fields', () => {
    const result = validateChildWrite({ full_name: '' }, 'update')
    expect(result.errors).toEqual(['full_name cannot be empty'])
  })

  it('still applies the under-16 rule to a DOB change', () => {
    const result = validateChildWrite({ date_of_birth: ADULT_DOB }, 'update')
    expect(result.errors).toEqual([CHILD_TOO_OLD_MESSAGE])
  })

  it('accepts sports: [] as a clear-all', () => {
    const result = validateChildWrite({ sports: [] }, 'update')
    expect(result.errors).toBeNull()
    expect(result.input?.sports).toEqual([])
  })
})

describe('serializeChild', () => {
  it('flattens sports joins and computes age', () => {
    const row: ChildRowWithSports = {
      id: 'ch-1',
      full_name: 'Kiran Shah',
      date_of_birth: YOUNG_DOB,
      gender: 'male',
      medical_notes: 'Mild asthma — inhaler in bag',
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
      child_sports: [
        { sport_id: SPORT_ID, skill_level: 'beginner', sports: { name: 'Cricket' } },
        { sport_id: OTHER_SPORT_ID, skill_level: 'advanced', sports: [{ name: 'Tennis' }] },
      ],
    }
    const child = serializeChild(row)
    expect(child.age).toBe(ageFromDateOfBirth(YOUNG_DOB))
    expect(child.sports).toEqual([
      { sport_id: SPORT_ID, sport_name: 'Cricket', skill_level: 'beginner' },
      { sport_id: OTHER_SPORT_ID, sport_name: 'Tennis', skill_level: 'advanced' },
    ])
  })

  it('handles a child with no sports', () => {
    const row: ChildRowWithSports = {
      id: 'ch-2',
      full_name: 'Anaya',
      date_of_birth: YOUNG_DOB,
      gender: null,
      medical_notes: null,
      created_at: '2026-08-01T10:00:00Z',
      updated_at: '2026-08-01T10:00:00Z',
      child_sports: null,
    }
    expect(serializeChild(row).sports).toEqual([])
  })
})
