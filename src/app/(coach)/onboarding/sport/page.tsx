'use client'

import { useRouter } from 'next/navigation'
import { SportStep } from '@/components/coach/onboarding/SportStep'

export default function OnboardingSportPage(): React.ReactElement {
  const router = useRouter()

  const handleContinue = (sportIds: string[]): void => {
    // Store selected sports in sessionStorage for use in pricing step
    sessionStorage.setItem('selectedSports', JSON.stringify(sportIds))
    router.push('/coach/onboarding/pricing')
  }

  const handleSaveDraft = (): void => {
    router.push('/coach/dashboard')
  }

  return <SportStep onContinue={handleContinue} onSaveDraft={handleSaveDraft} />
}
