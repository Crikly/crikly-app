'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PricingStep, SportPricingData } from '@/components/coach/onboarding/PricingStep'

export default function OnboardingPricingPage(): React.ReactElement {
  const router = useRouter()
  const [selectedSports, setSelectedSports] = useState<string[]>([])

  useEffect(() => {
    // Retrieve selected sports from sessionStorage
    const stored = sessionStorage.getItem('selectedSports')
    if (stored) {
      setSelectedSports(JSON.parse(stored))
    } else {
      // If no sports selected, redirect back to sport selection
      router.push('/coach/onboarding/sport')
    }
  }, [router])

  const handleSave = async (data: SportPricingData): Promise<void> => {
    // Call the API to save sport configuration
    const response = await fetch('/api/coaches/sports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sport_id: data.sportId,
        session_types: data.sessionTypes,
        skill_levels: data.skillLevels,
        age_groups: data.ageGroups,
        // Convert pricing rows to session types format
        session_durations: data.pricingRows.map(row => ({
          duration_minutes: row.duration,
          price_individual_pence: row.price,
        })),
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || 'Failed to save sport configuration')
    }

    // Navigate to next step (qualifications)
    router.push('/coach/onboarding/qualifications')
  }

  const handleSaveDraft = (): void => {
    router.push('/coach/dashboard')
  }

  if (selectedSports.length === 0) {
    return <div>Loading...</div>
  }

  return (
    <PricingStep
      selectedSports={selectedSports}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
    />
  )
}
