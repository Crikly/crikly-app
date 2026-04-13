'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, ChevronRight, User, Tag, Award, Calendar, ShieldCheck, CreditCard, CheckCircle2, Star, Share2, ExternalLink, Circle } from 'lucide-react'

interface ProfileSection { id: string; icon: React.ReactNode; title: string; subtitle: string; isComplete: boolean }

export function ProfileEdit() {
  const router = useRouter()
  const [isPaused, setIsPaused] = useState(false)
  // CF-D07 CHANGE 2: Mark Qualifications as incomplete to demonstrate pattern
  const sections: ProfileSection[] = [
    { id: 'personal', icon: <User size={18} className="text-[#0077CC]" />, title: 'Personal Info', subtitle: 'Name, bio, location, profile photo', isComplete: true },
    { id: 'sports', icon: <Tag size={18} className="text-[#0077CC]" />, title: 'Sports & Pricing', subtitle: 'Cricket · £50/hr 1-on-1', isComplete: true },
    { id: 'qualifications', icon: <Award size={18} className="text-[#F59E0B]" />, title: 'Qualifications', subtitle: 'Add your coaching badge and DBS certificate', isComplete: false },
    { id: 'availability', icon: <Calendar size={18} className="text-[#0077CC]" />, title: 'Availability', subtitle: 'Mon, Wed, Fri · 09:00–18:00', isComplete: true },
    { id: 'policy', icon: <ShieldCheck size={18} className="text-[#0077CC]" />, title: 'Booking Policy', subtitle: 'Instant booking · 24hr cancellation', isComplete: true },
    { id: 'payment', icon: <CreditCard size={18} className="text-[#0077CC]" />, title: 'Payment Setup', subtitle: 'Stripe connected · ****4242', isComplete: true }
  ]
  const sectionRoutes: Record<string, string> = {
    personal: '/coach/onboarding/profile',
    sports: '/coach/onboarding/pricing',
    qualifications: '/coach/onboarding/qualifications',
    availability: '/coach/availability',
    policy: '/coach/onboarding/policy',
    payment: '/coach/get-paid'
  }

  const profileCompleteness = 85
  
  return (
    <div className="min-h-screen bg-white font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto bg-white min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-4 bg-white sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Profile</h1>
        </div>
        <div className="px-5 space-y-4">
          {/* CF-D07 CHANGE 1: Identity hero with stronger presence */}
          {/* CF-D07b POLISH 1: Increased padding to 24px */}
          <div className="bg-white rounded-[14px] p-6 shadow-sm">
            {/* Top row */}
            {/* CF-D07b POLISH 1: Increased gap to 16px */}
            <div className="flex gap-4 items-start mb-3.5">
              {/* Avatar with edit overlay */}
              <div className="relative shrink-0">
                <div className="w-16 h-16 bg-[#E6F1FB] rounded-full flex items-center justify-center text-[20px] font-medium text-[#0C447C]">AJ</div>
                <button 
                  onClick={() => {
                    // TODO CF-D07: wire avatar upload
                  }}
                  className="absolute bottom-0 right-0 w-5 h-5 bg-[#0077CC] rounded-full flex items-center justify-center border-2 border-white cursor-pointer hover:bg-[#0066AA] transition-colors"
                >
                  <Pencil size={10} className="text-white" />
                </button>
              </div>
              
              {/* Coach info */}
              <div className="flex-1 min-w-0">
                {/* CF-D07b POLISH 1: Increased name to 20px */}
                <h2 className="text-[20px] font-medium text-gray-900 truncate">Alex Johnson</h2>
                <div className="text-[13px] text-gray-500 mt-0.5 truncate">Cricket Coach · London</div>
                
                {/* Trust row */}
                {/* CF-D07b POLISH 1: Increased gap to 12px between rating and DBS */}
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex items-center gap-1">
                    <Star size={13} className="text-amber-500 fill-amber-500" />
                    <span className="text-[13px] font-medium text-gray-900">4.8</span>
                    <span className="text-[11px] text-gray-400">(42 reviews)</span>
                  </div>
                  <div className="px-2 py-0.5 bg-[#E0F6F8] text-[#006677] text-[10px] font-medium rounded-full">
                    ✓ DBS checked
                  </div>
                </div>
              </div>
              
              {/* Action buttons */}
              {/* CF-D07b POLISH 1: Added margin-left auto to push buttons to far right */}
              <div className="flex gap-2 shrink-0 ml-auto">
                <button 
                  onClick={() => {
                    // TODO CF-D07: wire to public profile preview
                  }}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-full hover:bg-gray-50 transition-colors flex items-center gap-1"
                >
                  Preview <ExternalLink size={10} />
                </button>
                <button 
                  onClick={() => {
                    // TODO CF-D07: wire to share profile
                  }}
                  className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-full hover:bg-gray-50 transition-colors flex items-center gap-1"
                >
                  <Share2 size={10} /> Share
                </button>
              </div>
            </div>
            
            {/* Progress section */}
            {/* CF-D07b POLISH 1: Increased padding-top to 16px */}
            <div className="pt-4 border-t-[0.5px] border-gray-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-gray-900">Profile completeness</span>
                <span className="text-[12px] font-medium text-[#0077CC]">{profileCompleteness}%</span>
              </div>
              <div className="h-1.5 bg-[#E6F1FB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0077CC] rounded-full transition-all" style={{ width: `${profileCompleteness}%` }} />
              </div>
              {/* CF-D07b POLISH 2: More outcome-oriented motivational copy */}
              <p className="text-[11px] font-medium text-[#0077CC] mt-1">
                {profileCompleteness < 100 
                  ? 'Almost there — add your qualifications to build trust with parents'
                  : 'Your profile is live — parents can find and book you'
                }
              </p>
            </div>
          </div>
          {/* CF-D07 CHANGE 2: Section rows with complete/incomplete hierarchy */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {sections.map((section, index) => {
              const isLast = index === sections.length - 1
              return (
                <button 
                  key={section.id} 
                  onClick={() => router.push(sectionRoutes[section.id])} 
                  className={`w-full flex items-center gap-3 text-left transition-colors group ${
                    !section.isComplete 
                      ? 'bg-[#FFFBEB] hover:bg-[#FEF9EE] px-4 py-[15px]' 
                      : 'bg-white hover:bg-gray-50/50 px-4 py-3.5'
                  } ${!isLast ? 'border-b-[0.5px] border-gray-100' : ''}`}
                >
                  {/* Icon container */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    !section.isComplete ? 'bg-[#FEF3C7]' : 'bg-[#F0FDF4]'
                  }`}>
                    {section.icon}
                  </div>
                  
                  {/* Section content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {/* CF-D07b POLISH 3: Complete rows more muted (gray-500 weight 400), incomplete sharper (gray-900 weight 500) */}
                      <span className={`text-[13px] truncate ${
                        !section.isComplete 
                          ? 'font-medium text-gray-900' 
                          : 'font-normal text-gray-500'
                      }`}>
                        {section.title}
                      </span>
                      {/* CF-D07b POLISH 3: Refined "Do next" badge */}
                      {!section.isComplete && (
                        <span className="px-1.5 py-0.5 bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium rounded shrink-0 ml-2">
                          Do next
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] mt-0.5 truncate ${
                      !section.isComplete ? 'text-[#92400E]' : 'text-gray-400'
                    }`}>
                      {section.subtitle}
                    </div>
                  </div>
                  
                  {/* Right indicators */}
                  {/* CF-D07b POLISH 3: Reduced tick to 16px circle, empty circle to 16px */}
                  <div className="flex items-center gap-2 shrink-0">
                    {section.isComplete ? (
                      <div className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={11} className="text-green-700" strokeWidth={2.5} />
                      </div>
                    ) : (
                      <Circle size={16} className="text-[#FCD34D]" strokeWidth={1.5} />
                    )}
                    <ChevronRight size={18} className={!section.isComplete ? 'text-gray-400' : 'text-gray-300'} />
                  </div>
                </button>
              )
            })}
          </div>
          {/* CF-D07 CHANGE 3: Account section with calmer tone */}
          {/* CF-D07b POLISH 5: Increased margin-top to 24px for more separation */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-6">
            <div className="px-4 pt-3 pb-1.5">
              <h3 className="text-[9px] font-medium text-gray-400 uppercase tracking-wider">ACCOUNT</h3>
            </div>
            
            {/* Pause profile row */}
            <div className="px-4 py-3.5 flex items-center justify-between border-t-[0.5px] border-gray-100">
              <div className="flex-1">
                <div className="text-[13px] font-medium text-gray-900">Pause profile</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Temporarily hide from search</div>
              </div>
              <button 
                onClick={() => setIsPaused(!isPaused)} 
                className={`w-11 h-6 rounded-full relative transition-colors ${isPaused ? 'bg-[#0077CC]' : 'bg-gray-200'}`}
              >
                <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${isPaused ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            
            {/* Delete account row */}
            {/* CF-D07b POLISH 5: Ghost/text-only feel - text darkens on hover, no bg change */}
            <button className="w-full px-4 py-3.5 flex items-center justify-between text-left transition-colors border-t-[0.5px] border-gray-100 hover:text-red-800">
              <span className="text-[13px] font-medium text-[#B91C1C]">Delete account</span>
              <ChevronRight size={18} className="text-red-300" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
