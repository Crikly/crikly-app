// PILOT: /api/admin/coaches/[id]/approve — one-click approval, protected by
// the ADMIN_APPROVE_SECRET query param (?secret=, timing-safe comparison).
// GET is side-effect-free (email link scanners auto-fetch hrefs, so a
// mutating GET could approve a coach with no human click) and renders a
// confirmation page; POST re-verifies everything and performs the approval.
// The secret is the only authorisation, so both verbs must fail closed on
// every bad input, mirror the C-PAY-03 Stripe guard (Lasith's PILOT-01
// clarification), stay idempotent, and only email the coach on the actual
// draft→live transition.

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/resend/coach-lifecycle-emails', () => ({
  sendCoachApprovedEmail: jest.fn().mockResolvedValue(true),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCoachApprovedEmail } from '@/lib/resend/coach-lifecycle-emails'
import { GET, POST } from '@/app/api/admin/coaches/[id]/approve/route'

type MockFn = jest.Mock

const COACH_ID = 'coach-uuid-approve'
const AUTH_USER_ID = 'auth-user-uuid'
const SUBMITTED_AT = '2026-07-26T09:00:00.000+00:00'
const SECRET = 'test-approve-secret'

function makeCoachRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COACH_ID,
    is_profile_live: false,
    submitted_for_review_at: SUBMITTED_AT,
    stripe_onboarding_complete: true,
    display_name: 'Coach Smithy',
    slug: 'coach-smithy',
    user_profiles: {
      full_name: 'Jonathan Realname',
      auth_user_id: AUTH_USER_ID,
    },
    ...overrides,
  }
}

function buildAdmin(opts: {
  coachRow: Record<string, unknown> | null
  coachError?: { message: string } | null
  updateError?: { message: string } | null
  userEmail?: string | null
}) {
  const updates: Array<Record<string, unknown>> = []

  const coachProfilesTable = {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({
          data: opts.coachRow,
          error: opts.coachError ?? null,
        }),
      }),
    }),
    update: jest.fn((values: Record<string, unknown>) => {
      updates.push(values)
      return { eq: jest.fn().mockResolvedValue({ error: opts.updateError ?? null }) }
    }),
  }

  const from = jest.fn().mockReturnValue(coachProfilesTable)
  const admin = {
    from,
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: {
            user:
              opts.userEmail === null ? null : { email: opts.userEmail ?? 'coach@example.com' },
          },
          error: null,
        }),
      },
    },
  }

  ;(createAdminClient as MockFn).mockReturnValue(admin)
  return { admin, updates, from }
}

function makeReq(secret: string | null, id: string = COACH_ID, method: 'GET' | 'POST' = 'GET') {
  const url = secret !== null
    ? `http://localhost/api/admin/coaches/${id}/approve?secret=${encodeURIComponent(secret)}`
    : `http://localhost/api/admin/coaches/${id}/approve`
  return {
    // Plain Request cast: jest.setup.ts's Request polyfill can't construct a
    // real NextRequest, and the route only reads request.url.
    req: new Request(url, { method }) as Parameters<typeof GET>[0],
    ctx: { params: Promise.resolve({ id }) },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.ADMIN_APPROVE_SECRET = SECRET
  ;(sendCoachApprovedEmail as MockFn).mockResolvedValue(true)
})

describe('GET /api/admin/coaches/[id]/approve (PILOT) — side-effect-free confirmation', () => {
  it('renders the confirmation page for a valid secret WITHOUT writing or emailing', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq(SECRET)
    const res = await GET(req, ctx)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Approve this coach?')
    expect(html).toContain('Coach Smithy')
    // The button POSTs back to the same secret-carrying URL.
    expect(html).toContain(`method="POST"`)
    expect(html).toContain(`/api/admin/coaches/${COACH_ID}/approve?secret=${SECRET}`)

    // Scanner-safety: a GET must never mutate or email.
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('rejects a missing secret with 403 before touching the database', async () => {
    const { updates, from } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq(null)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('rejects a wrong secret with 403 before touching the database', async () => {
    const { updates, from } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq('wrong-secret')
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('not valid')
    expect(from).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it('rejects a same-length wrong secret with 403 (timing-safe path)', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    const sameLength = SECRET.replace(/.$/, SECRET.endsWith('x') ? 'y' : 'x')

    const { req, ctx } = makeReq(sameLength)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('fails closed with 403 when ADMIN_APPROVE_SECRET is not configured', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    delete process.env.ADMIN_APPROVE_SECRET

    const { req, ctx } = makeReq(SECRET)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('shows "Already approved" for an already-live coach instead of the confirm form', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow({ is_profile_live: true }) })

    const { req, ctx } = makeReq(SECRET)
    const res = await GET(req, ctx)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Already approved')
    expect(html).not.toContain('method="POST"')
    expect(updates).toEqual([])
  })

  it('surfaces the Stripe guard on the confirmation page (409, no form)', async () => {
    buildAdmin({ coachRow: makeCoachRow({ stripe_onboarding_complete: false }) })

    const { req, ctx } = makeReq(SECRET)
    const res = await GET(req, ctx)

    expect(res.status).toBe(409)
    expect(await res.text()).toContain('Stripe')
  })

  it('403s for an unknown coach id', async () => {
    buildAdmin({ coachRow: null, coachError: { message: 'PGRST116: no rows' } })

    const { req, ctx } = makeReq(SECRET, 'nonexistent-id')
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('not valid')
  })

  it('rejects a never-submitted (draft) coach with the same page as an unknown id', async () => {
    buildAdmin({ coachRow: makeCoachRow({ submitted_for_review_at: null }) })

    const { req, ctx } = makeReq(SECRET)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('not valid')
  })
})

describe('POST /api/admin/coaches/[id]/approve (PILOT) — the approval itself', () => {
  it('approves with a valid secret: sets is_profile_live, emails the coach, success page', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq(SECRET, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Profile approved')
    expect(html).toContain('Coach Smithy')
    expect(html).toContain('crikly.app/coaches/coach-smithy')

    expect(updates).toHaveLength(1)
    expect(updates[0].is_profile_live).toBe(true)

    expect(sendCoachApprovedEmail).toHaveBeenCalledTimes(1)
    const call = (sendCoachApprovedEmail as MockFn).mock.calls[0][0] as Record<string, string>
    expect(call.coachEmail).toBe('coach@example.com')
    expect(call.profileUrl).toBe('https://crikly.app/coaches/coach-smithy')
  })

  it('re-verifies: rejects a missing secret with 403 and writes nothing', async () => {
    const { updates, from } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq(null, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('re-verifies: rejects a wrong secret with 403 and writes nothing', async () => {
    const { updates, from } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq('wrong-secret', COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('re-verifies: fails closed with 403 when ADMIN_APPROVE_SECRET is not configured', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    delete process.env.ADMIN_APPROVE_SECRET

    const { req, ctx } = makeReq(SECRET, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('is idempotent: an already-live coach returns success without re-sending Email C', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow({ is_profile_live: true }) })

    const { req, ctx } = makeReq(SECRET, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Already approved')
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it("refuses to approve when Stripe onboarding is incomplete (Lasith's PILOT-01 clarification)", async () => {
    const { updates } = buildAdmin({
      coachRow: makeCoachRow({ stripe_onboarding_complete: false }),
    })

    const { req, ctx } = makeReq(SECRET, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(409)
    expect(await res.text()).toContain('Stripe')
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('still succeeds (approval persisted) when the coach has no email — Email C skipped', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow(), userEmail: null })

    const { req, ctx } = makeReq(SECRET, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('returns 500 and does not email when the liveness update fails', async () => {
    buildAdmin({ coachRow: makeCoachRow(), updateError: { message: 'db down' } })

    const { req, ctx } = makeReq(SECRET, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(500)
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })
})
