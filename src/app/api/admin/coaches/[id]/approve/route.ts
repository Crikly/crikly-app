// PILOT-01: one-click coach approval from the review email (Email 2).
//
// GET  /api/admin/coaches/[id]/approve?token=<hmac>  → verify + confirmation page (NO writes)
// POST /api/admin/coaches/[id]/approve?token=<hmac>  → verify again + set live + Email 3
//
// The GET is deliberately side-effect-free: email security scanners
// (Defender Safe Links, link-preview bots) auto-fetch every href in inbound
// mail, so a mutating GET could approve a coach without a human click —
// defeating the manual-review gate PILOT-01 exists to enforce. The emailed
// link opens a confirmation page whose single button POSTs the approval.
// The POST re-runs the full verification — it never trusts the GET.
//
// There is no admin session — the HMAC token IS the authorisation (signed
// with server-only ADMIN_APPROVE_SECRET over coach_profile_id + the row's
// submitted_for_review_at; see src/lib/admin-approve-token.ts). That is also
// why this route uses the service-role client: the clicker has no Supabase
// session for RLS to evaluate. Documented justification (06_SECURITY): scope
// is a single UPDATE of is_profile_live on one row, gated on a valid token.
//
// Responses are minimal HTML pages — Lasith opens this from an email client,
// not from the app.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyApproveToken } from '@/lib/admin-approve-token'
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
  }) as NextResponse
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
 * Shared by GET and POST: loads the coach and verifies the token — never
 * writes. Authorisation ordering: token validity is decided before any
 * business-state branching, so an unauthenticated probe learns nothing about
 * a coach's state (every failure short of expiry reads "Invalid link").
 */
async function loadAndVerify(
  id: string,
  token: string | null,
): Promise<{ ok: true; coach: VerifiedCoach } | { ok: false; res: NextResponse }> {
  if (!token) {
    return { ok: false, res: messagePage('Missing token', 'This approval link is incomplete. Use the link from the review email.', 403) }
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

  // Unknown coach and never-submitted coach both collapse into the same page
  // as a bad token: a valid signature over this exact row is the only thing
  // that distinguishes outcomes, so probing leaks nothing.
  if (coachError || !coach || !coach.submitted_for_review_at) {
    return { ok: false, res: messagePage('Invalid link', 'This approval link is not valid.', 403) }
  }

  const verdict = verifyApproveToken({
    token,
    coachProfileId: coach.id,
    submittedForReviewAtIso: coach.submitted_for_review_at,
  })
  if (verdict === 'expired') {
    return {
      ok: false,
      res: messagePage(
        'Link expired',
        'This approval link has expired (7 days). Ask the coach to submit their profile again to generate a fresh one.',
        403,
      ),
    }
  }
  if (verdict !== 'valid') {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const token = new URL(request.url).searchParams.get('token')

    const verified = await loadAndVerify(id, token)
    if (!verified.ok) return verified.res
    const { coach } = verified

    if (coach.isLive) return alreadyApprovedPage(coach.safeName, coach.profilePath)
    if (!coach.stripeReady) return stripeIncompletePage(coach.safeName)

    // Side-effect-free confirmation: the button POSTs back to this URL.
    return htmlPage(
      'Approve this coach?',
      `<p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
        <strong>${coach.safeName}</strong> will go live on ${escapeHtml(coach.profilePath)} and
        receive the &ldquo;profile live&rdquo; email.
      </p>
      <form method="POST" action="/api/admin/coaches/${encodeURIComponent(coach.id)}/approve?token=${encodeURIComponent(token ?? '')}" style="margin:0;">
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params
    const token = new URL(request.url).searchParams.get('token')

    // Full re-verification — the POST never trusts what the GET rendered.
    const verified = await loadAndVerify(id, token)
    if (!verified.ok) return verified.res
    const { coach } = verified

    // Idempotent: a second click (or a re-POST of the form) is a success
    // page, not a duplicate approval or a re-sent Email 3.
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

    // Email 3 — congratulate the coach. Fire-and-forget semantics (the sender
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
        '[POST /api/admin/coaches/[id]/approve] no email for coach — Email 3 skipped:',
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
