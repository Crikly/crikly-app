// Coach lifecycle emails.
//
// PERMANENT: sendCoachWelcomeEmail — fires when a user first selects the Coach
// role (/api/auth/roles).
//
// PILOT (manual approval flow): sendCoachUnderReviewEmail (Email A),
// sendCoachReviewNotification (Email B) and sendCoachApprovedEmail (Email C).
// The senders live here — not src/lib/pilot/ — because they are dispatched from
// permanent routes (/api/coaches/profile); end-of-pilot cleanup removes those
// call sites along with src/lib/pilot/ (accepted in the PILOT-01-v2 Step 0 plan).
//
// All senders NEVER throw — they are fire-and-forget side effects of
// auth/profile/approve responses that must not be able to break them
// (sendOpsAlert pattern). Each returns a boolean for tests and logging only.
//
// From-address is hello@ (not the bookings@ RESEND_FROM_EMAIL default): these
// are relationship emails, and replies should land in the founder inbox.
//
// Template matches the guest booking-confirmation email (emails.ts
// guestEmailWrapper): hosted logo image, 560px max-width, system font stack
// (Gmail strips <head> styles and web fonts — font-family repeated on every
// text-bearing element), Tekly Solutions footer. Duplicated here rather than
// exported from emails.ts to keep that file's booking senders untouched.

import { getResend } from './client'

const LIFECYCLE_FROM = 'Crikly <hello@crikly.app>'
const REVIEW_INBOX = 'hello@crikly.app'

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** Escapes HTML-significant characters (mirrors emails.ts, incl. apostrophe). */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function emailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crikly</title>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:${SANS};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;text-align:left;">

          <!-- Logo. Hosted image with "Crikly" alt fallback if the client blocks images. -->
          <tr>
            <td style="padding:0 0 24px;">
              <img src="https://crikly.app/logo.png" alt="Crikly" height="32" style="height:32px;border:0;display:block;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td>
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 0 0;border-top:1px solid #E2E8F0;">
              <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.6;font-family:${SANS};">
                Crikly &middot; Tekly Solutions Ltd<br />
                &copy; 2026 Tekly Solutions Ltd. All rights reserved.
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
      <td>
        <a href="${url}"
           style="display:inline-block;background:#0077CC;color:#FFFFFF;font-family:${SANS};font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0F172A;font-family:${SANS};letter-spacing:-0.5px;">${text}</h1>`
}

function paragraph(html: string): string {
  return `<p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:${SANS};">${html}</p>`
}

function mutedNote(html: string): string {
  return `<p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;font-family:${SANS};">${html}</p>`
}

// ─── Welcome email (PERMANENT) ───────────────────────────────────────────────

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
      ${heading('Welcome to Crikly 👋')}
      ${paragraph(`Hi ${safeName},`)}
      ${paragraph(
        'Great to have you on board. Crikly connects you with parents and players looking for exactly what you offer — and handles the bookings and payments for you.',
      )}
      ${paragraph('Here&rsquo;s how to get your profile ready:')}
      ${paragraph(
        '1. <strong>Complete your profile</strong> — your bio, sports and photos<br />' +
        '2. <strong>Set your availability</strong> — when and where you coach<br />' +
        '3. <strong>Connect Stripe</strong> — so you get paid, automatically',
      )}
      ${ctaButton('Go to your dashboard', params.dashboardUrl)}
      ${mutedNote('Questions? Just reply to this email — we read everything.')}
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: params.coachEmail,
      subject: 'Welcome to Crikly — let’s get your profile ready',
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

// ─── Email A — profile under review, to coach (PILOT) ────────────────────────

export interface CoachUnderReviewParams {
  coachEmail: string
  coachName: string
  profileUrl: string
}

/** Fires when the coach submits their profile for review (Go live). Never throws. */
export async function sendCoachUnderReviewEmail(
  params: CoachUnderReviewParams,
): Promise<boolean> {
  try {
    const safeName = escapeHtml(params.coachName)
    const body = `
      ${heading('Your profile is under review')}
      ${paragraph(`Hi ${safeName},`)}
      ${paragraph(
        'Thanks for submitting your coaching profile — it&rsquo;s now with our team for review.',
      )}
      ${paragraph(
        'We&rsquo;ll check everything over and email you as soon as your profile is live. This usually takes a few days.',
      )}
      ${ctaButton('View your profile', params.profileUrl)}
      ${mutedNote('Questions? Just reply to this email — we read everything.')}
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: params.coachEmail,
      subject: 'Your Crikly profile is under review',
      html: emailWrapper(body),
    })

    if (error) {
      console.error('[sendCoachUnderReviewEmail] Resend error:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[sendCoachUnderReviewEmail] failed:', err instanceof Error ? err.message : err)
    return false
  }
}

// ─── Email B — internal review notification, to hello@ (PILOT) ───────────────

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
      ${heading('New coach profile for review')}
      ${paragraph(`<strong>${safeName}</strong> has submitted their profile for review.`)}
      <p style="margin:16px 0 0;font-size:14px;color:#334155;line-height:1.8;font-family:${SANS};">
        Sport(s): <strong>${safeSports}</strong><br />
        Location: <strong>${safeLocation}</strong><br />
        Profile: <a href="${params.profileUrl}" style="color:#0077CC;">${params.profileUrl}</a>
      </p>
      ${mutedNote(
        'Note: the profile link only resolves once the coach is live — preview their details in Supabase before approving.',
      )}
      ${ctaButton('Review profile', params.profileUrl)}
      ${mutedNote(
        `Or approve directly: <a href="${params.approveUrl}" style="color:#0077CC;word-break:break-all;">${params.approveUrl}</a>`,
      )}
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: REVIEW_INBOX,
      subject: `New coach profile for review: ${params.coachName}`,
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

// ─── Email C — profile live, to coach (PILOT) ────────────────────────────────

export interface CoachApprovedParams {
  coachEmail: string
  coachName: string
  profileUrl: string
}

/** Fires when the approve POST succeeds. Never throws. */
export async function sendCoachApprovedEmail(
  params: CoachApprovedParams,
): Promise<boolean> {
  try {
    const safeName = escapeHtml(params.coachName)
    const body = `
      ${heading('Your profile is live! 🎉')}
      ${paragraph(`Hi ${safeName},`)}
      ${paragraph(
        'Congratulations — your Crikly profile has been approved and is now live. Parents and players can find you and book sessions instantly.',
      )}
      ${paragraph(
        `Your public profile:<br /><a href="${params.profileUrl}" style="color:#0077CC;font-weight:700;word-break:break-all;">${params.profileUrl}</a>`,
      )}
      ${paragraph(
        'The fastest way to get your first booking: share your profile link with the parents you already coach — WhatsApp works brilliantly for this.',
      )}
      ${ctaButton('View your live profile', params.profileUrl)}
    `

    const { error } = await getResend().emails.send({
      from: LIFECYCLE_FROM,
      to: params.coachEmail,
      subject: 'Your Crikly profile is live! 🎉',
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
