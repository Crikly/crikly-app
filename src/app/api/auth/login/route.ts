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
      if (error.message.toLowerCase().includes('invalid login') ||
          error.message.toLowerCase().includes('invalid credentials')) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password. If you signed up with Google or Apple, please use those buttons below.' } },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password. If you signed up with Google or Apple, please use those buttons below.' } },
        { status: 401 }
      )
    }

    if (!data.user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not log in. Please try again.' } },
        { status: 500 }
      )
    }

    // AUTH-FIX-01 (FIX D): route by canonical user_profiles state, not by
    // user_metadata.primary_role (which can drift from the DB). Order:
    //   1. terms not accepted    → /onboarding/terms (gate everything else)
    //   2. active_role = coach   → /coach/dashboard
    //   3. active_role exists    → /dashboard
    //   4. no active_role        → /onboarding/role
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('active_role, terms_accepted_at')
      .eq('auth_user_id', data.user.id)
      .single()

    // Auth succeeded but the user_profiles row is missing — auth callback
    // failed to create it. Return an explicit error rather than routing
    // them to /onboarding/terms (where accept-terms would also fail
    // because there's no row to update — phantom-success loop).
    if (!userProfile) {
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not load your profile. Please try again.' } },
        { status: 500 }
      )
    }

    let redirectTo: string
    if (!userProfile.terms_accepted_at) {
      redirectTo = '/onboarding/terms'
    } else if (userProfile.active_role === 'coach') {
      redirectTo = '/coach/dashboard'
    } else if (userProfile.active_role) {
      redirectTo = '/dashboard'
    } else {
      redirectTo = '/onboarding/role'
    }

    return NextResponse.json({ success: true, redirectTo })
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Unexpected error. Please try again.' } },
      { status: 500 }
    )
  }
}
