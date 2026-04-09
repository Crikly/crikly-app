'use client'
import { BookingsManagement } from '@/components/coach/BookingsManagement'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'

export default function Page() {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-y-auto">
        <BookingsManagement />
      </div>
      <CoachRightPanel />
    </div>
  )
}
