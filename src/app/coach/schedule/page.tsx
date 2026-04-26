'use client'
import { Suspense } from 'react'
import { Schedule } from '@/components/coach/Schedule'

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin" /></div>}>
      <Schedule />
    </Suspense>
  )
}
