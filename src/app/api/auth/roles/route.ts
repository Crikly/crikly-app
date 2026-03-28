import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type ValidRole = 'parent' | 'player' | 'coach'

const VALID_ROLES: ValidRole[] = ['parent', 'player', 'coach']

function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return age
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { role, date_of_birth } = body as Record<string, unknown>

    if (!role || typeof role !== 'string') {
      return NextResponse.json(
        { error: 'Role is required' },
        { status: 400 }
      )
    }

    if (!VALID_ROLES.includes(role as ValidRole)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      )
    }

    if (role === 'player') {
      if (!date_of_birth || typeof date_of_birth !== 'string') {
        return NextResponse.json(
          { error: 'Date of birth is required for player registration' },
          { status: 400 }
        )
      }

      const dobDate = new Date(date_of_birth)
      if (isNaN(dobDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date of birth format. Use YYYY-MM-DD' },
          { status: 400 }
        )
      }

      const age = calculateAge(date_of_birth)
      if (age < 16) {
        return NextResponse.json(
          { error: 'You must be 16 or older to register as a player' },
          { status: 403 }
        )
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profileError || !profile) {
      console.error('[roles] user_profiles lookup error:', profileError?.message)
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    const { data: newRole, error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_profile_id: profile.id,
        role: role as ValidRole,
        is_active: true,
      })
      .select()
      .single()

    if (roleError) {
      if (roleError.code === '23505') {
        return NextResponse.json(
          { error: 'You already have this role on your account' },
          { status: 409 }
        )
      }
      console.error('[roles] user_roles insert error:', roleError.message)
      return NextResponse.json(
        { error: 'Failed to assign role. Please try again.' },
        { status: 500 }
      )
    }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ active_role: role })
      .eq('id', profile.id)

    if (updateError) {
      console.error('[roles] active_role update error:', updateError.message)
    }

    return NextResponse.json(
      {
        role: newRole.role,
        created_at: newRole.created_at,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
