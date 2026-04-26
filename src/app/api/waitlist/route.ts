import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_ROLES = ['parent', 'player'] as const
type WaitlistRole = (typeof VALID_ROLES)[number]

interface WaitlistBody {
  email: string
  role?: WaitlistRole
  consentGiven?: boolean
  consentAt?: string
}

type FieldErrors = Partial<Record<keyof WaitlistBody, string>>

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: WaitlistBody
  try {
    body = (await req.json()) as WaitlistBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { email, role, consentGiven = false, consentAt } = body

  const errors: FieldErrors = {}
  if (!email?.trim()) {
    errors.email = 'Email is required'
  } else if (!validateEmail(email.trim())) {
    errors.email = 'Invalid email address'
  }
  if (role && !(VALID_ROLES as readonly string[]).includes(role)) {
    errors.role = 'Role must be one of: parent, player'
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 422 })
  }

  const supabase = await createClient()

  // ON CONFLICT (email) DO NOTHING — idempotent upsert
  const { error: dbError } = await supabase.from('waitlist_emails').upsert(
    {
      email: email.trim().toLowerCase(),
      role: role ?? null,
      consent_given: consentGiven,
      consent_at: consentGiven ? (consentAt ?? new Date().toISOString()) : null,
    },
    { onConflict: 'email', ignoreDuplicates: true },
  )

  if (dbError) {
    console.error('[POST /api/waitlist] DB error:', dbError.message)
    return NextResponse.json({ error: 'Failed to save email' }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 201 })
}
