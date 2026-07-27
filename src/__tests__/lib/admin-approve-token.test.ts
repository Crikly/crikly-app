// PILOT-01: HMAC approve-token sign/verify. The token authorises a one-click
// admin approval with no session, so tampering and expiry are the whole game.

import {
  signApproveToken,
  verifyApproveToken,
  APPROVE_TOKEN_TTL_MS,
} from '@/lib/admin-approve-token'

const COACH_ID = 'e5b7c9c2-1111-4222-8333-444455556666'
const SUBMITTED_AT = '2026-07-20T10:00:00.000+00:00'

beforeAll(() => {
  process.env.ADMIN_APPROVE_SECRET = 'test-approve-secret'
})

describe('admin-approve-token', () => {
  it('round-trips: a signed token verifies as valid within the TTL', () => {
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)
    expect(
      verifyApproveToken({
        token,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
        now: new Date('2026-07-21T10:00:00Z'),
      }),
    ).toBe('valid')
  })

  it('rejects a tampered token', () => {
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a')
    expect(
      verifyApproveToken({
        token: tampered,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
        now: new Date('2026-07-21T10:00:00Z'),
      }),
    ).toBe('invalid')
  })

  it('rejects a wrong-length token without throwing (timingSafeEqual guard)', () => {
    expect(
      verifyApproveToken({
        token: 'short',
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
      }),
    ).toBe('invalid')
  })

  it('rejects a token minted for a different coach', () => {
    const token = signApproveToken('other-coach-id', SUBMITTED_AT)
    expect(
      verifyApproveToken({
        token,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
        now: new Date('2026-07-21T10:00:00Z'),
      }),
    ).toBe('invalid')
  })

  it('rejects a token minted for a different submission timestamp (re-submission rotates links)', () => {
    const token = signApproveToken(COACH_ID, '2026-07-19T10:00:00.000+00:00')
    expect(
      verifyApproveToken({
        token,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
        now: new Date('2026-07-21T10:00:00Z'),
      }),
    ).toBe('invalid')
  })

  it('expires exactly after 7 days', () => {
    const token = signApproveToken(COACH_ID, SUBMITTED_AT)
    const submittedMs = Date.parse(SUBMITTED_AT)

    expect(
      verifyApproveToken({
        token,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
        now: new Date(submittedMs + APPROVE_TOKEN_TTL_MS),
      }),
    ).toBe('valid')

    expect(
      verifyApproveToken({
        token,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: SUBMITTED_AT,
        now: new Date(submittedMs + APPROVE_TOKEN_TTL_MS + 1),
      }),
    ).toBe('expired')
  })

  it('treats an unparseable stored timestamp as invalid, not expired', () => {
    const token = signApproveToken(COACH_ID, 'not-a-date')
    expect(
      verifyApproveToken({
        token,
        coachProfileId: COACH_ID,
        submittedForReviewAtIso: 'not-a-date',
      }),
    ).toBe('invalid')
  })

  it('throws when ADMIN_APPROVE_SECRET is unset', () => {
    const saved = process.env.ADMIN_APPROVE_SECRET
    delete process.env.ADMIN_APPROVE_SECRET
    try {
      expect(() => signApproveToken(COACH_ID, SUBMITTED_AT)).toThrow('ADMIN_APPROVE_SECRET')
    } finally {
      process.env.ADMIN_APPROVE_SECRET = saved
    }
  })
})
