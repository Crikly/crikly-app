'use client'

import { useRouter } from 'next/navigation'
import { ProfileStep, ProfileData } from '@/components/coach/onboarding/ProfileStep'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingProfilePage(): React.ReactElement {
  const router = useRouter()

  const handleSave = async (data: ProfileData): Promise<void> => {
    const supabase = createClient()

    // TODO: Upload photo to Supabase Storage if provided
    let photoUrl: string | undefined

    if (data.photo) {
      // For now, skip photo upload - will be implemented later
      // const { data: uploadData, error: uploadError } = await supabase.storage
      //   .from('coach-photos')
      //   .upload(`${userId}/${Date.now()}.jpg`, data.photo)
    }

    // Call the API to save profile
    const response = await fetch('/api/coaches/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: data.displayName,
        bio: data.bio,
        base_location: data.baseLocation,
        travel_radius: data.travelRadius,
        years_experience: data.yearsExperience,
        gender: data.gender,
        languages: data.languages,
        photo_url: photoUrl,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to save profile')
    }

    // Navigate to next step
    router.push('/coach/onboarding/sport')
  }

  const handleSaveDraft = (): void => {
    router.push('/coach/dashboard')
  }

  return <ProfileStep onSave={handleSave} onSaveDraft={handleSaveDraft} />
}
