// PILOT-01: the three coach-lifecycle emails for the pilot's manual approval
// flow. All three senders NEVER throw — they are fire-and-forget side effects
// of auth/profile/approve responses that must not be able to break them
// (sendOpsAlert pattern). Each returns a boolean for tests and logging only.
//
// From-address is hello@ (not the bookings@ RESEND_FROM_EMAIL default): these
// are relationship emails, and replies should land in the founder inbox.

import { getResend } from './client'

const LIFECYCLE_FROM = 'Crikly <hello@crikly.app>'
const REVIEW_INBOX = 'hello@crikly.app'

/** Escapes HTML-significant characters (mirrors emails.ts, incl. apostrophe). */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Same shell as emails.ts emailWrapper — duplicated here rather than exported
// from emails.ts to keep that file's booking senders untouched (PILOT-01 must
// not modify booking email code paths).
function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crikly</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'DM Sans',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#0077CC;border-radius:12px 12px 0 0;padding:24px 32px;">
              <span style="font-family:'DM Sans',Arial,sans-serif;font-size:22px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px;">Crikly</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#FFFFFF;padding:32px;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F1F5F9;border-radius:0 0 12px 12px;border:1px solid #E2E8F0;border-top:none;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94A3B8;font-family:'DM Sans',Arial,sans-serif;">
                © 2026 Crikly · <a href="https://crikly.app" style="color:#94A3B8;text-decoration:none;">crikly.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(label: string, url: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
    <tr>
      <td align="center">
        <a href="${url}"
           style="display:inline-block;background:#0077CC;color:#FFFFFF;font-family:'DM Sans',Arial,sans-serif;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:-0.2px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`
}

// ─── Email 1 — coach registration welcome ────────────────────────────────────

export interface CoachWelcomeParams {
  coachEmail: string
  coachName: string
  dashboardUrl: string
}

/** Fires when a user first selects the Coach role. Never throws. */
export async function sendCoachWelcomeEmail(
  params: CoachWelcomeParams,
): Promise<boolean> {
  try {
    const safeName = escapeHtml(params.coachName)
    const body = `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;font-family:'DM Sans',Arial,sans-serif;letter-spacing:-0.5px;">
        Welcome to Crikly 👋
      </h1>
      <p style="margin:0 0 4px;font-size:16px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;">
        Hi ${safeName},
      </p>
      <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        You&rsquo;re registered as a coach on Crikly — great to have you on board.
      </p>
      <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        Next step: complete your coaching profile and submit it for review.
        Once it&rsquo;s approved, your profile goes live and parents and players
        can find and book you.
      </p>

      ${ctaButton('Complete your profile', params.dashboardUrl)}

      <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        Questions? Just reply to this email — we read everything.
      </p>
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: params.coachEmail,
      subject: 'Welcome to Crikly — you’re registered as a coach',
      html: emailWrapper(body),
    })

    if (error) {
      console.error('[sendCoachWelcomeEmail] Resend error:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[sendCoachWelcomeEmail] failed:', err instanceof Error ? err.message : err)
    return false
  }
}

// ─── Email 2 — internal review notification (to Lasith) ─────────────────────

export interface CoachReviewNotificationParams {
  coachName: string
  sports: string[]
  location: string | null
  profileUrl: string
  approveUrl: string
}

/** Fires when a coach submits their profile for review. Never throws. */
export async function sendCoachReviewNotification(
  params: CoachReviewNotificationParams,
): Promise<boolean> {
  try {
    const safeName = escapeHtml(params.coachName)
    const safeSports = params.sports.length > 0
      ? escapeHtml(params.sports.join(', '))
      : 'Not specified'
    const safeLocation = params.location ? escapeHtml(params.location) : 'Not specified'

    const body = `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;font-family:'DM Sans',Arial,sans-serif;letter-spacing:-0.5px;">
        New coach profile ready for review
      </h1>
      <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        <strong>${safeName}</strong> has submitted their profile for review.
      </p>
      <p style="margin:16px 0 0;font-size:14px;color:#334155;line-height:1.8;font-family:'DM Sans',Arial,sans-serif;">
        Sport(s): <strong>${safeSports}</strong><br />
        Location: <strong>${safeLocation}</strong><br />
        Profile: <a href="${params.profileUrl}" style="color:#0077CC;">${params.profileUrl}</a>
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        Note: the profile link only resolves once the coach is live — preview
        their details in Supabase before approving. The approve link below is
        valid for 7 days.
      </p>

      ${ctaButton('Approve & go live', params.approveUrl)}
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: REVIEW_INBOX,
      subject: `New coach profile ready for review: ${params.coachName}`,
      html: emailWrapper(body),
    })

    if (error) {
      console.error('[sendCoachReviewNotification] Resend error:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[sendCoachReviewNotification] failed:', err instanceof Error ? err.message : err)
    return false
  }
}

// ─── Email 3 — coach approved / profile live ─────────────────────────────────

export interface CoachApprovedParams {
  coachEmail: string
  coachName: string
  profileUrl: string
}

/** Fires when Lasith approves the profile via the signed link. Never throws. */
export async function sendCoachApprovedEmail(
  params: CoachApprovedParams,
): Promise<boolean> {
  try {
    const safeName = escapeHtml(params.coachName)
    const body = `
      <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;font-family:'DM Sans',Arial,sans-serif;letter-spacing:-0.5px;">
        Your profile is live! 🎉
      </h1>
      <p style="margin:0 0 4px;font-size:16px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;">
        Hi ${safeName},
      </p>
      <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        Congratulations — your Crikly profile has been approved and is now live.
        Parents and players can find you and book sessions instantly.
      </p>
      <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        Your public profile:
        <a href="${params.profileUrl}" style="color:#0077CC;">${params.profileUrl}</a>
      </p>
      <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
        The fastest way to get your first booking: share your profile link with
        the parents you already coach — WhatsApp works brilliantly for this.
      </p>

      ${ctaButton('View your live profile', params.profileUrl)}
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: params.coachEmail,
      subject: 'Your Crikly profile is live!',
      html: emailWrapper(body),
    })

    if (error) {
      console.error('[sendCoachApprovedEmail] Resend error:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[sendCoachApprovedEmail] failed:', err instanceof Error ? err.message : err)
    return false
  }
}
