import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(request: Request) {
  try {
    const body = await request.json() as { provider?: unknown }
    const provider = body.provider

    if (provider !== 'google' && provider !== 'apple') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid provider.' } },
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

    // Fix-OAUTH-02: build redirectTo from the request origin so OAuth works on
    // any deployment (production, *.vercel.app previews, local) without a
    // per-environment env var. NEXT_PUBLIC_SITE_URL is Production-only, so
    // previews previously got `undefined/auth/callback`. Safe against a forged
    // Origin because Supabase only honours redirect URLs in its allowlist.
    const origin =
      request.headers.get('origin') ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      'http://localhost:3000'

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback`,
        scopes: provider === 'google' ? 'openid email profile' : undefined,
      },
    })

    if (error || !data.url) {
      return NextResponse.json(
        { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Could not start OAuth flow.' } },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, url: data.url })
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'UNKNOWN_ERROR', message: 'Unexpected error.' } },
      { status: 500 }
    )
  }
}
