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
      // Fetch coach profile
      const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/coaches/profile`, {
        headers: {
          'Cookie': `sb-access-token=${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      })

      if (response.ok) {
        const profile = await response.json()
        coachName = profile.full_name || ''
        avatarUrl = profile.avatar_url
      }
    }
  } catch (error) {
    // Fail silently - use empty defaults
    console.error('Error fetching coach profile:', error)
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
