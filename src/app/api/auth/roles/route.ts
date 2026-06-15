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

    // Fix-12: First get the user_profile_id
    const { data: userProfile, error: profileFetchError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileFetchError || !userProfile) {
      console.error('Profile fetch error:', profileFetchError)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Could not find your profile. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    // Fix-12: Update active_role in user_profiles
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        active_role: role as Role,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', user.id)

    if (profileError) {
      console.error('Profile update error:', profileError)
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

    // Fix-12: Insert into user_roles table (critical for coach API access)
    // Use upsert to handle case where row already exists
    const { error: roleInsertError } = await supabase
      .from('user_roles')
      .upsert(
        {
          user_profile_id: userProfile.id,
          role: role as Role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_profile_id,role',
          ignoreDuplicates: true, // Don't error if row already exists
        }
      )

    if (roleInsertError) {
      console.error('Role insert error:', roleInsertError)
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

    // Fix-ROLES-01: eagerly create the coach_profiles row at role-selection
    // time so the coach dashboard's parallel API fan-out (Variant-B routes —
    // profile, sports, qualifications) doesn't 404 racing the lazy Variant-C
    // creation. Non-fatal: requireCoachContextOrCreate stays as the safety net,
    // and ignoreDuplicates makes a repeat call a silent no-op. Mirrors Variant
    // C's payload (require-coach.ts) — minimal insert; other columns default.
    if (role === 'coach') {
      const { error: coachProfileError } = await supabase
        .from('coach_profiles')
        .upsert(
          {
            user_profile_id: userProfile.id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_profile_id',
            ignoreDuplicates: true,
          }
        )

      if (coachProfileError) {
        console.error('[Fix-ROLES-01] coach_profiles eager-create error:', coachProfileError)
      }
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
