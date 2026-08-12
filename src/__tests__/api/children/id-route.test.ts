// P-07 — GET / PATCH / DELETE /api/children/[id].
//
// child_profiles chains in call order (fetchOwnedChild → mutations → re-fetch):
//   GET:    fetch
//   PATCH:  fetch → .update().eq().eq() → fetch (re-fetch)
//   DELETE: .update().eq().eq().is().select()

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-parent', () => ({
  requireParentContext: jest.fn(),
}))

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireParentContext } from '@/lib/auth/require-parent'
import { GET, PATCH, DELETE } from '@/app/api/children/[id]/route'

const CHILD_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const SPORT_ID = '11111111-2222-3333-4444-555555555555'
const NEW_SPORT_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa'
const YOUNG_DOB = '2020-03-14'

const CHILD_ROW = {
  id: CHILD_ID,
  full_name: 'Kiran',
  date_of_birth: YOUNG_DOB,
  gender: 'male',
  medical_notes: null,
  created_at: '2026-08-01T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  child_sports: [
    { sport_id: SPORT_ID, skill_level: 'beginner', sports: { name: 'Cricket' } },
  ],
}

// ─── Chains ───────────────────────────────────────────────────────────────────

function makeFetchChain() {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: CHILD_ROW, error: null }),
  }
}

const childUpdateChain = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}

const softDeleteChain = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  select: jest.fn(),
}

const sportsChain = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}

const childSportsDeleteChain = {
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}

const childSportsInsert = jest.fn()

let childProfilesCalls: Array<Record<string, jest.Mock>> = []
let childSportsCalls: Array<Record<string, jest.Mock>> = []

const mockFrom = jest.fn((table: string) => {
  if (table === 'sports') return sportsChain
  if (table === 'child_sports') {
    return childSportsCalls.shift() ?? { insert: childSportsInsert }
  }
  return childProfilesCalls.shift() ?? makeFetchChain()
})

const routeParams = { params: Promise.resolve({ id: CHILD_ID }) }

function request(method: string, body?: unknown): Parameters<typeof PATCH>[0] {
  return new Request(`http://localhost/api/children/${CHILD_ID}`, {
    method,
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  }) as Parameters<typeof PATCH>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  childProfilesCalls = []
  childSportsCalls = []

  childUpdateChain.update.mockReturnThis()
  // update().eq('id').eq('parent_profile_id') — the second eq resolves.
  childUpdateChain.eq.mockImplementation(function (this: unknown) {
    return { eq: jest.fn().mockResolvedValue({ error: null }) }
  })

  softDeleteChain.update.mockReturnThis()
  softDeleteChain.eq.mockReturnThis()
  softDeleteChain.is.mockReturnThis()
  softDeleteChain.select.mockResolvedValue({ data: [{ id: CHILD_ID }], error: null })

  sportsChain.select.mockReturnThis()
  sportsChain.in.mockReturnThis()
  sportsChain.eq.mockResolvedValue({
    data: [{ id: NEW_SPORT_ID, name: 'Tennis' }],
    error: null,
  })

  childSportsDeleteChain.delete.mockReturnThis()
  childSportsDeleteChain.eq.mockResolvedValue({ error: null })

  childSportsInsert.mockResolvedValue({ error: null })
  ;(createClient as jest.Mock).mockResolvedValue({ from: mockFrom })
  ;(requireParentContext as jest.Mock).mockResolvedValue({
    context: {
      user: { id: 'auth-1' },
      userProfile: { id: 'up-1' },
      parentProfile: { id: 'pp-1' },
    },
    error: null,
  })
})

// ─── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/children/[id]', () => {
  it('returns the child with sports', async () => {
    const fetchChain = makeFetchChain()
    childProfilesCalls = [fetchChain]
    const res = await GET(request('GET'), routeParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(CHILD_ID)
    expect(body.sports).toEqual([
      { sport_id: SPORT_ID, sport_name: 'Cricket', skill_level: 'beginner' },
    ])
    // Ownership filter is explicit, not RLS-only (defence in depth).
    expect(fetchChain.eq).toHaveBeenCalledWith('parent_profile_id', 'pp-1')
  })

  it('404s for a child the parent does not own', async () => {
    const fetchChain = makeFetchChain()
    fetchChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    childProfilesCalls = [fetchChain]
    const res = await GET(request('GET'), routeParams)
    expect(res.status).toBe(404)
  })

  it('404s for a non-UUID id without touching the database', async () => {
    const res = await GET(request('GET'), { params: Promise.resolve({ id: 'not-a-uuid' }) })
    expect(res.status).toBe(404)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('propagates the auth gate error', async () => {
    ;(requireParentContext as jest.Mock).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    })
    const res = await GET(request('GET'), routeParams)
    expect(res.status).toBe(401)
  })
})

// ─── PATCH ────────────────────────────────────────────────────────────────────

describe('PATCH /api/children/[id]', () => {
  it('updates profile fields', async () => {
    childProfilesCalls = [makeFetchChain(), childUpdateChain, makeFetchChain()]
    const res = await PATCH(request('PATCH', { full_name: 'Kiran S', gender: null }), routeParams)
    expect(res.status).toBe(200)
    expect(childUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Kiran S', gender: null }),
    )
  })

  it('replaces child_sports when sports is provided', async () => {
    childProfilesCalls = [makeFetchChain(), makeFetchChain()]
    childSportsCalls = [childSportsDeleteChain, { insert: childSportsInsert }]
    const res = await PATCH(
      request('PATCH', { sports: [{ sport_id: NEW_SPORT_ID, skill_level: 'intermediate' }] }),
      routeParams,
    )
    expect(res.status).toBe(200)
    expect(childSportsDeleteChain.eq).toHaveBeenCalledWith('child_profile_id', CHILD_ID)
    expect(childSportsInsert).toHaveBeenCalledWith([
      { child_profile_id: CHILD_ID, sport_id: NEW_SPORT_ID, skill_level: 'intermediate' },
    ])
  })

  it('clears all sports with sports: []', async () => {
    childProfilesCalls = [makeFetchChain(), makeFetchChain()]
    childSportsCalls = [childSportsDeleteChain]
    const res = await PATCH(request('PATCH', { sports: [] }), routeParams)
    expect(res.status).toBe(200)
    expect(childSportsDeleteChain.delete).toHaveBeenCalled()
    expect(childSportsInsert).not.toHaveBeenCalled()
  })

  it('restores the previous sports when the replacement insert fails', async () => {
    const failingInsert = jest.fn().mockResolvedValue({ error: { message: 'boom' } })
    const restoreInsert = jest.fn().mockResolvedValue({ error: null })
    childProfilesCalls = [makeFetchChain()]
    childSportsCalls = [
      childSportsDeleteChain,
      { insert: failingInsert },
      { insert: restoreInsert },
    ]
    const res = await PATCH(
      request('PATCH', { sports: [{ sport_id: NEW_SPORT_ID, skill_level: 'intermediate' }] }),
      routeParams,
    )
    expect(res.status).toBe(500)
    expect(restoreInsert).toHaveBeenCalledWith([
      { child_profile_id: CHILD_ID, sport_id: SPORT_ID, skill_level: 'beginner' },
    ])
  })

  it('400s on validation failure', async () => {
    const res = await PATCH(request('PATCH', { date_of_birth: '2999-01-01' }), routeParams)
    expect(res.status).toBe(400)
  })

  it('404s when the child is not owned', async () => {
    const fetchChain = makeFetchChain()
    fetchChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    childProfilesCalls = [fetchChain]
    const res = await PATCH(request('PATCH', { full_name: 'X' }), routeParams)
    expect(res.status).toBe(404)
  })

  it('400s when a submitted sport is not active', async () => {
    childProfilesCalls = [makeFetchChain()]
    sportsChain.eq.mockResolvedValue({ data: [], error: null })
    const res = await PATCH(
      request('PATCH', { sports: [{ sport_id: NEW_SPORT_ID, skill_level: 'beginner' }] }),
      routeParams,
    )
    expect(res.status).toBe(400)
  })
})

// ─── DELETE ───────────────────────────────────────────────────────────────────

describe('DELETE /api/children/[id]', () => {
  it('soft deletes (sets deleted_at, never hard DELETE)', async () => {
    childProfilesCalls = [softDeleteChain]
    const res = await DELETE(request('DELETE'), routeParams)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(softDeleteChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
    expect(softDeleteChain.eq).toHaveBeenCalledWith('parent_profile_id', 'pp-1')
    // Only a not-yet-deleted row qualifies — repeat DELETE 404s.
    expect(softDeleteChain.is).toHaveBeenCalledWith('deleted_at', null)
  })

  it('404s when nothing was deleted (not owned or already deleted)', async () => {
    softDeleteChain.select.mockResolvedValue({ data: [], error: null })
    childProfilesCalls = [softDeleteChain]
    const res = await DELETE(request('DELETE'), routeParams)
    expect(res.status).toBe(404)
  })

  it('propagates the auth gate error', async () => {
    ;(requireParentContext as jest.Mock).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    })
    const res = await DELETE(request('DELETE'), routeParams)
    expect(res.status).toBe(401)
  })
})
