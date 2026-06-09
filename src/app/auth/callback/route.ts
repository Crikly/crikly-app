import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  if (!code) {
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
    return NextResponse.redirect(new URL('/login?error=oauth_failed', origin))
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

    await supabase
      .from('user_profiles')
      .upsert(
        {
          auth_user_id: user.id,
          full_name: fullName,
          avatar_url: avatarUrl,
        },
        {
          onConflict: 'auth_user_id',
          ignoreDuplicates: true
        }
      )
  } catch {
    // Never block auth flow for profile creation failure
    // User can complete profile later
  }

  // AUTH-JOURNEY-01 / Fix-AUDIT-02: route by canonical user_profiles state
  // (role-first), matching the proxy gate + password-login gate. Do NOT route
  // on user_metadata.primary_role — it can drift from the DB. Uses the existing
  // SSR client (the user's own session). active_role is nullable (Fix-AUDIT-01):
  // NULL means no role chosen yet → role selection.
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('active_role, terms_accepted_at')
    .eq('auth_user_id', user.id)
    .single()

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
