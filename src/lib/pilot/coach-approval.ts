// PILOT: manual coach approval logic for /api/admin/coaches/[id]/approve.
// The route file is a thin shell over these handlers — when the pilot ends,
// delete src/lib/pilot/ and the route directory; nothing else imports this.
//
// Authorisation is a shared secret in the approve URL's ?secret= query param,
// compared against server-only ADMIN_APPROVE_SECRET (timing-safe). No HMAC, no
// expiry: the approve link is emailed only to the founder inbox (Email B). The
// secret check runs BEFORE the coach row is loaded, so an unauthorised probe
// learns nothing about any coach's state.
//
// GET is deliberately side-effect-free: email security scanners (Defender
// Safe Links, link-preview bots) auto-fetch every href in inbound mail, so a
// mutating GET could approve a coach without a human click — defeating the
// manual-review gate. All the more important with a non-expiring link. The
// emailed link opens a confirmation page whose single button POSTs the
// approval; the POST re-runs the full verification.
//
// There is no admin session — that is also why this uses the service-role
// client: the clicker has no Supabase session for RLS to evaluate. Documented
// justification (06_SECURITY): scope is a single UPDATE of is_profile_live on
// one row, gated on the secret.
//
// Responses are minimal HTML pages — Lasith opens this from an email client,
// not from the app.

import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCoachApprovedEmail } from '@/lib/resend/coach-lifecycle-emails'

function htmlPage(title: string, bodyHtml: string, status: number): NextResponse {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crikly Admin</title>
</head>
<body style="margin:0;padding:48px 16px;background:#F8FAFC;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:32px;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0F172A;">${title}</h1>
    ${bodyHtml}
  </div>
</body>
</html>`
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function messagePage(title: string, message: string, status: number): NextResponse {
  return htmlPage(title, `<p style="margin:0;font-size:15px;color:#334155;line-height:1.6;">${message}</p>`, status)
}

/** Escapes HTML-significant characters (mirrors emails.ts). */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Timing-safe comparison of the ?secret= param against ADMIN_APPROVE_SECRET.
 * A missing env var can only be a deployment mistake — logged loudly, and the
 * request is rejected (never "fail open").
 */
function isAuthorised(provided: string | null): boolean {
  const secret = process.env.ADMIN_APPROVE_SECRET
  if (!secret) {
    console.error('[pilot/coach-approval] ADMIN_APPROVE_SECRET is not set — rejecting approve request')
    return false
  }
  if (!provided) return false

  const providedBuf = Buffer.from(provided, 'utf8')
  const secretBuf = Buffer.from(secret, 'utf8')
  // timingSafeEqual throws on length mismatch — a wrong-length secret is
  // simply invalid.
  return providedBuf.length === secretBuf.length && timingSafeEqual(providedBuf, secretBuf)
}

interface VerifiedCoach {
  id: string
  isLive: boolean
  stripeReady: boolean
  coachName: string
  safeName: string
  profilePath: string
  authUserId: string
}

/**
 * Shared by GET and POST: checks the secret, then loads the coach — never
 * writes. Secret validity is decided before any DB read, so an unauthorised
 * probe learns nothing about a coach's state (or existence).
 */
async function loadAndVerify(
  id: string,
  secret: string | null,
): Promise<{ ok: true; coach: VerifiedCoach } | { ok: false; res: NextResponse }> {
  if (!isAuthorised(secret)) {
    return { ok: false, res: messagePage('Invalid link', 'This approval link is not valid.', 403) }
  }

  const admin = createAdminClient()

  const { data: coach, error: coachError } = await admin
    .from('coach_profiles')
    .select(`
      id,
      is_profile_live,
      submitted_for_review_at,
      stripe_onboarding_complete,
      display_name,
      slug,
      user_profiles!inner (
        full_name,
        auth_user_id
      )
    `)
    .eq('id', id)
    .single()

  // A coach that never submitted has no business being approved — same page
  // as an unknown id.
  if (coachError || !coach || !coach.submitted_for_review_at) {
    return { ok: false, res: messagePage('Invalid link', 'This approval link is not valid.', 403) }
  }

  const userProfileData = Array.isArray(coach.user_profiles)
    ? coach.user_profiles[0]
    : coach.user_profiles
  const coachName = coach.display_name?.trim() || userProfileData.full_name

  return {
    ok: true,
    coach: {
      id: coach.id,
      isLive: coach.is_profile_live === true,
      stripeReady: coach.stripe_onboarding_complete === true,
      coachName,
      safeName: escapeHtml(coachName),
      profilePath: `crikly.app/coaches/${coach.slug ?? ''}`,
      authUserId: userProfileData.auth_user_id,
    },
  }
}

/**
 * Lasith's clarification on PILOT-01: mirror the C-PAY-03 go-live guard.
 * Stripe was complete at submission time, but the account can regress
 * (e.g. Stripe later requires more information) before approval — never
 * put a coach live without a working payout destination.
 */
function stripeIncompletePage(safeName: string): NextResponse {
  return messagePage(
    'Cannot approve yet',
    `${safeName}&#39;s Stripe payout setup is incomplete (stripe_onboarding_complete is false). ` +
      'Approving now would allow bookings with no payout destination. ' +
      'Check the account in the Stripe dashboard (Tekly Solutions), then retry this link.',
    409,
  )
}

function alreadyApprovedPage(safeName: string, profilePath: string): NextResponse {
  return messagePage(
    'Already approved',
    `${safeName} is already live on ${escapeHtml(profilePath)}. No email was re-sent.`,
    200,
  )
}

/** GET — side-effect-free confirmation page whose button POSTs the approval. */
export async function handleApproveGet(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    const secret = new URL(request.url).searchParams.get('secret')

    const verified = await loadAndVerify(id, secret)
    if (!verified.ok) return verified.res
    const { coach } = verified

    if (coach.isLive) return alreadyApprovedPage(coach.safeName, coach.profilePath)
    if (!coach.stripeReady) return stripeIncompletePage(coach.safeName)

    return htmlPage(
      'Approve this coach?',
      `<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
        <strong>${coach.safeName}</strong> will go live on ${escapeHtml(coach.profilePath)} and
        receive the &ldquo;profile live&rdquo; email.
      </p>
      <form method="POST" action="/api/admin/coaches/${encodeURIComponent(coach.id)}/approve?secret=${encodeURIComponent(secret ?? '')}" style="margin:0;">
        <button type="submit"
          style="display:inline-block;background:#0077CC;color:#FFFFFF;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;border:none;cursor:pointer;padding:14px 32px;border-radius:10px;">
          Approve &amp; go live
        </button>
      </form>`,
      200,
    )
  } catch (error) {
    console.error('[GET /api/admin/coaches/[id]/approve]', error)
    return messagePage('Something went wrong', 'Could not load the approval page. Try the link again in a moment.', 500)
  }
}

/** POST — re-verifies everything, sets the profile live, sends Email C. */
export async function handleApprovePost(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  try {
    const secret = new URL(request.url).searchParams.get('secret')

    // Full re-verification — the POST never trusts what the GET rendered.
    const verified = await loadAndVerify(id, secret)
    if (!verified.ok) return verified.res
    const { coach } = verified

    // Idempotent: a second click (or a re-POST of the form) is a success
    // page, not a duplicate approval or a re-sent Email C.
    if (coach.isLive) return alreadyApprovedPage(coach.safeName, coach.profilePath)
    if (!coach.stripeReady) return stripeIncompletePage(coach.safeName)

    const admin = createAdminClient()
    const { error: updateError } = await admin
      .from('coach_profiles')
      .update({ is_profile_live: true, updated_at: new Date().toISOString() })
      .eq('id', coach.id)

    if (updateError) {
      console.error('[POST /api/admin/coaches/[id]/approve] update error:', updateError)
      return messagePage('Something went wrong', 'Could not approve the profile. Try again in a moment.', 500)
    }

    // Email C — congratulate the coach. Fire-and-forget semantics (the sender
    // never throws); a failed email must not undo or mask the approval.
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(
      coach.authUserId,
    )
    const coachEmail = authUser?.user?.email
    if (coachEmail) {
      await sendCoachApprovedEmail({
        coachEmail,
        coachName: coach.coachName,
        profileUrl: `https://${coach.profilePath}`,
      })
    } else {
      console.error(
        '[POST /api/admin/coaches/[id]/approve] no email for coach — Email C skipped:',
        authUserError ?? 'user has no email',
      )
    }

    return messagePage(
      'Profile approved ✓',
      `${coach.safeName} is now live on ${escapeHtml(coach.profilePath)}.`,
      200,
    )
  } catch (error) {
    console.error('[POST /api/admin/coaches/[id]/approve]', error)
    return messagePage('Something went wrong', 'Could not approve the profile. Try again in a moment.', 500)
  }
}
