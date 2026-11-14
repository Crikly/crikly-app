// STAGE1-CANCEL-OFFLINE (Decision T-21, 14 Nov 2026): emails sent when a coach
// cancels a programme that has paid enrolments.
//
// In the pilot, programme cancellations and refunds happen OUTSIDE the
// platform: the coach refunds parents directly and Crikly neither refunds nor
// reverses a transfer. These three emails are the safeguard:
//   → each paid parent  — the programme is cancelled; the coach arranges the refund
//   → the coach         — a reminder of that duty, with who to refund and how much
//   → ops (Lasith)      — a copy, including any fee Crikly has not yet paid out
//
// All senders NEVER throw and return a boolean (sendOpsAlert pattern) — an
// email failure must never undo or fail the cancellation itself.
//
// PRIVACY: recipient addresses are never logged. Error logs carry Resend's
// error code only, never its message (which can echo the address).
//
// Template helpers are duplicated here rather than exported from emails.ts or
// coach-lifecycle-emails.ts so those files' live senders stay untouched.

import { getResend } from './client'

const PARENT_COACH_FROM = 'Crikly <hello@crikly.app>'
const OPS_FROM = 'Crikly Alerts <alerts@crikly.app>'
const SUPPORT_EMAIL = 'hello@crikly.app'

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const RATE_LIMIT_RETRY_MS = 1100

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Escapes HTML-significant characters (mirrors emails.ts, incl. apostrophe). */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Integer pence → "£60.00". Display only — money stays in pence everywhere else. */
function formatPence(pence: number, currency: string): string {
  const amount = (pence / 100).toFixed(2)
  return currency === 'GBP' ? `£${amount}` : `${amount} ${currency}`
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
          <tr>
            <td style="padding:0 0 24px;">
              <img src="https://crikly.app/logo.png" alt="Crikly" height="32" style="height:32px;border:0;display:block;" />
            </td>
          </tr>
          <tr>
            <td>
              ${bodyHtml}
            </td>
          </tr>
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

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#0F172A;font-family:${SANS};letter-spacing:-0.5px;">${text}</h1>`
}

function paragraph(html: string): string {
  return `<p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:${SANS};">${html}</p>`
}

function table(headers: string[], rows: string[][]): string {
  const th = headers
    .map(
      (h) =>
        `<th align="left" style="padding:8px 12px 8px 0;font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid #E2E8F0;font-family:${SANS};">${h}</th>`,
    )
    .join('')
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map(
            (c) =>
              `<td style="padding:10px 12px 10px 0;font-size:13px;color:#0F172A;border-bottom:1px solid #F1F5F9;vertical-align:top;font-family:${SANS};">${c}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;border-collapse:collapse;"><tr>${th}</tr>${body}</table>`
}

/** "1 parent" / "3 parents". */
function parentCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'parent' : 'parents'}`
}

interface SendPayload {
  from: string
  to: string
  subject: string
  html: string
  replyTo?: string
}

/**
 * Sends one email. Never throws. Retries exactly once when Resend rate-limits
 * (a cancellation fans out to several recipients back to back).
 */
async function sendSafely(label: string, payload: SendPayload): Promise<boolean> {
  try {
    let { error } = await getResend().emails.send(payload)
    if (error?.name === 'rate_limit_exceeded') {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS))
      ;({ error } = await getResend().emails.send(payload))
    }
    if (error) {
      console.error(`[${label}] Resend error: ${error.name}`)
      return false
    }
    return true
  } catch (err) {
    console.error(`[${label}] failed: ${err instanceof Error ? err.name : 'unknown error'}`)
    return false
  }
}

// ─── Parent email ─────────────────────────────────────────────────────────────

export interface CancelledPlace {
  /** Who the place was for — null when no participant name was recorded. */
  participantName: string | null
  enrolmentReference: string | null
  /** What the parent paid, integer pence — null on legacy rows with no snapshot. */
  amountPaidPence: number | null
  currency: string
}

export interface ProgrammeCancelledParentParams {
  parentEmail: string
  parentName: string
  coachName: string
  programmeTitle: string
  /** Every paid place this parent holds on the programme (one email per parent). */
  places: CancelledPlace[]
  /** Ops address for Reply-To. Omitted → replies go to hello@crikly.app. */
  replyTo?: string
}

function placeLine(place: CancelledPlace): string {
  const who = place.participantName ? escapeHtml(place.participantName) : 'Your place'
  const ref = place.enrolmentReference ? ` (reference ${escapeHtml(place.enrolmentReference)})` : ''
  const paid =
    place.amountPaidPence !== null
      ? `: you paid ${formatPence(place.amountPaidPence, place.currency)}`
      : ''
  return `${who}${ref}${paid}`
}

export async function sendProgrammeCancelledToParent(
  params: ProgrammeCancelledParentParams,
): Promise<boolean> {
  const { parentEmail, parentName, coachName, programmeTitle, places, replyTo } = params
  const safeName = escapeHtml(parentName)
  const safeCoach = escapeHtml(coachName)
  const safeTitle = escapeHtml(programmeTitle)

  const placesHtml = places
    .map(
      (p) =>
        `<li style="margin:0 0 6px;font-size:15px;color:#334155;line-height:1.6;font-family:${SANS};">${placeLine(p)}</li>`,
    )
    .join('')

  const body = `
    ${heading(`${safeTitle} has been cancelled`)}
    ${paragraph(`Hi ${safeName},`)}
    ${paragraph(`We&rsquo;re sorry to tell you that ${safeCoach} has cancelled ${safeTitle}. The sessions you booked will not go ahead.`)}
    <ul style="margin:16px 0 0;padding:0 0 0 20px;">${placesHtml}</ul>
    ${paragraph(`<strong>Your refund.</strong> Programme fees are paid to your coach shortly after you buy, so ${safeCoach} will arrange your refund with you directly. Crikly does not refund programme fees.`)}
    ${paragraph(`If you have not heard from ${safeCoach} within 5 days, reply to this email and we&rsquo;ll help you get in touch.`)}
  `

  return sendSafely('sendProgrammeCancelledToParent', {
    from: PARENT_COACH_FROM,
    to: parentEmail,
    subject: `${programmeTitle} has been cancelled`,
    html: emailWrapper(body),
    ...(replyTo ? { replyTo } : {}),
  })
}

// ─── Coach email ──────────────────────────────────────────────────────────────

export interface CoachRefundRow {
  participantName: string | null
  parentName: string
  /** Null when no address could be found for this parent. */
  parentEmail: string | null
  amountPaidPence: number | null
  currency: string
}

export interface ProgrammeCancelledCoachParams {
  coachEmail: string
  coachName: string
  programmeTitle: string
  /** Number of distinct parents who paid. */
  parentCount: number
  /** One row per paid enrolment on THIS coach's programme only. */
  rows: CoachRefundRow[]
}

export async function sendProgrammeCancelledToCoach(
  params: ProgrammeCancelledCoachParams,
): Promise<boolean> {
  const { coachEmail, coachName, programmeTitle, parentCount, rows } = params
  const safeCoach = escapeHtml(coachName)
  const safeTitle = escapeHtml(programmeTitle)
  const parents = parentCountLabel(parentCount)
  const anyMissingEmail = rows.some((r) => r.parentEmail === null)

  const refundTable = table(
    ['Participant', 'Parent', 'Parent email', 'Amount paid'],
    rows.map((r) => [
      r.participantName ? escapeHtml(r.participantName) : '&mdash;',
      escapeHtml(r.parentName),
      r.parentEmail ? escapeHtml(r.parentEmail) : 'Not available',
      r.amountPaidPence !== null ? formatPence(r.amountPaidPence, r.currency) : '&mdash;',
    ]),
  )

  const body = `
    ${heading(`You cancelled ${safeTitle}`)}
    ${paragraph(`Hi ${safeCoach},`)}
    ${paragraph(`You&rsquo;ve cancelled ${safeTitle}. ${parents} had already paid, and we&rsquo;ve emailed them to say that you will arrange their refund.`)}
    ${paragraph(`<strong>Please refund each parent directly.</strong> Programme fees were paid to you, so Crikly does not refund them.`)}
    ${refundTable}
    ${
      anyMissingEmail
        ? paragraph(
            `Where a parent&rsquo;s email is shown as not available, email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#0077CC;text-decoration:none;">${SUPPORT_EMAIL}</a> and we&rsquo;ll help you reach them.`,
          )
        : ''
    }
    ${paragraph(`Please keep these details private and use them only to arrange the refunds.`)}
  `

  return sendSafely('sendProgrammeCancelledToCoach', {
    from: PARENT_COACH_FROM,
    to: coachEmail,
    subject: `You cancelled ${programmeTitle} — please refund ${parents}`,
    html: emailWrapper(body),
  })
}

// ─── Ops copy ─────────────────────────────────────────────────────────────────

export interface OpsEnrolmentRow {
  enrolmentReference: string | null
  parentName: string
  amountPaidPence: number | null
  currency: string
  /** True only when a payout row for this enrolment has status 'paid'. */
  paidOutToCoach: boolean
  /** Raw payouts.status, or null when the payout job never created a row. */
  payoutStatus: string | null
  parentEmailOutcome: 'sent' | 'failed' | 'no_address'
}

export interface ProgrammeCancelledOpsParams {
  opsEmail: string
  coachName: string
  programmeTitle: string
  programmeId: string
  /** Formatted cancel date, e.g. "14 Nov 2026". */
  cancelledOn: string
  coachEmailSent: boolean
  rows: OpsEnrolmentRow[]
}

const PARENT_EMAIL_OUTCOME_LABEL: Record<OpsEnrolmentRow['parentEmailOutcome'], string> = {
  sent: 'Sent',
  failed: 'FAILED',
  no_address: 'NO ADDRESS FOUND',
}

export async function sendProgrammeCancelledToOps(
  params: ProgrammeCancelledOpsParams,
): Promise<boolean> {
  const { opsEmail, coachName, programmeTitle, programmeId, cancelledOn, coachEmailSent, rows } = params
  const safeCoach = escapeHtml(coachName)
  const safeTitle = escapeHtml(programmeTitle)

  const currency = rows[0]?.currency ?? 'GBP'
  const totalPence = rows.reduce((sum, r) => sum + (r.amountPaidPence ?? 0), 0)
  const heldRows = rows.filter((r) => !r.paidOutToCoach)
  const heldPence = heldRows.reduce((sum, r) => sum + (r.amountPaidPence ?? 0), 0)
  const enrolments = `${rows.length} paid ${rows.length === 1 ? 'enrolment' : 'enrolments'}`

  const enrolmentTable = table(
    ['Reference', 'Parent', 'Amount paid', 'Payout to coach', 'Parent email'],
    rows.map((r) => [
      r.enrolmentReference ? escapeHtml(r.enrolmentReference) : '&mdash;',
      escapeHtml(r.parentName),
      r.amountPaidPence !== null ? formatPence(r.amountPaidPence, r.currency) : '&mdash;',
      r.paidOutToCoach
        ? 'Paid'
        : `NOT PAID OUT (${r.payoutStatus ? escapeHtml(r.payoutStatus) : 'no payout row'})`,
      PARENT_EMAIL_OUTCOME_LABEL[r.parentEmailOutcome],
    ]),
  )

  const heldNote =
    heldRows.length > 0
      ? paragraph(
          `<strong>Action needed: Crikly still holds ${formatPence(heldPence, currency)}.</strong> ${heldRows.length} of these ${rows.length === 1 ? 'enrolment was' : 'enrolments were'} not paid out to the coach before the cancellation, and the payout job never pays a cancelled programme. The parent has been told the coach will refund them, so this needs sorting by hand.`,
        )
      : paragraph(`Every fee had already been paid out to the coach. Crikly holds none of this money.`)

  const body = `
    ${heading(`Programme cancelled with paid enrolments`)}
    ${paragraph(`${safeCoach} cancelled ${safeTitle} on ${escapeHtml(cancelledOn)}. ${enrolments}, ${formatPence(totalPence, currency)} in total. The coach has been told to refund parents directly (Decision T-21).`)}
    ${heldNote}
    ${enrolmentTable}
    ${paragraph(`Coach reminder email: ${coachEmailSent ? 'sent' : '<strong>FAILED &mdash; contact the coach</strong>'}.`)}
    ${paragraph(`Programme ID: ${escapeHtml(programmeId)}`)}
  `

  return sendSafely('sendProgrammeCancelledToOps', {
    from: OPS_FROM,
    to: opsEmail,
    subject: `[Crikly] Programme cancelled with paid enrolments — ${programmeTitle}`,
    html: emailWrapper(body),
  })
}
