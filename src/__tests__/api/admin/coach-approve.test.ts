// PILOT-01: /api/admin/coaches/[id]/approve — the signed one-click approval.
// GET is side-effect-free (email link scanners auto-fetch hrefs, so a
// mutating GET could approve a coach with no human click) and renders a
// confirmation page; POST re-verifies everything and performs the approval.
// The token is the only authorisation, so both verbs must fail closed on
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
import { signApproveToken } from '@/lib/admin-approve-token'
import { GET, POST } from '@/app/api/admin/coaches/[id]/approve/route'

type MockFn = jest.Mock

const COACH_ID = 'coach-uuid-approve'
const AUTH_USER_ID = 'auth-user-uuid'
const SUBMITTED_AT = '2026-07-26T09:00:00.000+00:00'

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

  const admin = {
    from: jest.fn().mockReturnValue(coachProfilesTable),
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
  return { admin, updates }
}

function makeReq(token: string | null, id: string = COACH_ID, method: 'GET' | 'POST' = 'GET') {
  const url = token
    ? `http://localhost/api/admin/coaches/${id}/approve?token=${token}`
    : `http://localhost/api/admin/coaches/${id}/approve`
  return {
    // Plain Request cast: jest.setup.ts's Request polyfill can't construct a
    // real NextRequest, and the route only reads request.url.
    req: new Request(url, { method }) as Parameters<typeof GET>[0],
    ctx: { params: Promise.resolve({ id }) },
  }
}

beforeAll(() => {
  process.env.ADMIN_APPROVE_SECRET = 'test-approve-secret'
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(sendCoachApprovedEmail as MockFn).mockResolvedValue(true)
})

describe('GET /api/admin/coaches/[id]/approve (PILOT-01) — side-effect-free confirmation', () => {
  it('renders the confirmation page for a valid token WITHOUT writing or emailing', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token)
    const res = await GET(req, ctx)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Approve this coach?')
    expect(html).toContain('Coach Smithy')
    // The button POSTs back to the same signed URL.
    expect(html).toContain(`method="POST"`)
    expect(html).toContain(`/api/admin/coaches/${COACH_ID}/approve?token=${token}`)

    // Scanner-safety: a GET must never mutate or email.
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('rejects a missing token with 403', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq(null)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('rejects an invalid/tampered token with 403', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')

    const { req, ctx } = makeReq(tampered)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('rejects an expired link (submission older than 7 days) with 403', async () => {
    const nineDaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
    buildAdmin({
      coachRow: makeCoachRow({ submitted_for_review_at: nineDaysAgo }),
    })
    const token = signApproveToken(COACH_ID, nineDaysAgo)

    const { req, ctx } = makeReq(token)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('expired')
  })

  it('shows "Already approved" for an already-live coach instead of the confirm form', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow({ is_profile_live: true }) })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token)
    const res = await GET(req, ctx)

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Already approved')
    expect(html).not.toContain('method="POST"')
    expect(updates).toEqual([])
  })

  it('surfaces the Stripe guard on the confirmation page (409, no form)', async () => {
    buildAdmin({ coachRow: makeCoachRow({ stripe_onboarding_complete: false }) })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token)
    const res = await GET(req, ctx)

    expect(res.status).toBe(409)
    expect(await res.text()).toContain('Stripe')
  })

  it('403s for an unknown coach id without revealing existence', async () => {
    buildAdmin({ coachRow: null, coachError: { message: 'PGRST116: no rows' } })
    const token = signApproveToken('nonexistent-id', SUBMITTED_AT)

    const { req, ctx } = makeReq(token, 'nonexistent-id')
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('not valid')
  })

  it('rejects a never-submitted (draft) coach with the same page as a bad token', async () => {
    buildAdmin({ coachRow: makeCoachRow({ submitted_for_review_at: null }) })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token)
    const res = await GET(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('not valid')
  })
})

describe('POST /api/admin/coaches/[id]/approve (PILOT-01) — the approval itself', () => {
  it('approves with a valid token: sets is_profile_live, emails the coach, success page', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token, COACH_ID, 'POST')
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

  it('re-verifies: rejects a missing token with 403 and writes nothing', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })

    const { req, ctx } = makeReq(null, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('re-verifies: rejects an invalid/tampered token with 403 and writes nothing', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow() })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')

    const { req, ctx } = makeReq(tampered, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('re-verifies: rejects an expired link with 403 and writes nothing', async () => {
    const nineDaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
    const { updates } = buildAdmin({
      coachRow: makeCoachRow({ submitted_for_review_at: nineDaysAgo }),
    })
    const token = signApproveToken(COACH_ID, nineDaysAgo)

    const { req, ctx } = makeReq(token, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(403)
    expect(await res.text()).toContain('expired')
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('is idempotent: an already-live coach returns success without re-sending Email 3', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow({ is_profile_live: true }) })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token, COACH_ID, 'POST')
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
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(409)
    expect(await res.text()).toContain('Stripe')
    expect(updates).toEqual([])
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('still succeeds (approval persisted) when the coach has no email — Email 3 skipped', async () => {
    const { updates } = buildAdmin({ coachRow: makeCoachRow(), userEmail: null })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })

  it('returns 500 and does not email when the liveness update fails', async () => {
    buildAdmin({ coachRow: makeCoachRow(), updateError: { message: 'db down' } })
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)

    const { req, ctx } = makeReq(token, COACH_ID, 'POST')
    const res = await POST(req, ctx)

    expect(res.status).toBe(500)
    expect(sendCoachApprovedEmail).not.toHaveBeenCalled()
  })
})
