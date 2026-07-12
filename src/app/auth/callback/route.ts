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

  // AUTH-JOURNEY-01 / Fix-AUDIT-02: route by canonical user_profiles state
  // (role-first), matching the proxy gate + password-login gate. Do NOT route
  // on user_metadata.primary_role — it can drift from the DB. Uses the existing
  // SSR client (the user's own session). active_role is nullable (Fix-AUDIT-01):
  // NULL means no role chosen yet → role selection.
  //
  // BUG-35: this read now happens BEFORE any profile write — the same row
  // drives both the seed-vs-fill-gaps decision below and the routing gate.
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('active_role, terms_accepted_at, full_name, avatar_url')
    .eq('auth_user_id', user.id)
    .single()

  // BUG-34 hardening: .single() previously conflated "no row" (PGRST116) with
  // transient query failures, so a DB blip would dump a fully-onboarded user
  // into role selection. Route transient failures to /dashboard — a pure
  // router that re-reads the profile — and log for diagnosis. Genuine no-row
  // results (new users) fall through to the gate below unchanged. No profile
  // write happens on this path (BUG-35): a trustworthy read is required to
  // decide seed-vs-fill-gaps. If the blipped user was genuinely new (no row),
  // /dashboard is a pure router (Fix-AUDIT-02) that re-reads the profile,
  // finds no row, and forwards to /onboarding/role — where the BUG-26
  // recovery upsert creates it. The safety net covers this branch too.
  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[auth/callback] user_profiles read failed:', {
      userId: user.id,
      code: profileError.code,
      message: profileError.message,
    })
    return NextResponse.redirect(new URL('/dashboard', origin))
  }

  // Fix-PROD-PROFILE-01 (1b) + BUG-35: seed OR fill gaps — NEVER overwrite.
  // This callback is the single user_profiles seed point for ALL auth paths
  // (OAuth first login AND the email-verify link — /api/auth/register does not
  // create the row). Fix-PROD-PROFILE-01 originally used ON CONFLICT DO UPDATE
  // "so a returning user's name/avatar stay current" — that deliberately
  // overwrote user-entered full_name/avatar_url with provider metadata on
  // EVERY OAuth login (BUG-35: a coach who registered by email came back with
  // their Google name/photo). Provider metadata must only ever FILL GAPS:
  //   - no row            → full metadata seed (Fix-11i preserved)
  //   - row, empty field  → fill that field only
  //   - row, user value   → never touched; no write is issued at all
  // Do not reintroduce DO UPDATE here. auth_provider is frozen at its seeded
  // value (no code reads it). Errors are logged, never block the auth flow.
  try {
    const fullName = (user.user_metadata?.full_name as string | undefined)
      || (user.user_metadata?.name as string | undefined)
      || ''
    const avatarUrl = (user.user_metadata?.avatar_url as string | undefined)
      || (user.user_metadata?.picture as string | undefined)
      || null

    if (!userProfile) {
      // New user (PGRST116): full metadata seed. ignoreDuplicates:true →
      // ON CONFLICT DO NOTHING, so a concurrent callback race can never
      // overwrite — the loser is a silent no-op.
      const { error: seedError } = await supabase
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
            ignoreDuplicates: true,
          }
        )
      if (seedError) {
        console.error('[auth/callback] user_profiles seed failed:', {
          userId: user.id,
          code: seedError.code,
          message: seedError.message,
          details: seedError.details,
        })
        // Still do not block the auth flow — the user lands on
        // /onboarding/role where the BUG-26 recovery upsert takes over.
      }
    } else {
      const gapFill: { full_name?: string; avatar_url?: string; updated_at?: string } = {}
      if ((!userProfile.full_name || userProfile.full_name.trim() === '') && fullName) {
        gapFill.full_name = fullName
      }
      if (!userProfile.avatar_url && avatarUrl) {
        gapFill.avatar_url = avatarUrl
      }
      if (Object.keys(gapFill).length > 0) {
        gapFill.updated_at = new Date().toISOString()
        const { error: gapFillError } = await supabase
          .from('user_profiles')
          .update(gapFill)
          .eq('auth_user_id', user.id)
        if (gapFillError) {
          console.error('[auth/callback] user_profiles gap-fill failed:', {
            userId: user.id,
            code: gapFillError.code,
            message: gapFillError.message,
          })
        }
      }
    }
  } catch (err) {
    console.error('[auth/callback] user_profiles write threw:', err)
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
