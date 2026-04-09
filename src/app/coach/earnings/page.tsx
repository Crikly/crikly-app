'use client'
import { Earnings } from '@/components/coach/Earnings'
import { CoachRightPanel } from '@/components/coach/CoachRightPanel'

export default function Page() {
  return (
    <div className="flex min-h-screen">
      <div className="flex-1 overflow-y-auto">
        <Earnings />
      </div>
      <CoachRightPanel />
    </div>
  )
}
