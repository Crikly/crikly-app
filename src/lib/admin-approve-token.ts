// PILOT-01: signed one-click approve links for the pilot's manual coach
// review. There is no admin session — the HMAC token in the emailed URL IS the
// authorisation, so the secret must never reach the browser (server-only env).
//
// Token = HMAC-SHA256(ADMIN_APPROVE_SECRET, `${coachProfileId}.${submittedForReviewAtIso}`)
// No expiry is embedded: submitted_for_review_at lives in the DB and is part
// of the signed payload, so the route derives expiry from the row (7 days) and
// a re-submission automatically invalidates previously issued links.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const APPROVE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

// Lazy env read (Fix-BUILD-02 pattern): a module-level throw would crash
// next build page-data collection in envs without the secret.
function getSecret(): string {
  const secret = process.env.ADMIN_APPROVE_SECRET
  if (!secret) {
    throw new Error('ADMIN_APPROVE_SECRET is not set')
  }
  return secret
}

export function signApproveToken(
  coachProfileId: string,
  submittedForReviewAtIso: string,
): string {
  return createHmac('sha256', getSecret())
    .update(`${coachProfileId}.${submittedForReviewAtIso}`)
    .digest('hex')
}

export type ApproveTokenVerdict = 'valid' | 'invalid' | 'expired'

export function verifyApproveToken(params: {
  token: string
  coachProfileId: string
  submittedForReviewAtIso: string
  now?: Date
}): ApproveTokenVerdict {
  const { token, coachProfileId, submittedForReviewAtIso } = params

  const expected = signApproveToken(coachProfileId, submittedForReviewAtIso)
  const expectedBuf = Buffer.from(expected, 'utf8')
  const tokenBuf = Buffer.from(token, 'utf8')
  // timingSafeEqual throws on length mismatch — a wrong-length token is
  // simply invalid.
  if (
    tokenBuf.length !== expectedBuf.length ||
    !timingSafeEqual(tokenBuf, expectedBuf)
  ) {
    return 'invalid'
  }

  const submittedAtMs = Date.parse(submittedForReviewAtIso)
  if (Number.isNaN(submittedAtMs)) return 'invalid'
  const nowMs = (params.now ?? new Date()).getTime()
  if (nowMs > submittedAtMs + APPROVE_TOKEN_TTL_MS) return 'expired'

  return 'valid'
}
