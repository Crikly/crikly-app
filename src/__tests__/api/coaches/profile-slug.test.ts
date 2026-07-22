// BUG-38: coach slug generation in POST /api/coaches/profile.
//
// Slugs were generated from user_profiles.full_name — exposing the account
// holder's private name in the public URL. Locked product rule: display_name
// everywhere a coach is publicly visible; full_name only in Settings as
// "Account name". The slug source is now the EFFECTIVE PUBLIC NAME:
// display_name, falling back to full_name only when display_name is unset.
//
// Covered:
//   - display_name set → slug derived from display_name, never full_name
//   - display_name null → slug falls back to full_name (matches how public
//     pages render display_name ?? full_name)
//   - editing full_name does NOT regenerate the slug while display_name is
//     set (approved trigger change — Settings edits must not touch the URL)
//   - editing full_name DOES regenerate when display_name is null (full_name
//     is the effective public name in that state)
//   - missing slug is generated on any POST
//   - existing correct slug is left untouched when unrelated fields change
//   - slug collisions get a -2 suffix (findUniqueSlug behaviour preserved)

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-coach', () => ({
  requireCoachRole: jest.fn(),
  requireCoachContext: jest.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { requireCoachRole } from '@/lib/auth/require-coach'
import { POST } from '@/app/api/coaches/profile/route'

type MockFn = jest.Mock

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COACH_ID = 'coach-uuid-bug38'
const PROFILE_ID = 'profile-uuid-bug38'

function makeUpdatedProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: COACH_ID,
    user_profile_id: PROFILE_ID,
    display_name: 'Coach Smithy',
    bio: null,
    years_experience: null,
    dbs_status: 'none',
    is_profile_live: false,
    is_paused: false,
    stripe_onboarding_complete: false,
    cancellation_window_hours: 24,
    min_advance_hours: 12,
    max_advance_days: 90,
    requires_manual_approval: false,
    travel_radius_miles: null,
    rating_avg: null,
    rating_count: 0,
    sessions_completed: 0,
    gender: null,
    languages: [],
    slug: 'coach-smithy',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    user_profiles: {
      full_name: 'Jonathan Realname',
      avatar_url: null,
      location_city: null,
      location_postcode: null,
    },
    ...overrides,
  }
}

// ── Supabase mock ─────────────────────────────────────────────────────────────
// Tables touched by POST, in order:
//   user_profiles.update().eq()                      (only when body has user fields)
//   coach_profiles.upsert()                          (always)
//   coach_profiles.select(<full list>).eq().single() (always — read-back)
//   coach_profiles.select('id').eq('slug', …)[.neq().]maybeSingle()  (slug uniqueness probes)
//   coach_profiles.update({ slug }).eq('id', …)      (only when slug regenerated)

function buildSupabase(updatedProfile: Record<string, unknown>, takenSlugs: string[] = []) {
  const slugUpdates: Array<Record<string, unknown>> = []
  const uniquenessProbes: string[] = []

  const coachProfilesTable = {
    upsert: jest.fn().mockResolvedValue({ error: null }),
    select: jest.fn((cols: string) => {
      if (cols === 'id') {
        // findUniqueSlug probe: .eq('slug', candidate)[.neq('id', …)].maybeSingle()
        let probed = ''
        interface ProbeChain {
          eq: MockFn
          neq: MockFn
          maybeSingle: MockFn
        }
        const chain: ProbeChain = {
          eq: jest.fn((_col: string, value: string): ProbeChain => {
            probed = value
            uniquenessProbes.push(value)
            return chain
          }),
          neq: jest.fn((): ProbeChain => chain),
          maybeSingle: jest.fn().mockImplementation(() =>
            Promise.resolve({
              data: takenSlugs.includes(probed) ? { id: 'someone-else' } : null,
              error: null,
            }),
          ),
        }
        return chain
      }
      // Full read-back after upsert
      return {
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: updatedProfile, error: null }),
        }),
      }
    }),
    update: jest.fn((values: Record<string, unknown>) => {
      slugUpdates.push(values)
      return { eq: jest.fn().mockResolvedValue({ error: null }) }
    }),
  }

  const userProfilesTable = {
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }

  const supabase = {
    from: jest.fn((table: string) =>
      table === 'coach_profiles' ? coachProfilesTable : userProfilesTable,
    ),
  }

  return { supabase, slugUpdates, uniquenessProbes, coachProfilesTable }
}

function setup(updatedProfile: Record<string, unknown>, takenSlugs: string[] = []) {
  const built = buildSupabase(updatedProfile, takenSlugs)
  ;(createClient as MockFn).mockResolvedValue(built.supabase)
  ;(requireCoachRole as MockFn).mockResolvedValue({
    context: { userProfile: { id: PROFILE_ID } },
    error: null,
  })
  return built
}

function makePost(body: Record<string, unknown>) {
  return new Request('http://localhost/api/coaches/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ── display_name as source ────────────────────────────────────────────────────

describe('POST /api/coaches/profile — slug source (BUG-38)', () => {
  it('derives the slug from display_name, never full_name', async () => {
    const { slugUpdates } = setup(
      makeUpdatedProfile({ display_name: 'Coach Smithy', slug: null }),
    )

    const res = await POST(makePost({ display_name: 'Coach Smithy' }))
    expect(res.status).toBe(200)

    expect(slugUpdates).toEqual([{ slug: 'coach-smithy' }])
    const data = await res.json() as Record<string, unknown>
    expect(data.slug).toBe('coach-smithy')
    // The private account name must never appear in the slug
    expect(String(data.slug)).not.toContain('jonathan')
    expect(String(data.slug)).not.toContain('realname')
  })

  it('falls back to full_name when display_name is null', async () => {
    const { slugUpdates } = setup(
      makeUpdatedProfile({ display_name: null, slug: null }),
    )

    const res = await POST(makePost({ bio: 'hello' }))
    expect(res.status).toBe(200)

    expect(slugUpdates).toEqual([{ slug: 'jonathan-realname' }])
  })

  it('appends a -2 suffix when the display_name slug is taken', async () => {
    const { slugUpdates } = setup(
      makeUpdatedProfile({ display_name: 'Coach Smithy', slug: null }),
      ['coach-smithy'],
    )

    const res = await POST(makePost({ display_name: 'Coach Smithy' }))
    expect(res.status).toBe(200)
    expect(slugUpdates).toEqual([{ slug: 'coach-smithy-2' }])
  })
})

// ── Regeneration trigger ──────────────────────────────────────────────────────

describe('POST /api/coaches/profile — slug regeneration trigger (BUG-38)', () => {
  it('does NOT regenerate the slug when full_name changes while display_name is set', async () => {
    const { slugUpdates, uniquenessProbes } = setup(
      makeUpdatedProfile({
        display_name: 'Coach Smithy',
        slug: 'coach-smithy',
        user_profiles: {
          full_name: 'Jonathan Newname',
          avatar_url: null,
          location_city: null,
          location_postcode: null,
        },
      }),
    )

    const res = await POST(makePost({ full_name: 'Jonathan Newname' }))
    expect(res.status).toBe(200)

    expect(slugUpdates).toEqual([])
    expect(uniquenessProbes).toEqual([])
    const data = await res.json() as Record<string, unknown>
    expect(data.slug).toBe('coach-smithy')
  })

  it('DOES regenerate from full_name when it changes and display_name is null', async () => {
    const { slugUpdates } = setup(
      makeUpdatedProfile({
        display_name: null,
        slug: 'old-name',
        user_profiles: {
          full_name: 'Jonathan Newname',
          avatar_url: null,
          location_city: null,
          location_postcode: null,
        },
      }),
    )

    const res = await POST(makePost({ full_name: 'Jonathan Newname' }))
    expect(res.status).toBe(200)
    expect(slugUpdates).toEqual([{ slug: 'jonathan-newname' }])
  })

  it('regenerates from display_name when display_name changes', async () => {
    const { slugUpdates } = setup(
      makeUpdatedProfile({ display_name: 'CS Cricket Coaching', slug: 'coach-smithy' }),
    )

    const res = await POST(makePost({ display_name: 'CS Cricket Coaching' }))
    expect(res.status).toBe(200)
    expect(slugUpdates).toEqual([{ slug: 'cs-cricket-coaching' }])
  })

  it('generates a missing slug on any POST (display_name source)', async () => {
    const { slugUpdates } = setup(
      makeUpdatedProfile({ display_name: 'Coach Smithy', slug: null }),
    )

    const res = await POST(makePost({ bio: 'unrelated edit' }))
    expect(res.status).toBe(200)
    expect(slugUpdates).toEqual([{ slug: 'coach-smithy' }])
  })

  it('leaves an existing slug untouched when unrelated fields change', async () => {
    const { slugUpdates, uniquenessProbes } = setup(
      makeUpdatedProfile({ display_name: 'Coach Smithy', slug: 'coach-smithy' }),
    )

    const res = await POST(makePost({ bio: 'new bio', years_experience: 5 }))
    expect(res.status).toBe(200)
    expect(slugUpdates).toEqual([])
    expect(uniquenessProbes).toEqual([])
  })
})
