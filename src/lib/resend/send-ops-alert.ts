// BUG-15: fire-and-forget ops notification for payment_alerts rows (refund
// policy B — the durable table is the record; this is the push channel until
// the admin module exists). Inert until OPS_ALERT_EMAIL is set (Lasith sets
// it at promotion). NEVER throws and never affects the webhook response —
// approved ruling 3.

import { getResend } from './client'

const OPS_FROM = 'Crikly Alerts <alerts@crikly.app>'

export interface OpsAlertParams {
  kind: 'needs_refund' | 'restore_conflict' | 'webhook_poisoned'
  detail: string
  stripePaymentIntentId?: string | null
  amountPence?: number | null
  currency?: string
}

/** Escapes the four HTML-significant characters (mirrors emails.ts). */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Sends the ops alert email. Returns true when Resend accepted the send,
 * false on any failure or when OPS_ALERT_EMAIL is unset. Never throws.
 */
export async function sendOpsAlert(params: OpsAlertParams): Promise<boolean> {
  const to = process.env.OPS_ALERT_EMAIL
  if (!to) return false

  try {
    const amount =
      typeof params.amountPence === 'number'
        ? `£${(params.amountPence / 100).toFixed(2)} ${params.currency ?? 'GBP'}`
        : 'unknown amount'
    const intent = params.stripePaymentIntentId ?? 'unknown intent'

    const { error } = await getResend().emails.send({
      from: OPS_FROM,
      to,
      subject: `[Crikly ALERT] ${params.kind} — ${amount}`,
      html: `
        <p><strong>${escapeHtml(params.kind)}</strong> — a payment_alerts row was created and needs attention.</p>
        <p>${escapeHtml(params.detail)}</p>
        <p>Amount: ${escapeHtml(amount)}<br>PaymentIntent: ${escapeHtml(intent)}</p>
        <p>Refunds are manual: find the intent in the Stripe Dashboard (Tekly Solutions) and refund from there, then mark the alert row resolved.</p>
      `,
    })

    if (error) {
      console.error('[sendOpsAlert] Resend error:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[sendOpsAlert] failed:', err instanceof Error ? err.message : err)
    return false
  }
}
