import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

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
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isOpenRoute(pathname: string): boolean {
  return OPEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export default async function proxy(request: NextRequest) {
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
  const { pathname } = request.nextUrl

  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Always use getUser() — never getSession() in middleware
  const { data: { user } } = await supabase.auth.getUser()

  if (isOpenRoute(pathname)) {
    return response
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
