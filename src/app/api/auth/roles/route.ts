import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'
import { sendCoachWelcomeEmail } from '@/lib/resend/coach-lifecycle-emails'

type Role = 'parent' | 'player' | 'coach'

const VALID_ROLES: Role[] = ['parent', 'player', 'coach']

// P-04-C: PATCH — lightweight active_role-only switch between roles the user
// ALREADY holds. The POST below is a full role-setup flow (user_roles upsert,
// coach_profiles eager-create, welcome email, metadata rewrite) and must not
// run on every switch — switching is a pure pointer update. Adding a NEW role
// stays on POST.
export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { role?: unknown }
    const role = body.role

    if (!role || !VALID_ROLES.includes(role as Role)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please select a valid role to switch to.',
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
            message: 'You must be logged in to switch roles.',
          },
        },
        { status: 401 }
      )
    }

    const { data: userProfile, error: profileFetchError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileFetchError || !userProfile) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Could not load your profile. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    // The switch is only valid for a role the account already holds — adding
    // a role goes through POST (which owns the setup side-effects).
    const { data: heldRole, error: heldRoleError } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .eq('role', role as Role)
      .maybeSingle()

    if (heldRoleError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Could not verify your roles. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    if (!heldRole) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ROLE_NOT_HELD',
            message: 'You have not added this role to your account yet.',
          },
        },
        { status: 403 }
      )
    }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        active_role: role as Role,
        updated_at: new Date().toISOString(),
      })
      .eq('auth_user_id', user.id)

    if (updateError) {
      console.error('active_role switch error:', updateError)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: 'Could not switch roles. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      redirectTo: role === 'coach' ? '/coach/dashboard' : '/parent/dashboard',
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
    const { data: existingProfile, error: profileFetchError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    // BUG-26: if the auth callback that normally creates user_profiles failed
    // (DB hiccup, deploy mid-flight, timeout), the user is authenticated but
    // has no profile row and gets stranded here with no escape. Recover by
    // creating the row from the authenticated session — mirroring the callback
    // payload EXACTLY (auth/callback/route.ts): auth_user_id, full_name,
    // avatar_url, auth_provider. terms_accepted_at is deliberately left NULL so
    // the user still passes through /onboarding/terms and gives explicit
    // consent. The upsert is idempotent (auth_user_id is UNIQUE), so a repeat
    // click or a slow callback racing us converges to a single row. Only if
    // this recovery also fails do we surface a human-readable error. Happy path
    // (row already exists) skips this block entirely — zero extra DB calls.
    //
    // The trigger is intentionally broad (any fetch error OR no row), not just
    // PGRST116 "no rows": the recovery upsert is fail-safe either way — a
    // genuine miss is created, and a transient SELECT blip on an existing row
    // harmlessly updates-and-returns it. Narrowing to PGRST116 would instead
    // 500 on a transient error that an upsert would have recovered, and risk a
    // null deref downstream. We log the original error so the miss-vs-transient
    // distinction is preserved for diagnosis.
    let userProfile = existingProfile
    if (profileFetchError || !userProfile) {
      console.error('[BUG-26] profile fetch missed, attempting recovery:', profileFetchError)
      const fullName = (user.user_metadata?.full_name as string | undefined)
        || (user.user_metadata?.name as string | undefined)
        || ''
      const avatarUrl = (user.user_metadata?.avatar_url as string | undefined)
        || (user.user_metadata?.picture as string | undefined)
        || null

      // BUG-35: ignoreDuplicates:true → ON CONFLICT DO NOTHING. The recovery
      // trigger is deliberately broad (see above), so it can fire on a
      // transient SELECT blip when a row DOES exist — DO UPDATE here would
      // overwrite that row's user-entered full_name/avatar_url with provider
      // metadata. DO NOTHING returns no rows on conflict, so the id comes
      // from the follow-up SELECT, which serves both the fresh-insert and
      // existing-row cases. Do not reintroduce DO UPDATE.
      const { error: recoveryError } = await supabase
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

      const { data: recoveredProfile, error: recoveredFetchError } = recoveryError
        ? { data: null, error: null }
        : await supabase
            .from('user_profiles')
            .select('id')
            .eq('auth_user_id', user.id)
            .single()

      if (recoveryError || recoveredFetchError || !recoveredProfile) {
        console.error('[BUG-26] profile recovery upsert failed:', recoveryError ?? recoveredFetchError)
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'UNKNOWN_ERROR',
              message: 'Could not create your profile. Please try again.',
            },
          },
          { status: 500 }
        )
      }

      userProfile = recoveredProfile
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

    // PILOT-01 Email 1: the welcome email must fire only on FIRST-TIME coach
    // registration, and the upsert below (ignoreDuplicates) makes the row
    // exist unconditionally — so detect "already a coach" before it runs.
    // Coach-only check: parent/player selections skip the extra round-trip.
    let isFirstTimeCoach = false
    if (role === 'coach') {
      const { data: existingCoachRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_profile_id', userProfile.id)
        .eq('role', 'coach')
        .maybeSingle()
      isFirstTimeCoach = !existingCoachRole
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

      // PILOT-01 Email 1: welcome the coach. Awaited (serverless can kill
      // un-awaited work) but can never throw or fail role selection — the
      // sender swallows and logs its own errors.
      if (isFirstTimeCoach && user.email) {
        const welcomeName =
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          (user.user_metadata?.name as string | undefined)?.trim() ||
          'there'
        const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        await sendCoachWelcomeEmail({
          coachEmail: user.email,
          coachName: welcomeName,
          dashboardUrl: `${base}/coach/dashboard`,
        })
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
