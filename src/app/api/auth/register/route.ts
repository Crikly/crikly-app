import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RegisterRequest {
  email: string
  password: string
  full_name: string
}

function validateInput(body: unknown): RegisterRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body')
  }
  const { email, password, full_name } = body as Record<string, unknown>

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error('Valid email is required')
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters')
  }
  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    throw new Error('Full name is required')
  }

  return {
    email: email.toLowerCase().trim(),
    password,
    full_name: full_name.trim(),
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, full_name } = validateInput(body)

    const supabase = await createClient()

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
        },
      },
    })

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        )
      }
      console.error('[register] auth.signUp error:', authError.message)
      return NextResponse.json(
        { error: 'Registration failed. Please try again.' },
        { status: 500 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Registration failed. Please try again.' },
        { status: 500 }
      )
    }

    const authProvider =
      authData.user.app_metadata?.provider ?? 'email'

    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        auth_user_id: authData.user.id,
        full_name,
        country_code: 'GB',
        active_role: 'parent',
        auth_provider: authProvider,
      })

    if (profileError) {
      console.error('[register] user_profiles insert error:', profileError.message)
      return NextResponse.json(
        { error: 'Account created but profile setup failed. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
        session: authData.session,
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
