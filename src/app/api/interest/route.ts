import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const VALID_ROLES = ['coach', 'parent', 'player'] as const
type Role = (typeof VALID_ROLES)[number]

interface InterestBody {
  name: string
  email: string
  role: Role
  sports?: string[]
  location?: string
}

type FieldErrors = Partial<Record<keyof InterestBody, string>>

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Email is best-effort — silently skipped if RESEND_API_KEY not configured.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: InterestBody
  try {
    body = (await req.json()) as InterestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, email, role, sports = [], location } = body

  const errors: FieldErrors = {}
  if (!name?.trim()) errors.name = 'Name is required'
  if (!email?.trim()) {
    errors.email = 'Email is required'
  } else if (!validateEmail(email.trim())) {
    errors.email = 'Invalid email address'
  }
  if (!role) {
    errors.role = 'Role is required'
  } else if (!(VALID_ROLES as readonly string[]).includes(role)) {
    errors.role = 'Role must be one of: coach, parent, player'
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 })
  }

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('interest_registrations').insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role,
    sports,
    location: location?.trim() ?? null,
  })

  if (dbError) {
    console.error('[POST /api/interest] DB error:', dbError.message)
    return NextResponse.json({ error: 'Failed to save registration' }, { status: 500 })
  }

  // Notify Lasith — best-effort, non-blocking
  const notifyEmail = process.env.LASITH_EMAIL
  if (resend && notifyEmail) {
    resend.emails
      .send({
        from: process.env.RESEND_FROM_EMAIL ?? 'bookings@crikly.app',
        to: notifyEmail,
        subject: `New coach interest — ${name.trim()}`,
        html: `<p><strong>Name:</strong> ${name.trim()}</p>
<p><strong>Email:</strong> ${email.trim()}</p>
<p><strong>Role:</strong> ${role}</p>
<p><strong>Location:</strong> ${location?.trim() ?? '—'}</p>
<p><strong>Sports:</strong> ${sports.length > 0 ? sports.join(', ') : '—'}</p>`,
      })
      .catch((err: unknown) => {
        console.error('[POST /api/interest] Resend error:', err)
      })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
