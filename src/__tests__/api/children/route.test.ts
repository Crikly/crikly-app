// P-07 — GET /api/children (list) + POST /api/children (create).
//
// The supabase chains under mock:
//   GET:  parent_profiles → .select().eq().is().maybeSingle()
//         child_profiles  → .select().eq().is().order()
//   POST: sports          → .select().in().eq()
//         child_profiles #1 → .insert().select().single()   (create)
//         child_sports    → .insert()                        (junction rows)
//         child_profiles #2 → .select().eq().single()        (re-fetch)
//         child_profiles (rollback) → .update({deleted_at}).eq()  (SOFT delete)

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

jest.mock('@/lib/auth/require-parent', () => ({
  requireParentRole: jest.fn(),
  requireParentContextOrCreate: jest.fn(),
}))

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  requireParentRole,
  requireParentContextOrCreate,
} from '@/lib/auth/require-parent'
import { CHILD_TOO_OLD_MESSAGE } from '@/lib/children/child-api'
import { GET, POST } from '@/app/api/children/route'

const SPORT_ID = '11111111-2222-3333-4444-555555555555'
const YOUNG_DOB = '2020-03-14'

const CHILD_ROW = {
  id: 'ch-1',
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

const parentProfilesChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
}

const childListChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  order: jest.fn(),
}

const sportsChain = {
  select: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}

const childInsertChain = {
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

const childRefetchChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

const childRollbackChain = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn(),
}

const childSportsInsert = jest.fn()

let childProfilesCalls: Array<
  typeof childListChain | typeof childInsertChain | typeof childRefetchChain | typeof childRollbackChain
> = []

const mockFrom = jest.fn((table: string) => {
  if (table === 'parent_profiles') return parentProfilesChain
  if (table === 'sports') return sportsChain
  if (table === 'child_sports') return { insert: childSportsInsert }
  return childProfilesCalls.shift() ?? childListChain
})

function postRequest(body: unknown): Parameters<typeof POST>[0] {
  return new Request('http://localhost/api/children', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  childProfilesCalls = []

  parentProfilesChain.select.mockReturnThis()
  parentProfilesChain.eq.mockReturnThis()
  parentProfilesChain.is.mockReturnThis()
  parentProfilesChain.maybeSingle.mockResolvedValue({ data: { id: 'pp-1' }, error: null })

  childListChain.select.mockReturnThis()
  childListChain.eq.mockReturnThis()
  childListChain.is.mockReturnThis()
  childListChain.order.mockResolvedValue({ data: [CHILD_ROW], error: null })

  sportsChain.select.mockReturnThis()
  sportsChain.in.mockReturnThis()
  sportsChain.eq.mockResolvedValue({
    data: [{ id: SPORT_ID, name: 'Cricket' }],
    error: null,
  })

  childInsertChain.insert.mockReturnThis()
  childInsertChain.select.mockReturnThis()
  childInsertChain.single.mockResolvedValue({ data: { id: 'ch-1' }, error: null })

  childRefetchChain.select.mockReturnThis()
  childRefetchChain.eq.mockReturnThis()
  childRefetchChain.single.mockResolvedValue({ data: CHILD_ROW, error: null })

  childRollbackChain.update.mockReturnThis()
  childRollbackChain.eq.mockResolvedValue({ error: null })

  childSportsInsert.mockResolvedValue({ error: null })
  ;(createClient as jest.Mock).mockResolvedValue({ from: mockFrom })
  ;(requireParentRole as jest.Mock).mockResolvedValue({
    context: { user: { id: 'auth-1' }, userProfile: { id: 'up-1' } },
    error: null,
  })
  ;(requireParentContextOrCreate as jest.Mock).mockResolvedValue({
    context: {
      user: { id: 'auth-1' },
      userProfile: { id: 'up-1' },
      parentProfile: { id: 'pp-1' },
    },
    error: null,
  })
})

// ─── GET ──────────────────────────────────────────────────────────────────────

describe('GET /api/children', () => {
  it('returns the serialized children list', async () => {
    childProfilesCalls = [childListChain]
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.children).toHaveLength(1)
    expect(body.children[0]).toMatchObject({
      id: 'ch-1',
      full_name: 'Kiran',
      date_of_birth: YOUNG_DOB,
      sports: [{ sport_id: SPORT_ID, sport_name: 'Cricket', skill_level: 'beginner' }],
    })
    expect(typeof body.children[0].age).toBe('number')
    // Ordered by created_at ascending — the identity-colour index order.
    expect(childListChain.order).toHaveBeenCalledWith('created_at', { ascending: true })
  })

  it('returns an empty list when the parent has no parent_profiles row yet', async () => {
    parentProfilesChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ children: [] })
  })

  it('propagates the auth gate error', async () => {
    ;(requireParentRole as jest.Mock).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }),
    })
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

// ─── POST ─────────────────────────────────────────────────────────────────────

describe('POST /api/children', () => {
  it('creates a child with sports and returns 201', async () => {
    childProfilesCalls = [childInsertChain, childRefetchChain]
    const res = await POST(
      postRequest({
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        gender: 'male',
        sports: [{ sport_id: SPORT_ID, skill_level: 'beginner' }],
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.full_name).toBe('Kiran')
    expect(childInsertChain.insert).toHaveBeenCalledWith({
      parent_profile_id: 'pp-1',
      full_name: 'Kiran',
      date_of_birth: YOUNG_DOB,
      gender: 'male',
      medical_notes: null,
    })
    expect(childSportsInsert).toHaveBeenCalledWith([
      { child_profile_id: 'ch-1', sport_id: SPORT_ID, skill_level: 'beginner' },
    ])
  })

  it('creates a child without sports (sport optional, decision D)', async () => {
    childProfilesCalls = [childInsertChain, childRefetchChain]
    const res = await POST(postRequest({ full_name: 'Kiran', date_of_birth: YOUNG_DOB }))
    expect(res.status).toBe(201)
    expect(childSportsInsert).not.toHaveBeenCalled()
  })

  it('400s with field details on validation failure', async () => {
    const res = await POST(postRequest({ full_name: '', date_of_birth: '2005-01-01' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Validation failed')
    expect(body.details).toEqual(
      expect.arrayContaining(['full_name cannot be empty', CHILD_TOO_OLD_MESSAGE]),
    )
  })

  it('400s when a submitted sport is not an active sport', async () => {
    sportsChain.eq.mockResolvedValue({ data: [], error: null })
    const res = await POST(
      postRequest({
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        sports: [{ sport_id: SPORT_ID, skill_level: 'beginner' }],
      }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.details).toEqual(['one or more sports are not available'])
  })

  it('rolls back the child row via SOFT delete when the sports insert fails', async () => {
    childProfilesCalls = [childInsertChain, childRollbackChain]
    childSportsInsert.mockResolvedValue({ error: { message: 'insert failed' } })
    const res = await POST(
      postRequest({
        full_name: 'Kiran',
        date_of_birth: YOUNG_DOB,
        sports: [{ sport_id: SPORT_ID, skill_level: 'beginner' }],
      }),
    )
    expect(res.status).toBe(500)
    // Never a hard DELETE — even a same-request rollback soft-deletes.
    expect(childRollbackChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
    expect(childRollbackChain.eq).toHaveBeenCalledWith('id', 'ch-1')
  })

  it('400s on a non-JSON body', async () => {
    const request = new Request('http://localhost/api/children', {
      method: 'POST',
      body: 'not json',
    }) as Parameters<typeof POST>[0]
    const res = await POST(request)
    expect(res.status).toBe(400)
  })

  it('propagates the auth gate error', async () => {
    ;(requireParentContextOrCreate as jest.Mock).mockResolvedValue({
      context: null,
      error: NextResponse.json({ error: 'Forbidden — parent role required' }, { status: 403 }),
    })
    const res = await POST(postRequest({ full_name: 'Kiran', date_of_birth: YOUNG_DOB }))
    expect(res.status).toBe(403)
  })
})
