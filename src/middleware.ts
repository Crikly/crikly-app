import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── MS-18: App-live guard ─────────────────────────────────────────────────────
//
// When NEXT_PUBLIC_COACH_APP_LIVE is not 'true', all authenticated app routes
// redirect to /home so crikly.app can run purely as a marketing site.
// Flip the env var to 'true' to unlock the full app with no code changes.
//
// Paths that ARE blocked (redirect → /home):
//   /login, /register, /verify
//   /onboarding and all sub-paths
//   /coach and all sub-paths  (but NOT /coach-intro — see isBlockedPath)
//   /parent  and all sub-paths
//   /player  and all sub-paths
//   /dashboard and all sub-paths
//   /bookings  and all sub-paths
//   /admin     and all sub-paths
//
// Paths that are NEVER blocked (always pass through):
//   / /splash /home /coach-intro /intro /for-coaches /privacy /terms
//   /api/interest /api/waitlist /api/* (all API routes)
//   /_next  /favicon.ico  /images  /videos

function isBlockedPath(pathname: string): boolean {
  // Exact single-segment blocked routes
  const EXACT_BLOCKED = ['/login', '/register', '/verify']
  if (EXACT_BLOCKED.includes(pathname)) return true

  // Routes blocked at their root AND all sub-paths.
  // Using `=== root || startsWith(root + '/')` avoids matching /coach-intro
  // when the root is /coach.
  const ROOT_BLOCKED = [
    '/onboarding',
    '/coach',
    '/parent',
    '/player',
    '/dashboard',
    '/bookings',
    '/admin',
  ]
  for (const root of ROOT_BLOCKED) {
    if (pathname === root || pathname.startsWith(root + '/')) return true
  }

  return false
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // ── Guard block (MS-18) — runs before any auth logic ──────────────────────
  const appIsLive = process.env.NEXT_PUBLIC_COACH_APP_LIVE === 'true'

  if (!appIsLive && isBlockedPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    return NextResponse.redirect(url)
  }

  // ── Supabase session refresh ───────────────────────────────────────────────
  // Required by @supabase/ssr — must call getUser() to keep the session alive.
  // Do not add logic between createServerClient and supabase.auth.getUser().
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
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
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the session token. Must not be removed.
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static  (Next.js static bundles)
     * - _next/image   (Next.js image optimisation)
     * - favicon.ico
     * - images/ videos/ (public static assets)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|images/|videos/).*)',
  ],
}
