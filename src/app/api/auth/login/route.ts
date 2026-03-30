import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      email?: unknown
      password?: unknown
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Please check your details and try again.' } },
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        return NextResponse.json(
          { success: false, error: { code: 'EMAIL_NOT_VERIFIED', message: 'Please verify your email before logging in.' } },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } },
        { status: 401 }
      )
    }

    if (!data.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not log in. Please try again.' } },
        { status: 500 }
      )
    }

    const hasRole = data.user.user_metadata?.primary_role
    const redirectTo = hasRole ? '/dashboard' : '/onboarding/role'
    return NextResponse.json({ success: true, redirectTo })
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Unexpected error. Please try again.' } },
      { status: 500 }
    )
  }
}
