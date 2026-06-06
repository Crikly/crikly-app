import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

// AUTH-FIX-01 (FIX B): replace the no-op stub with a real handler that
// writes user_profiles.terms_accepted_at. Previously the API returned
// { success: true } without touching the DB, so the column stayed NULL
// for every user — breaking legal/compliance audit trail and leaving
// nothing for downstream gates (e.g. coach/layout.tsx) to enforce.

export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to accept the terms.',
          },
        },
        { status: 401 },
      )
    }

    const now = new Date().toISOString()
    // .select('id').single() chained on the UPDATE so PostgREST returns
    // PGRST116 if zero rows matched. Without this the UPDATE silently
    // succeeds even when the user_profiles row is missing (auth callback
    // race), and we'd return { success: true } without writing — leaving
    // a phantom "accepted" state with no legal audit trail.
    const { data: updatedRow, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        terms_accepted_at: now,
        updated_at: now,
      })
      .eq('auth_user_id', user.id)
      .select('id')
      .single()

    if (updateError || !updatedRow) {
      console.error('[POST /api/auth/accept-terms] update error (or no row matched):', updateError)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Could not save terms acceptance. Please try again.',
          },
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/auth/accept-terms] unexpected error:', err)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'Unexpected error. Please try again.',
        },
      },
      { status: 500 },
    )
  }
}
