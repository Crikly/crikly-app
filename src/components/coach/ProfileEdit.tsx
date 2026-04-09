'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ChevronRight, User, Tag, Award, Calendar, ShieldCheck, CreditCard, CheckCircle2 } from 'lucide-react'

interface ProfileSection { id: string; icon: React.ReactNode; title: string; subtitle: string; isComplete: boolean }

export function ProfileEdit() {
  const router = useRouter()
  const [isPaused, setIsPaused] = useState(false)
  const sections: ProfileSection[] = [
    { id: 'personal', icon: <User size={20} className="text-[#0077CC]" />, title: 'Personal Info', subtitle: 'Name, bio, location, profile photo', isComplete: true },
    { id: 'sports', icon: <Tag size={20} className="text-[#0077CC]" />, title: 'Sports & Pricing', subtitle: 'Cricket · £50/hr 1-on-1', isComplete: true },
    { id: 'qualifications', icon: <Award size={20} className="text-[#0077CC]" />, title: 'Qualifications', subtitle: 'ECB Level 2 · DBS checked', isComplete: true },
    { id: 'availability', icon: <Calendar size={20} className="text-[#0077CC]" />, title: 'Availability', subtitle: 'Mon, Wed, Fri · 09:00–18:00', isComplete: true },
    { id: 'policy', icon: <ShieldCheck size={20} className="text-[#0077CC]" />, title: 'Booking Policy', subtitle: 'Instant booking · 24hr cancellation', isComplete: true },
    { id: 'payment', icon: <CreditCard size={20} className="text-[#0077CC]" />, title: 'Payment Setup', subtitle: 'Stripe connected · ****4242', isComplete: true }
  ]
  const sectionRoutes: Record<string, string> = {
    personal: '/coach/onboarding/profile',
    sports: '/coach/onboarding/pricing',
    qualifications: '/coach/onboarding/qualifications',
    availability: '/coach/availability',
    policy: '/coach/onboarding/policy',
    payment: '/coach/get-paid'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-md bg-gray-50 min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-4 bg-gray-50 sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Profile</h1>
        </div>
        <div className="px-5 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div className="w-16 h-16 bg-[#E6F3FB] rounded-full flex items-center justify-center text-[20px] font-bold text-[#0077CC]">AJ</div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm text-gray-600 cursor-pointer hover:text-[#0077CC] transition-colors"><Camera size={12} strokeWidth={2.5} /></div>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[18px] font-bold text-gray-900 truncate">Alex Johnson</h2>
                <div className="text-[14px] text-gray-500 font-medium mt-0.5 truncate">Cricket Coach · London</div>
              </div>
            </div>
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-bold text-gray-700">Profile 85% complete</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#0077CC] rounded-full" style={{ width: '85%' }} />
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden flex flex-col divide-y divide-gray-100">
            {sections.map((section) => (
              <button key={section.id} onClick={() => router.push(sectionRoutes[section.id])} className="w-full p-4 flex items-center text-left hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 bg-[#E6F3FB] rounded-full flex items-center justify-center shrink-0 mr-4">{section.icon}</div>
                <div className="flex-1 min-w-0 pr-4">
                  <div className="text-[15px] font-bold text-gray-900 truncate">{section.title}</div>
                  <div className="text-[13px] text-gray-500 font-medium mt-0.5 truncate">{section.subtitle}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {section.isComplete && <CheckCircle2 size={18} className="text-[#15803D] mr-1" />}
                  <ChevronRight size={20} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                </div>
              </button>
            ))}
          </div>
          <div className="pt-2 space-y-3">
            <h3 className="text-[12px] font-bold text-gray-500 uppercase tracking-wider px-1">Account</h3>
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
              <div className="flex flex-col divide-y divide-gray-100">
                <div className="p-4 px-5 flex items-center justify-between">
                  <span className="text-[15px] font-medium text-gray-600">Pause profile</span>
                  <button onClick={() => setIsPaused(!isPaused)} className={`w-11 h-6 rounded-full relative transition-colors ${isPaused ? 'bg-[#0077CC]' : 'bg-gray-200'}`}>
                    <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${isPaused ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <button className="w-full p-4 px-5 flex items-center text-left hover:bg-red-50 transition-colors">
                  <span className="text-[15px] font-bold text-[#DC2626]">Delete account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
