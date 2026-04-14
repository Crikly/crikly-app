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

  const hasRole = user.user_metadata?.primary_role
  const redirectTo = hasRole ? '/dashboard' : '/onboarding/role'

  return NextResponse.redirect(new URL(redirectTo, origin))
}
