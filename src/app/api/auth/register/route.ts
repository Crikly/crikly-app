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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })

    if (error) {
      if (error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already exists')) {
        return NextResponse.json(
          { success: false, error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' } },
        { status: 500 }
      )
    }

    if (!data.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not create account. Please try again.' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, redirectTo: `/verify?email=${encodeURIComponent(email)}` })
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Unexpected error. Please try again.' } },
      { status: 500 }
    )
  }
}
