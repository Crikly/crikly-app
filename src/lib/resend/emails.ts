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

  const body = `
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#0F172A;font-family:'DM Sans',Arial,sans-serif;letter-spacing:-0.5px;">
      New booking 🎉
    </h1>
    <p style="margin:0 0 4px;font-size:16px;color:#64748B;font-family:'DM Sans',Arial,sans-serif;">
      Hi ${coachName},
    </p>
    <p style="margin:16px 0 0;font-size:15px;color:#334155;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      <strong>${parentName}</strong> has booked a session with you. Your payout will be released
      48 hours after the session completes.
    </p>

    ${bookingSummaryBox([
      { label: 'Parent',    value: parentName },
      { label: 'Sport',     value: sport },
      { label: 'Date',      value: sessionDate },
      { label: 'Time',      value: sessionTime },
      { label: 'You earn',  value: formatGBP(coachPricePence) },
    ])}

    ${bookingRefBadge(bookingReference)}

    ${ctaButton('View in dashboard', dashboardUrl)}

    <p style="margin:24px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;font-family:'DM Sans',Arial,sans-serif;">
      Your payout of ${formatGBP(coachPricePence)} will be transferred to your bank account
      48 hours after the session is marked complete.
    </p>
  `

  const { error } = await getResend().emails.send({
    from: FROM,
    to: coachEmail,
    subject: `New booking from ${parentName} — ${sessionDate}`,
    html: emailWrapper(body),
  })

  if (error) {
    throw new Error(`[sendNewBookingToCoach] Resend error: ${error.message}`)
  }

  return { success: true }
}
