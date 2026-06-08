import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// ── MS-18: App-live guard ─────────────────────────────────────────────────────
// When NEXT_PUBLIC_COACH_APP_LIVE is not 'true', all authenticated app routes
// redirect to /home. Flip to 'true' to unlock the full app with no code changes.
// /coach-intro is intentionally NOT blocked: uses startsWith('/coach/') not '/coach'
const APP_LIVE_BLOCKED_EXACT = ['/login', '/register', '/verify']
const APP_LIVE_BLOCKED_ROOTS = [
  '/onboarding',
  '/coach',
  '/parent',
  '/player',
  '/dashboard',
  '/bookings',
  '/admin',
]

function isBlockedWhenNotLive(pathname: string): boolean {
  if (APP_LIVE_BLOCKED_EXACT.includes(pathname)) return true
  for (const root of APP_LIVE_BLOCKED_ROOTS) {
    if (pathname === root || pathname.startsWith(root + '/')) return true
  }
  return false
}

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/auth/callback',
  '/forgot-password',
  '/reset-password',
  '/',
]

const PROTECTED_PREFIXES = [
  '/parent',
  '/player',
  '/coach',
  '/admin',
  '/dashboard',
  '/onboarding',
  '/account',
]

// Routes accessible to everyone — no auth gate, no redirect to dashboard.
// These are public-facing pages (coach profiles, search results, etc.)
// that must never be intercepted by auth logic.
const OPEN_PREFIXES = [
  '/coaches',
  '/search',
]

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

function isOpenRoute(pathname: string): boolean {
  return OPEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── App-live guard (MS-18) — runs before any auth logic ───────────────────
  if (process.env.NEXT_PUBLIC_COACH_APP_LIVE !== 'true' && isBlockedWhenNotLive(pathname)) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Always use getUser() — never getSession() in middleware
  const { data: { user } } = await supabase.auth.getUser()

  if (isOpenRoute(pathname)) {
    return response
  }

  // AUTH-JOURNEY-01: profile-completeness gate. A logged-in user with an
  // incomplete profile must finish onboarding before reaching any protected
  // app route. Excludes /onboarding/* (would loop), /login and /register.
  // Terms-first ordering, matching the OAuth callback + password-login gates.
  if (
    user &&
    isProtectedRoute(pathname) &&
    !pathname.startsWith('/onboarding') &&
    pathname !== '/login' &&
    pathname !== '/register'
  ) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('active_role, terms_accepted_at')
      .eq('auth_user_id', user.id)
      .single()

    if (!profile || !profile.terms_accepted_at) {
      return NextResponse.redirect(new URL('/onboarding/terms', request.url))
    }
    if (!profile.active_role) {
      return NextResponse.redirect(new URL('/onboarding/role', request.url))
    }
  }

  if (isProtectedRoute(pathname) && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isPublicRoute(pathname) && user && pathname !== '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
