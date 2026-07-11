import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

// BUG-33: saves the new password for a user holding a recovery session (set by
// /auth/callback?type=recovery via exchangeCodeForSession). Uses the standard
// supabase.auth.updateUser({ password }) on the user's own session — no token
// mechanics. On success returns the same profile-state-gated redirect as the
// login route, so the user continues exactly where a fresh login would land.
export async function POST(request: Request) {
  try {
    const body = await request.json() as { password?: unknown }
    const password = typeof body.password === 'string' ? body.password : ''

    if (!password || password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Password must be at least 8 characters.',
          },
        },
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

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Your reset link has expired. Please request a new one.',
          },
        },
        { status: 401 }
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      // Supabase rejects a password identical to the current one — surface
      // that specific case in words the user can act on. Prefer the stable
      // error code; fall back to the message for older gotrue versions.
      const samePassword =
        (updateError as { code?: string }).code === 'same_password' ||
        Boolean(updateError.message?.toLowerCase().includes('different from the old password'))
      console.error('Password update error:', updateError)
      return NextResponse.json(
        {
          success: false,
          error: samePassword
            ? {
                code: 'SAME_PASSWORD',
                message: 'Your new password must be different from your old password.',
              }
            : {
                code: 'UNKNOWN_ERROR',
                message: 'Could not update your password. Please try again.',
              },
        },
        { status: samePassword ? 422 : 500 }
      )
    }

    // Same gate order as /api/auth/login (AUTH-FIX-01): terms → coach →
    // other role → role selection. A missing profile row routes to
    // /onboarding/role, where the BUG-26 recovery upsert takes over.
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('active_role, terms_accepted_at')
      .eq('auth_user_id', user.id)
      .single()

    let redirectTo: string
    if (!userProfile) {
      redirectTo = '/onboarding/role'
    } else if (!userProfile.terms_accepted_at) {
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
      {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Unexpected error. Please try again.',
        },
      },
      { status: 500 }
    )
  }
}
