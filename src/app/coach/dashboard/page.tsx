'use client'

import { CoachShell } from '@/components/coach/CoachShell'
import { CoachHome } from '@/components/coach/CoachHome'

export default function CoachDashboardPage() {
  return (
    <CoachShell activeItem="home">
      <CoachHome />
    </CoachShell>
  )
}
