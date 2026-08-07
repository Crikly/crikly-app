import { getResend } from './client'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'bookings@crikly.app'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

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

function bookingSummaryBox(rows: Array<{ label: string; value: string }>): string {
  const rowsHtml = rows.map(({ label, value }) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;width:40%;">${label}</td>
      <td style="padding:8px 0;font-size:13px;color:#0F172A;font-weight:600;font-family:'DM Sans',Arial,sans-serif;">${value}</td>
    </tr>`).join('')

  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:20px 24px;margin:24px 0;">
    <tr><td colspan="2" style="padding-bottom:12px;">
      <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;font-family:'DM Sans',Arial,sans-serif;">Booking Details</span>
    </td></tr>
    ${rowsHtml}
  </table>`
}

function bookingRefBadge(ref: string): string {
  return `<p style="margin:16px 0 0;font-size:12px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;">
    Booking reference: <strong style="color:#0077CC;">${ref}</strong>
  </p>`
}

// ─── Guest (Block 0) confirmation ───────────────────────────────────────────────
//
// P-00c-EMAIL. Guests have no account, so this email carries NO CTA button and no
// account-specific links (contrast sendBookingConfirmationToParent below). It is a
// self-contained record of booking. The layout deliberately diverges from
// emailWrapper(): hosted logo image with "Crikly" alt fallback, 560px max-width,
// and the Tekly Solutions Ltd footer required for the guest flow.

const GUEST_FROM = FROM.includes('<') ? FROM : `Crikly <${FROM}>`

// Gmail strips <body>/<head> styles, so font-family must be repeated on every
// text-bearing element. No web fonts — system sans stack for email-client safety.
const GUEST_SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** Escape interpolated user-supplied strings so they can't inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function guestEmailWrapper(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Crikly</title>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
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
              <p style="margin:24px 0 0;font-size:12px;color:#94A3B8;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
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

export interface GuestBookingConfirmationParams {
  guestName: string
  guestEmail: string
  coachName: string
  bookingReference: string
  sessionDate: string
  sessionTime: string
  sessionType: string
  totalPence: number
  /**
   * UX-16: who the session is for (child, or the player themselves). Optional
   * only because intents created before UX-16 carry no participant metadata —
   * new bookings always have it.
   */
  participantName?: string
  participantAge?: number
}

/**
 * Sends the guest booking-confirmation email. Throws on Resend failure — callers
 * that must not propagate (e.g. the Stripe webhook) wrap this in
 * sendBookingConfirmation() which catches and returns a boolean.
 */
export async function sendGuestBookingConfirmation(
  params: GuestBookingConfirmationParams,
): Promise<{ success: true }> {
  const {
    guestName, guestEmail, coachName, bookingReference,
    sessionDate, sessionTime, sessionType, totalPence,
    participantName, participantAge,
  } = params

  const safeName = escapeHtml(guestName)
  const safeCoach = escapeHtml(coachName)
  const safeRef = escapeHtml(bookingReference)
  const safeDate = escapeHtml(sessionDate)
  const safeTime = escapeHtml(sessionTime)
  const safeType = escapeHtml(sessionType)

  // UX-16: "Yuwin (age 10)" or just the name when no age was given.
  const safeParticipant = participantName
    ? escapeHtml(
        participantAge ? `${participantName} (age ${participantAge})` : participantName,
      )
    : null

  const detailRows = [
    ...(safeParticipant ? [{ label: 'Booking for', value: safeParticipant }] : []),
    { label: 'Coach', value: safeCoach },
    { label: 'Date', value: safeDate },
    { label: 'Time', value: safeTime },
    { label: 'Session type', value: safeType },
    { label: 'Amount paid', value: formatGBP(totalPence) },
  ]
    .map(
      ({ label, value }) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#64748B;width:42%;font-family:${GUEST_SANS};">${label}</td>
      <td style="padding:8px 0;font-size:13px;color:#0F172A;font-weight:600;font-family:${GUEST_SANS};">${value}</td>
    </tr>`,
    )
    .join('')

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.5px;font-family:${GUEST_SANS};">
      Your booking is confirmed!
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;font-family:${GUEST_SANS};">
      Hi ${safeName}, your session with ${safeCoach} is all set.
    </p>

    <!-- Booking reference card -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
      <tr><td>
        <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;font-family:${GUEST_SANS};">Booking reference</span>
        <div style="margin-top:6px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:700;color:#0077CC;">${safeRef}</div>
      </td></tr>
    </table>

    <!-- Session details -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <tr><td colspan="2" style="padding-bottom:12px;">
        <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;font-family:${GUEST_SANS};">Session details</span>
      </td></tr>
      ${detailRows}
    </table>

    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;font-family:${GUEST_SANS};">
      Keep this email as your record of booking.
    </p>
    <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;font-family:${GUEST_SANS};">
      Questions? Reply to this email or contact us at
      <a href="mailto:hello@crikly.app" style="color:#0077CC;text-decoration:none;">hello@crikly.app</a>
    </p>
  `

  const { error } = await getResend().emails.send({
    from: GUEST_FROM,
    to: guestEmail,
    subject: `Your Crikly booking is confirmed — ${bookingReference}`,
    html: guestEmailWrapper(body),
  })

  if (error) {
    throw new Error(`[sendGuestBookingConfirmation] Resend error: ${error.message}`)
  }

  return { success: true }
}

// ─── Guest (Block 0) programme-enrolment confirmation ───────────────────────────
//
// P-00c-ENROL. Guest programme enrolment — same self-contained, no-account layout
// as sendGuestBookingConfirmation (guestEmailWrapper, no CTA button). Differs only
// in the details shown: programme title + schedule + sessions instead of a single
// session's date/time.

export interface GuestProgrammeConfirmationParams {
  guestName: string
  guestEmail: string
  coachName: string
  enrolmentReference: string
  programmeTitle: string
  scheduleSummary: string
  sessionsSummary: string
  totalPence: number
  /**
   * BUG-20 (UX-16 parity with sendGuestBookingConfirmation): who the
   * programme is for. Optional only because intents created before BUG-20
   * carry no participant metadata — new enrolments always have the name.
   */
  participantName?: string
  participantAge?: number
  /**
   * BUG-23: slot-level attendance lines for camp enrolments — e.g.
   * "Tue 4 Aug — Morning (9:00am – 12:00pm)". Omitted for non-camp
   * enrolments (the count-only Sessions row stands alone, unchanged).
   */
  sessionLines?: string[]
}

/**
 * Sends the guest programme-enrolment confirmation email. Throws on Resend
 * failure — the Stripe webhook wraps this in sendProgrammeConfirmation() which
 * catches and returns a boolean so a failed email can never break the 200.
 */
export async function sendGuestProgrammeConfirmation(
  params: GuestProgrammeConfirmationParams,
): Promise<{ success: true }> {
  const {
    guestName, guestEmail, coachName, enrolmentReference,
    programmeTitle, scheduleSummary, sessionsSummary, totalPence,
    participantName, participantAge, sessionLines,
  } = params

  const safeName = escapeHtml(guestName)
  const safeCoach = escapeHtml(coachName)
  const safeRef = escapeHtml(enrolmentReference)
  const safeTitle = escapeHtml(programmeTitle)
  const safeSchedule = escapeHtml(scheduleSummary)
  const safeSessions = escapeHtml(sessionsSummary)

  // BUG-20: "Yuwin (age 10)" or just the name when no age was given — the
  // exact treatment sendGuestBookingConfirmation uses (UX-16).
  const safeParticipant = participantName
    ? escapeHtml(
        participantAge ? `${participantName} (age ${participantAge})` : participantName,
      )
    : null

  // BUG-23: camp enrolments list the exact slots bought under the Sessions
  // count — each line escaped individually, joined with <br> inside the row.
  const safeSessionDetail =
    sessionLines && sessionLines.length > 0
      ? `${safeSessions}<br>${sessionLines.map((l) => escapeHtml(l)).join('<br>')}`
      : safeSessions

  const detailRows = [
    ...(safeParticipant ? [{ label: 'Booking for', value: safeParticipant }] : []),
    { label: 'Programme', value: safeTitle },
    { label: 'Coach', value: safeCoach },
    { label: 'Schedule', value: safeSchedule },
    { label: 'Sessions', value: safeSessionDetail },
    { label: 'Amount paid', value: formatGBP(totalPence) },
  ]
    .map(
      ({ label, value }) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#64748B;width:42%;font-family:${GUEST_SANS};">${label}</td>
      <td style="padding:8px 0;font-size:13px;color:#0F172A;font-weight:600;font-family:${GUEST_SANS};">${value}</td>
    </tr>`,
    )
    .join('')

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;letter-spacing:-0.5px;font-family:${GUEST_SANS};">
      You&rsquo;re enrolled!
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;font-family:${GUEST_SANS};">
      Hi ${safeName}, you&rsquo;re enrolled in ${safeTitle} with ${safeCoach}.
    </p>

    <!-- Enrolment reference card -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
      <tr><td>
        <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;font-family:${GUEST_SANS};">Enrolment reference</span>
        <div style="margin-top:6px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:18px;font-weight:700;color:#0077CC;">${safeRef}</div>
      </td></tr>
    </table>

    <!-- Programme details -->
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <tr><td colspan="2" style="padding-bottom:12px;">
        <span style="font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:0.8px;font-family:${GUEST_SANS};">Programme details</span>
      </td></tr>
      ${detailRows}
    </table>

    <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.6;font-family:${GUEST_SANS};">
      Keep this email as your record of enrolment.
    </p>
    <p style="margin:0;font-size:14px;color:#334155;line-height:1.6;font-family:${GUEST_SANS};">
      Questions? Reply to this email or contact us at
      <a href="mailto:hello@crikly.app" style="color:#0077CC;text-decoration:none;">hello@crikly.app</a>
    </p>
  `

  const { error } = await getResend().emails.send({
    from: GUEST_FROM,
    to: guestEmail,
    subject: `Your Crikly programme enrolment is confirmed — ${enrolmentReference}`,
    html: guestEmailWrapper(body),
  })

  if (error) {
    throw new Error(`[sendGuestProgrammeConfirmation] Resend error: ${error.message}`)
  }

  return { success: true }
}

// ─── sendBookingConfirmationToParent ─────────────────────────────────────────

export interface BookingConfirmationParams {
  parentEmail: string
  parentName: string
  coachName: string
  sport: string
  sessionDate: string
  sessionTime: string
  totalPricePence: number
  bookingReference: string
  coachProfileUrl: string
}

export async function sendBookingConfirmationToParent(
  params: BookingConfirmationParams,
): Promise<{ success: true }> {
  const {
    parentEmail, parentName, coachName, sport,
    sessionDate, sessionTime, totalPricePence,
    bookingReference, coachProfileUrl,
  } = params

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;font-family:'DM Sans',Arial,sans-serif;letter-spacing:-0.5px;">
      You&rsquo;re booked in! ✓
    </h1>
    <p style="margin:0 0 4px;font-size:16px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;">
      Hi ${parentName},
    </p>
    <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      Your coaching session with <strong>${coachName}</strong> is confirmed.
      We&rsquo;ll remind you before the session.
    </p>

    ${bookingSummaryBox([
      { label: 'Coach',    value: coachName },
      { label: 'Sport',    value: sport },
      { label: 'Date',     value: sessionDate },
      { label: 'Time',     value: sessionTime },
      { label: 'Total',    value: formatGBP(totalPricePence) },
    ])}

    ${bookingRefBadge(bookingReference)}

    ${ctaButton('View coach profile', coachProfileUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      If you need to cancel, please check your coach&rsquo;s cancellation policy. Cancellations made
      outside the cancellation window may not be refundable.
    </p>
  `

  const { error } = await getResend().emails.send({
    from: FROM,
    to: parentEmail,
    subject: `Your session with ${coachName} is confirmed ✓`,
    html: emailWrapper(body),
  })

  if (error) {
    throw new Error(`[sendBookingConfirmationToParent] Resend error: ${error.message}`)
  }

  return { success: true }
}

// ─── sendNewBookingToCoach ────────────────────────────────────────────────────

export interface NewBookingToCoachParams {
  coachEmail: string
  coachName: string
  parentName: string
  sport: string
  sessionDate: string
  sessionTime: string
  coachPricePence: number
  bookingReference: string
  dashboardUrl: string
}

export async function sendNewBookingToCoach(
  params: NewBookingToCoachParams,
): Promise<{ success: true }> {
  const {
    coachEmail, coachName, parentName, sport,
    sessionDate, sessionTime, coachPricePence,
    bookingReference, dashboardUrl,
  } = params

  // CF-NOTIFY-02: parentName is guest-form input and coachName/sport come from
  // the DB — escape everything interpolated into markup (mirrors the guest
  // templates above).
  const safeCoach = escapeHtml(coachName)
  const safeParent = escapeHtml(parentName)
  const safeSport = escapeHtml(sport)
  const safeDate = escapeHtml(sessionDate)
  const safeTime = escapeHtml(sessionTime)
  const safeRef = escapeHtml(bookingReference)

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;font-family:'DM Sans',Arial,sans-serif;letter-spacing:-0.5px;">
      New booking 🎉
    </h1>
    <p style="margin:0 0 4px;font-size:16px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;">
      Hi ${safeCoach},
    </p>
    <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      <strong>${safeParent}</strong> has booked a session with you. Your payout will be released
      48 hours after the session completes.
    </p>

    ${bookingSummaryBox([
      { label: 'Parent',    value: safeParent },
      { label: 'Sport',     value: safeSport },
      { label: 'Date',      value: safeDate },
      { label: 'Time',      value: safeTime },
      { label: 'You earn',  value: formatGBP(coachPricePence) },
    ])}

    ${bookingRefBadge(safeRef)}

    ${ctaButton('View in dashboard', dashboardUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      Your payout of ${formatGBP(coachPricePence)} will be transferred to your bank account
      48 hours after the session is marked complete.
    </p>
  `

  // Subjects are plain text, not HTML — entity-escaping would render literally
  // (e.g. "O&#39;Brien"). Strip CR/LF instead so guest-form input can never
  // smuggle header lines into the outbound message.
  const subjectParent = parentName.replace(/[\r\n]+/g, ' ').trim()

  const { error } = await getResend().emails.send({
    from: FROM,
    to: coachEmail,
    subject: `New booking from ${subjectParent} — ${sessionDate}`,
    html: emailWrapper(body),
  })

  if (error) {
    throw new Error(`[sendNewBookingToCoach] Resend error: ${error.message}`)
  }

  return { success: true }
}
