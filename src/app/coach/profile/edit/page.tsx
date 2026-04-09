'use client'
import { ProfileEdit } from '@/components/coach/ProfileEdit'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'

export default function Page() {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-y-auto">
        <ProfileEdit />
      </div>
      <CoachRightPanel />
    </div>
  )
}
