import React from 'react'
import { createClient } from '@/lib/supabase/server'
import { CoachLayoutClient } from '@/components/coach/CoachLayoutClient'

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch coach profile data server-side
  let coachName = ''
  let avatarUrl: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Fetch user profile directly from Supabase
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('full_name, avatar_url')
        .eq('auth_user_id', user.id)
        .single()

      if (userProfile) {
        coachName = userProfile.full_name || ''
        avatarUrl = userProfile.avatar_url || null
      }
    }
  } catch (error) {
    // Fail silently - use empty defaults
  }

  return (
    <CoachLayoutClient
      initialCoachName={coachName}
      initialAvatarUrl={avatarUrl}
    >
      {children}
    </CoachLayoutClient>
  )
}
