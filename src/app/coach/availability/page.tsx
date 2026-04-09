'use client'
import { AvailabilityManagement } from '@/components/coach/AvailabilityManagement'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'

export default function AvailabilityPage() {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-y-auto">
        <AvailabilityManagement />
      </div>
      <CoachRightPanel />
    </div>
  )
}
