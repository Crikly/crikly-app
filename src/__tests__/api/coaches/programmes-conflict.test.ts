// BUG-18: POST /api/coaches/programmes must reject any session that overlaps
// something already committed for the coach on that date (recurring availability,
// ad-hoc slot, another programme session, or a confirmed booking) — via
// getCoachCommitments — BEFORE inserting the programme.

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({ getAll: () => [], set: jest.fn() })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

// Keep the real findFirstConflict; stub only the DB-touching getCoachCommitments.
jest.mock('@/lib/availability/commitments', () => {
  const actual = jest.requireActual('@/lib/availability/commitments')
  return { ...actual, getCoachCommitments: jest.fn() }
})

import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCoachCommitments } from '@/lib/availability/commitments'

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeChain() {
  const c: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'neq', 'is', 'in', 'gte', 'lte', 'or', 'order', 'limit', 'upsert', 'insert', 'update', 'delete', 'not']) {
    c[m] = jest.fn(() => c)
  }
  c.single = jest.fn()
  c.maybeSingle = jest.fn()
  return c
}

const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockSupabase = { auth: { getUser: mockGetUser }, from: mockFrom }

beforeEach(() => {
  jest.clearAllMocks()
  ;(createServerClient as jest.Mock).mockReturnValue(mockSupabase)
})

// requireCoachContext (user_profiles single → role + coach in parallel) + the
// coach_sports ownership check = 4 from() calls on the SSR client.
function mockAuthAndSport() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  mockFrom
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'profile-uuid' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { role: 'coach' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'coach-uuid' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'coach-sport-uuid' }, error: null })
      return c
    })
}

async function callPost(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/coaches/programmes/route')
  const request = new Request('http://localhost/api/coaches/programmes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return POST(request as unknown as NextRequest)
}

const baseBody = {
  sport_id: 'sport-1',
  title: 'Saturday Cricket',
  schedule_type: 'fixed',
  day_of_week: 0,
  start_time: '10:00',
  duration_minutes: 60,
  max_spots: 10,
  payment_type: 'per_session',
  price_per_session_pence: 2000,
}

describe('POST /api/coaches/programmes — session conflict guard (BUG-18)', () => {
  it('returns 409 when a session overlaps an existing commitment', async () => {
    mockAuthAndSport()
    ;(createAdminClient as jest.Mock).mockReturnValue({}) // unused once helper is mocked
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([
      { startMinutes: 600, endMinutes: 660, source: 'ad_hoc', label: 'an ad-hoc slot' },
    ])

    const res = await callPost({
      ...baseBody,
      session_dates: [{ date: '2026-07-05', startTime: '10:00', endTime: '11:00' }],
    })

    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('Conflict detected')
    expect(data.message).toContain('an ad-hoc slot')
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      'coach-uuid',
      '2026-07-05',
    )
  })

  it('checks every session date and does NOT insert when a later session conflicts', async () => {
    mockAuthAndSport()
    // Insert must never be reached — a bare admin object would throw on .from().
    const adminFrom = jest.fn()
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: adminFrom })
    ;(getCoachCommitments as jest.Mock)
      .mockResolvedValueOnce([]) // first date clear
      .mockResolvedValueOnce([
        { startMinutes: 600, endMinutes: 660, source: 'programme', label: 'a programme session' },
      ]) // second date conflicts

    const res = await callPost({
      ...baseBody,
      session_dates: [
        { date: '2026-07-05', startTime: '10:00', endTime: '11:00' },
        { date: '2026-07-12', startTime: '10:00', endTime: '11:00' },
      ],
    })

    expect(res.status).toBe(409)
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledTimes(2)
    expect(adminFrom).not.toHaveBeenCalled() // guard aborts before any insert
  })

  it('proceeds to creation (201) when no session conflicts', async () => {
    mockAuthAndSport()
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([]) // every date clear

    const newProgramme = {
      id: 'prog-1',
      sport_id: 'sport-1',
      title: 'Saturday Cricket',
      description: null,
      schedule_type: 'fixed',
      day_of_week: 0,
      days_of_week: [0],
      start_time: '10:00:00',
      duration_minutes: 60,
      max_spots: 10,
      current_spots: 0,
      payment_type: 'per_session',
      price_per_session_pence: 2000,
      block_price_pence: null,
      block_session_count: null,
      currency: 'GBP',
      status: 'draft',
      created_at: '2026-07-01T00:00:00Z',
      venue_name: null,
      venue_address: null,
      min_participants: null,
      cancellation_window_hours: 24,
      image_url: null,
      age_groups: [],
      starts_at: '2026-07-05T00:00:00.000Z',
    }

    // Admin client: group_programmes insert→select→single resolves the row;
    // group_programme_sessions insert (awaited directly) resolves via then().
    const adminChain: Record<string, unknown> = {}
    for (const m of ['insert', 'select', 'eq', 'is', 'in', 'update', 'upsert', 'delete']) {
      adminChain[m] = jest.fn(() => adminChain)
    }
    adminChain.single = jest.fn().mockResolvedValue({ data: newProgramme, error: null })
    adminChain.then = (resolve: (r: unknown) => void) => resolve({ data: null, error: null })
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => adminChain) })

    // After insert the route fetches the sport name on the SSR client (5th from()).
    mockFrom.mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { name: 'Cricket' }, error: null })
      return c
    })

    const res = await callPost({
      ...baseBody,
      session_dates: [
        { date: '2026-07-05', startTime: '10:00', endTime: '11:00' },
        { date: '2026-07-12', startTime: '10:00', endTime: '11:00' },
      ],
    })

    expect(res.status).toBe(201)
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledTimes(2)
    const data = await res.json()
    expect(data.id).toBe('prog-1')
  })

  it('returns a clean 409 when the DB exclusion constraint rejects the session insert (23P01, BUG-19 Phase 2)', async () => {
    mockAuthAndSport()
    // App-level guard saw no conflict (race window) — the coach_time_claims
    // trigger is the backstop and rejects the insert with 23P01.
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([])

    const newProgramme = { id: 'prog-1', sport_id: 'sport-1' }

    const adminChain: Record<string, unknown> = {}
    for (const m of ['insert', 'select', 'eq', 'is', 'in', 'update', 'upsert', 'delete']) {
      adminChain[m] = jest.fn(() => adminChain)
    }
    adminChain.single = jest.fn().mockResolvedValue({ data: newProgramme, error: null })
    // The awaited sessions insert resolves with the exclusion violation; the
    // rollback soft-delete reuses the same thenable (its result is unchecked).
    adminChain.then = (resolve: (r: unknown) => void) =>
      resolve({
        data: null,
        error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "no_overlapping_active_claims"' },
      })
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => adminChain) })

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callPost({
        ...baseBody,
        session_dates: [{ date: '2026-07-05', startTime: '10:00', endTime: '11:00' }],
      })

      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('Conflict detected')
      expect(String(data.message)).toContain('overlaps')
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// ─── PATCH conflict guard (BUG-18) ──────────────────────────────────────────────

async function callPatch(programmeId: string, body: Record<string, unknown>) {
  const { PATCH } = await import('@/app/api/coaches/programmes/[programmeId]/route')
  const request = new Request(`http://localhost/api/coaches/programmes/${programmeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(request as unknown as NextRequest, { params: Promise.resolve({ programmeId }) })
}

// requireCoachContext = 3 SSR from() calls (user_profiles single → role + coach).
function mockPatchAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })
  mockFrom
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'profile-uuid' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { role: 'coach' }, error: null })
      return c
    })
    .mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { id: 'coach-uuid' }, error: null })
      return c
    })
}

// Admin client for PATCH: a single chain whose .single resolves the existing
// programme then (on the happy path) the updated programme, and whose thenable
// resolves the session-reconciliation / re-fetch queries to empty sets.
function makePatchAdmin(existing: Record<string, unknown>, updated?: Record<string, unknown>) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'in', 'order', 'gte', 'lte', 'not']) {
    chain[m] = jest.fn(() => chain)
  }
  const single = jest.fn()
  single.mockResolvedValueOnce({ data: existing, error: null })
  if (updated) single.mockResolvedValueOnce({ data: updated, error: null })
  chain.single = single
  chain.then = (resolve: (r: unknown) => void) => resolve({ data: [], error: null })
  const adminFrom = jest.fn(() => chain)
  ;(createAdminClient as jest.Mock).mockReturnValue({ from: adminFrom })
  return { adminFrom }
}

const fullProgramme = {
  id: 'prog-1',
  sport_id: 'sport-1',
  title: 'Saturday Cricket',
  description: null,
  schedule_type: 'fixed',
  day_of_week: 0,
  days_of_week: [0],
  start_time: '10:00:00',
  duration_minutes: 60,
  max_spots: 10,
  current_spots: 0,
  payment_type: 'per_session',
  price_per_session_pence: 2000,
  block_price_pence: null,
  block_session_count: null,
  currency: 'GBP',
  status: 'draft',
  created_at: '2026-07-01T00:00:00Z',
  venue_name: null,
  venue_address: null,
  skill_level: 'all',
  session_count: 1,
  min_participants: null,
  cancellation_window_hours: 24,
  image_url: null,
  age_groups: [],
  starts_at: '2026-07-05T00:00:00.000Z',
  ends_at: null,
  camp_mode: false,
}

describe('PATCH /api/coaches/programmes/[programmeId] — session conflict guard (BUG-18)', () => {
  it('returns 409 when an edited session conflicts, before any update', async () => {
    mockPatchAuth()
    const { adminFrom } = makePatchAdmin({
      id: 'prog-1', status: 'draft', current_spots: 0, schedule_type: 'fixed', days_of_week: [0], day_of_week: 0, session_count: 1, starts_at: null, ends_at: null, camp_mode: false,
    })
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([
      { startMinutes: 600, endMinutes: 660, source: 'programme', label: 'a programme session' },
    ])

    const res = await callPatch('prog-1', {
      session_dates: [{ date: '2026-07-05', startTime: '10:00', endTime: '11:00' }],
    })

    expect(res.status).toBe(409)
    // Only the existing-programme SELECT ran on admin — no update/upsert reached.
    expect(adminFrom).toHaveBeenCalledTimes(1)
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      'coach-uuid',
      '2026-07-05',
      { excludeProgrammeId: 'prog-1' },
    )
  })

  it('skips the guard for a locked programme (current_spots > 0) and still updates', async () => {
    mockPatchAuth()
    makePatchAdmin(
      { id: 'prog-1', status: 'active', current_spots: 5, schedule_type: 'fixed', days_of_week: [0], day_of_week: 0, session_count: 1, starts_at: null, ends_at: null, camp_mode: false },
      { ...fullProgramme, current_spots: 5, status: 'active' },
    )
    // Sport-name fetch on the SSR client after the update.
    mockFrom.mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { name: 'Cricket' }, error: null })
      return c
    })

    const res = await callPatch('prog-1', {
      session_dates: [{ date: '2026-07-05', startTime: '10:00', endTime: '11:00' }],
    })

    expect(res.status).toBe(200)
    // Guard is bypassed while enrolments exist — no commitment lookups.
    expect(getCoachCommitments as jest.Mock).not.toHaveBeenCalled()
  })

  it('proceeds to update (200) when no edited session conflicts', async () => {
    mockPatchAuth()
    makePatchAdmin(
      { id: 'prog-1', status: 'draft', current_spots: 0, schedule_type: 'fixed', days_of_week: [0], day_of_week: 0, session_count: 1, starts_at: null, ends_at: null, camp_mode: false },
      fullProgramme,
    )
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([]) // every date clear
    mockFrom.mockImplementationOnce(() => {
      const c = makeChain()
      c.single.mockResolvedValue({ data: { name: 'Cricket' }, error: null })
      return c
    })

    const res = await callPatch('prog-1', {
      session_dates: [
        { date: '2026-07-05', startTime: '10:00', endTime: '11:00' },
        { date: '2026-07-12', startTime: '10:00', endTime: '11:00' },
      ],
    })

    expect(res.status).toBe(200)
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledTimes(2)
    expect(getCoachCommitments as jest.Mock).toHaveBeenCalledWith(
      expect.anything(),
      'coach-uuid',
      '2026-07-12',
      { excludeProgrammeId: 'prog-1' },
    )
  })

  // ── DB exclusion backstop (BUG-19 Phase 2) ─────────────────────────────────
  //
  // The coach_time_claims trigger (migration 038) can reject a PATCH with
  // SQLSTATE 23P01 at two points: the programme UPDATE (a status change
  // cascades claim reactivation) and the session UPSERT (an edited time now
  // overlaps another commitment). Both must surface as the same clean 409 the
  // app-level guard produces — never a raw 500.

  it('returns 409 Conflict detected when the programme UPDATE is rejected with 23P01', async () => {
    mockPatchAuth()
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'in', 'order', 'gte', 'lte', 'not']) {
      chain[m] = jest.fn(() => chain)
    }
    const single = jest.fn()
    // 1st single: existing-programme ownership check (draft → active is a
    // valid transition); 2nd: the UPDATE fails — the status-change trigger's
    // claim cascade hit the exclusion constraint.
    single.mockResolvedValueOnce({
      data: { id: 'prog-1', status: 'draft', current_spots: 0, schedule_type: 'fixed', days_of_week: [0], day_of_week: 0, session_count: 1, starts_at: null, ends_at: null, camp_mode: false },
      error: null,
    })
    single.mockResolvedValueOnce({
      data: null,
      error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "no_overlapping_active_claims"' },
    })
    chain.single = single
    chain.then = (resolve: (r: unknown) => void) => resolve({ data: [], error: null })
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) })

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callPatch('prog-1', { status: 'active' })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('Conflict detected')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('returns 409 Conflict detected when the session UPSERT is rejected with 23P01', async () => {
    mockPatchAuth()
    ;(getCoachCommitments as jest.Mock).mockResolvedValue([]) // app guard saw no conflict (race window)

    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'in', 'order', 'gte', 'lte', 'not']) {
      chain[m] = jest.fn(() => chain)
    }
    const single = jest.fn()
    single.mockResolvedValueOnce({
      data: { id: 'prog-1', status: 'draft', current_spots: 0, schedule_type: 'fixed', days_of_week: [0], day_of_week: 0, session_count: 1, starts_at: null, ends_at: null, camp_mode: false },
      error: null,
    })
    single.mockResolvedValueOnce({ data: fullProgramme, error: null })
    chain.single = single
    // Thenables in call order after the update: existing-sessions fetch (ok),
    // then the UPSERT — rejected by the exclusion constraint.
    const thenResults = [
      { data: [], error: null },
      { data: null, error: { code: '23P01', message: 'conflicting key value violates exclusion constraint "no_overlapping_active_claims"' } },
    ]
    chain.then = (resolve: (r: unknown) => void) =>
      resolve(thenResults.length > 1 ? thenResults.shift() : thenResults[0])
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) })

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const res = await callPatch('prog-1', {
        session_dates: [{ date: '2026-07-05', startTime: '10:00', endTime: '11:00' }],
      })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error).toBe('Conflict detected')
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// ── DELETE — camp participant guard (BUG-23 review blocker) ───────────────────
//
// Camp capacity is per SLOT, so current_spots stays 0 forever — the old
// `current_spots > 0` guard silently no-oped for camps and a fully-paid camp
// could be soft-deleted. Camps now check the enrolments table directly.

async function callDelete(programmeId: string) {
  const { DELETE } = await import('@/app/api/coaches/programmes/[programmeId]/route')
  const request = new Request(`http://localhost/api/coaches/programmes/${programmeId}`, {
    method: 'DELETE',
  })
  return DELETE(request as unknown as NextRequest, { params: Promise.resolve({ programmeId }) })
}

function makeDeleteAdmin(existing: Record<string, unknown>, participantCount: number) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'or', 'update']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.single = jest.fn().mockResolvedValue({ data: existing, error: null })
  // Awaited thenables: the participant head-count resolves {count}; the
  // soft-delete update destructures {error} from the same shape (null → ok).
  chain.then = (resolve: (r: unknown) => void) => resolve({ count: participantCount, error: null })
  ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) })
  return chain
}

describe('DELETE /api/coaches/programmes/[programmeId] — camp participant guard (BUG-23)', () => {
  it('blocks deleting an active camp with a paid participant even though current_spots is 0', async () => {
    mockPatchAuth()
    makeDeleteAdmin({ id: 'prog-1', status: 'active', current_spots: 0, camp_mode: true }, 1)

    const res = await callDelete('prog-1')
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(String(data.error)).toContain('active enrolments')
  })

  it('allows deleting an active camp with no participants', async () => {
    mockPatchAuth()
    makeDeleteAdmin({ id: 'prog-1', status: 'active', current_spots: 0, camp_mode: true }, 0)

    const res = await callDelete('prog-1')
    expect(res.status).toBe(200)
  })

  it('non-camp guard unchanged: active programme with current_spots > 0 still blocks', async () => {
    mockPatchAuth()
    makeDeleteAdmin({ id: 'prog-1', status: 'active', current_spots: 3, camp_mode: false }, 0)

    const res = await callDelete('prog-1')
    expect(res.status).toBe(400)
  })
})
