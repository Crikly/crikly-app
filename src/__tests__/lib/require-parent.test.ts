// P-07 — parent-route auth gate (mirrors require-coach semantics).

import {
  requireParentRole,
  requireParentContext,
  requireParentContextOrCreate,
} from '@/lib/auth/require-parent'
import { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const userProfilesChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

const userRolesChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

const parentReadChain = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(),
}

const parentInsertChain = {
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

let parentProfilesCalls: Array<typeof parentReadChain | typeof parentInsertChain> = []

const getUser = jest.fn()

const mockSupabase = {
  auth: { getUser },
  from: jest.fn((table: string) => {
    if (table === 'user_profiles') return userProfilesChain
    if (table === 'user_roles') return userRolesChain
    return parentProfilesCalls.shift() ?? parentReadChain
  }),
} as unknown as SupabaseServerClient

beforeEach(() => {
  jest.clearAllMocks()
  parentProfilesCalls = []

  getUser.mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null })

  userProfilesChain.select.mockReturnThis()
  userProfilesChain.eq.mockReturnThis()
  userProfilesChain.single.mockResolvedValue({ data: { id: 'up-1' }, error: null })

  userRolesChain.select.mockReturnThis()
  userRolesChain.eq.mockReturnThis()
  userRolesChain.single.mockResolvedValue({ data: { role: 'parent' }, error: null })

  parentReadChain.select.mockReturnThis()
  parentReadChain.eq.mockReturnThis()
  parentReadChain.is.mockReturnThis()
  parentReadChain.maybeSingle.mockResolvedValue({ data: { id: 'pp-1' }, error: null })

  parentInsertChain.insert.mockReturnThis()
  parentInsertChain.select.mockReturnThis()
  parentInsertChain.single.mockResolvedValue({ data: { id: 'pp-new' }, error: null })
})

describe('requireParentRole', () => {
  it('returns context for an authenticated parent', async () => {
    const { context, error } = await requireParentRole(mockSupabase)
    expect(error).toBeNull()
    expect(context?.userProfile.id).toBe('up-1')
    expect(userRolesChain.eq).toHaveBeenCalledWith('role', 'parent')
  })

  it('401s with no authenticated user', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const { context, error } = await requireParentRole(mockSupabase)
    expect(context).toBeNull()
    expect(error?.status).toBe(401)
  })

  it('404s with no user_profiles row', async () => {
    userProfilesChain.single.mockResolvedValue({ data: null, error: { message: 'no rows' } })
    const { error } = await requireParentRole(mockSupabase)
    expect(error?.status).toBe(404)
  })

  it('403s without the parent role', async () => {
    userRolesChain.single.mockResolvedValue({ data: null, error: { message: 'no rows' } })
    const { error } = await requireParentRole(mockSupabase)
    expect(error?.status).toBe(403)
  })
})

describe('requireParentContext', () => {
  it('returns the parent profile', async () => {
    parentProfilesCalls = [parentReadChain]
    const { context, error } = await requireParentContext(mockSupabase)
    expect(error).toBeNull()
    expect(context?.parentProfile.id).toBe('pp-1')
  })

  it('404s when the parent_profiles row is missing', async () => {
    parentReadChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    parentProfilesCalls = [parentReadChain]
    const { error } = await requireParentContext(mockSupabase)
    expect(error?.status).toBe(404)
  })
})

describe('requireParentContextOrCreate', () => {
  it('returns the existing parent profile without inserting', async () => {
    parentProfilesCalls = [parentReadChain]
    const { context, error } = await requireParentContextOrCreate(mockSupabase)
    expect(error).toBeNull()
    expect(context?.parentProfile.id).toBe('pp-1')
    expect(parentInsertChain.insert).not.toHaveBeenCalled()
  })

  it('creates the parent_profiles row lazily on first use (REQ-P-005)', async () => {
    parentReadChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    parentProfilesCalls = [parentReadChain, parentInsertChain]
    const { context, error } = await requireParentContextOrCreate(mockSupabase)
    expect(error).toBeNull()
    expect(context?.parentProfile.id).toBe('pp-new')
    expect(parentInsertChain.insert).toHaveBeenCalledWith({ user_profile_id: 'up-1' })
  })

  it('never creates a row for a non-parent (role gate first)', async () => {
    userRolesChain.single.mockResolvedValue({ data: null, error: { message: 'no rows' } })
    const { error } = await requireParentContextOrCreate(mockSupabase)
    expect(error?.status).toBe(403)
    expect(parentInsertChain.insert).not.toHaveBeenCalled()
  })

  it('500s when the insert fails', async () => {
    parentReadChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    parentInsertChain.single.mockResolvedValue({ data: null, error: { message: 'boom' } })
    parentProfilesCalls = [parentReadChain, parentInsertChain]
    const { error } = await requireParentContextOrCreate(mockSupabase)
    expect(error?.status).toBe(500)
  })
})
