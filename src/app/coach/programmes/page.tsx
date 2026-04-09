'use client'
import { ProgrammesManagement } from '@/components/coach/ProgrammesManagement'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'

export default function Page() {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-y-auto">
        <ProgrammesManagement />
      </div>
      <CoachRightPanel />
    </div>
  )
}
