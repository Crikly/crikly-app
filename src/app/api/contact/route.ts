import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

// CONTACT-01: contact form submissions. Sends a lean internal-notification
// email to crikly@teklysolutions.com with Reply-To set to the submitter
// so hitting Reply in the inbox goes back to them directly.

// Lazy instantiation — missing RESEND_API_KEY returns a clean 500 instead
// of throwing at module load. Matches the api/interest pattern.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const TO_EMAIL = 'crikly@teklysolutions.com'

const VALID_SUBJECTS = [
  "I'm a coach and need help",
  'I want to book a coach',
  'Technical issue',
  'Partnership enquiry',
  'Something else',
] as const

interface ContactBody {
  name?: unknown
  email?: unknown
  subject?: unknown
  message?: unknown
  // Honeypot — humans never see/fill this field; bots auto-fill it.
  company?: unknown
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ContactBody
  try {
    body = (await req.json()) as ContactBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Honeypot — silently return 200 so bots can't probe by comparing
  // response shapes. The legitimate form leaves this field empty.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return NextResponse.json({ success: true }, { status: 200 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const subject = typeof body.subject === 'string' ? body.subject : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 422 })
  if (name.length > 200) return NextResponse.json({ error: 'Name is too long' }, { status: 422 })
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 422 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 422 })
  }
  if (email.length > 320) return NextResponse.json({ error: 'Email is too long' }, { status: 422 })
  if (!subject || !(VALID_SUBJECTS as readonly string[]).includes(subject)) {
    return NextResponse.json({ error: 'Invalid subject' }, { status: 422 })
  }
  if (!message) return NextResponse.json({ error: 'Message is required' }, { status: 422 })
  if (message.length < 20) {
    return NextResponse.json({ error: 'Message must be at least 20 characters' }, { status: 422 })
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 422 })
  }

  if (!resend) {
    console.error('[POST /api/contact] RESEND_API_KEY not configured')
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'bookings@crikly.app'

  const html = `
    <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <hr />
    <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
  `

  const { error } = await resend.emails.send({
    from: `Crikly Contact <${fromEmail}>`,
    to: TO_EMAIL,
    replyTo: email,
    subject: `[Crikly Contact] ${subject} — from ${name}`,
    html,
  })

  if (error) {
    console.error('[POST /api/contact] Resend error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
