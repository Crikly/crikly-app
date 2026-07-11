import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // BUG-33: forgot-password sends redirectTo `/auth/callback?type=recovery`,
  // and Supabase's verify endpoint preserves that param when it appends the
  // code. A recovery login must land on the set-new-password screen, never on
  // the normal post-login destination.
  const isRecovery = requestUrl.searchParams.get('type') === 'recovery'

  if (!code) {
    // Expired/used recovery links arrive with error params and no code —
    // send the user somewhere they can request a fresh link.
    if (isRecovery) {
      return NextResponse.redirect(new URL('/forgot-password?error=link_expired', origin))
    }
    return NextResponse.redirect(new URL('/login', origin))
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

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    if (isRecovery) {
      return NextResponse.redirect(new URL('/forgot-password?error=link_expired', origin))
    }
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
  }

  // BUG-33: recovery session established — go straight to the set-password
  // screen. Profile upsert/routing is skipped: a recovery user already has an
  // account, and their post-save destination is decided by
  // /api/auth/reset-password using the same profile-state gate as login.
  if (isRecovery) {
    return NextResponse.redirect(new URL('/reset-password', origin))
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', origin))
  }

  // Create user_profiles row for OAuth users if it doesn't exist
  try {
    const fullName = user.user_metadata?.full_name
      || user.user_metadata?.name
      || ''
    const avatarUrl = user.user_metadata?.avatar_url
      || user.user_metadata?.picture
      || null

    // Fix-PROD-PROFILE-01 (1b): capture + log the result. The previous bare
    // catch swallowed every error with no logging, hiding the real failure
    // cause on all environments. ignoreDuplicates:false → ON CONFLICT DO UPDATE
    // so a returning user's name/avatar stay current. auth_provider set from
    // the real provider (was defaulting to 'email' for OAuth users).
    const { error: upsertError } = await supabase
      .from('user_profiles')
      .upsert(
        {
          auth_user_id: user.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          auth_provider: user.app_metadata?.provider ?? 'email',
        },
        {
          onConflict: 'auth_user_id',
          ignoreDuplicates: false,
        }
      )
    if (upsertError) {
      console.error('[auth/callback] user_profiles upsert failed:', {
        userId: user.id,
        code: upsertError.code,
        message: upsertError.message,
        details: upsertError.details,
      })
      // Still do not block the auth flow — user can complete profile later.
    }
  } catch (err) {
    console.error('[auth/callback] user_profiles upsert threw:', err)
  }

  // AUTH-JOURNEY-01 / Fix-AUDIT-02: route by canonical user_profiles state
  // (role-first), matching the proxy gate + password-login gate. Do NOT route
  // on user_metadata.primary_role — it can drift from the DB. Uses the existing
  // SSR client (the user's own session). active_role is nullable (Fix-AUDIT-01):
  // NULL means no role chosen yet → role selection.
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('active_role, terms_accepted_at')
    .eq('auth_user_id', user.id)
    .single()

  // BUG-34 hardening: .single() previously conflated "no row" (PGRST116) with
  // transient query failures, so a DB blip would dump a fully-onboarded user
  // into role selection. Route transient failures to /dashboard — a pure
  // router that re-reads the profile — and log for diagnosis. Genuine no-row
  // results (new users) fall through to the gate below unchanged.
  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[auth/callback] user_profiles read failed:', {
      userId: user.id,
      code: profileError.code,
      message: profileError.message,
    })
    return NextResponse.redirect(new URL('/dashboard', origin))
  }

  let redirectTo: string
  if (!userProfile || !userProfile.active_role) {
    redirectTo = '/onboarding/role'
  } else if (!userProfile.terms_accepted_at) {
    redirectTo = '/onboarding/terms'
  } else if (userProfile.active_role === 'coach') {
    redirectTo = '/coach/dashboard'
  } else {
    // No supported non-coach role yet. Send to role selection (NOT /login,
    // which would loop via the proxy's session→/dashboard redirect).
    redirectTo = '/onboarding/role'
  }

  return NextResponse.redirect(new URL(redirectTo, origin))
}
