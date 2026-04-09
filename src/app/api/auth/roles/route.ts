import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

type Role = 'parent' | 'player' | 'coach'

const VALID_ROLES: Role[] = ['parent', 'player', 'coach']

export async function POST(request: Request) {
  try {
    const body = await request.json() as { role?: unknown }
    const role = body.role

    if (!role || !VALID_ROLES.includes(role as Role)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please select a valid role to continue.',
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
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to select a role.',
          },
        },
        { status: 401 }
      )
    }

    if (role === 'player') {
      const dob = user.user_metadata?.date_of_birth as string | undefined
      if (dob) {
        const birthDate = new Date(dob)
        const today = new Date()
        const age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        const actualAge = monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ? age - 1
          : age

        if (actualAge < 16) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'AGE_GATE',
                message: 'You must be 16 or older to register as a player.',
              },
            },
            { status: 403 }
          )
        }
      }
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        active_role: role as Role,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', user.id)

    if (profileError) {
      console.error('Profile upsert error:', profileError)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Could not save your role. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    const { error: metaError } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        primary_role: role,
        roles: [role],
      },
    })

    if (metaError) {
      console.error('Metadata update error:', metaError)
    }

    return NextResponse.json({
      success: true,
      redirectTo: '/onboarding/terms',
    })
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
