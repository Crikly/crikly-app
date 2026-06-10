import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      fullName?: unknown
      email?: unknown
      password?: unknown
    }

    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!fullName || !email || !password) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Please check your details and try again.' } },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' } },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    // Fix-PROD-PROFILE-01: build the verification-link base from the request
    // origin. NEXT_PUBLIC_SITE_URL is Production-only, so on preview/other envs
    // it was undefined → emailRedirectTo became `undefined/auth/callback`, the
    // verification link was broken, the callback was never reached, and the
    // email user's profile was never created.
    const origin =
      request.headers.get('origin') ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      'http://localhost:3000'

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    })

    if (error) {
      // BUG-AUTH-REGISTER-500: log every Supabase auth.signUp error so the
      // non-duplicate fall-through path (which silently returned 500 before)
      // surfaces the real cause in Vercel logs.
      console.error('[register] supabase.auth.signUp error:', {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
      })
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already exists')) {
        return NextResponse.json(
          { success: false, error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } },
          { status: 409 }
        )
      }
      // BUG-AUTH-REGISTER-500: Supabase Auth returns 429 with code
      // 'over_email_send_rate_limit' when too many register attempts
      // hit the same email/IP in a short window. Code check is the
      // canonical match; the 'rate limit' substring is a defensive
      // fallback for variants (e.g. older SDK versions emitting only
      // the message text). Covers both the burst-protection limit
      // and the per-email "For security purposes..." cooldown which
      // share the same error code in modern Supabase SDKs.
      if (error.code === 'over_email_send_rate_limit' ||
          error.message.toLowerCase().includes('rate limit')) {
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' } },
        { status: 500 }
      )
    }

    if (!data.user) {
      // BUG-AUTH-REGISTER-500: signUp succeeded but didn't return a user —
      // surface this edge case so we can tell it apart from genuine errors.
      console.error('[register] signUp returned no user but no error', { hasSession: !!data.session })
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not create account. Please try again.' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, redirectTo: `/verify?email=${encodeURIComponent(email)}` })
  } catch (error) {
    // BUG-AUTH-REGISTER-500: bare catch was silently swallowing exceptions.
    // Includes any throw before signUp is even called (body parse, cookies(),
    // createServerClient crash, etc.).
    console.error('[register] Unexpected exception:', error)
    return NextResponse.json(
      { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Unexpected error. Please try again.' } },
      { status: 500 }
    )
  }
}
