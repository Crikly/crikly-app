'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Search, Calendar, Banknote, Copy, Share, ArrowRight } from 'lucide-react'

export function GoLiveStep() {
  const router = useRouter()

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pt-16 pb-32">
      <div className="w-full max-w-[500px] px-6 flex flex-col items-center text-center">
        <div className="mb-10 w-full flex flex-col items-center">
          <img
            src="/logo.png"
            alt="Crikly"
            className="w-28 h-auto object-contain mb-12"
          />
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-8 shadow-sm">
            <Check size={40} className="text-white" strokeWidth={3} />
          </div>
          <h1 className="text-[32px] font-bold text-[#0F172A] leading-tight mb-3">You're live!</h1>
          <p className="text-[16px] text-gray-500 font-medium">Parents and players can now find and book you on Crikly</p>
        </div>

        <div className="w-full bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-8 text-left">
          <h2 className="text-[16px] font-bold text-gray-900 mb-6">What happens next?</h2>
          <div className="flex flex-col gap-5">
            {[
              { Icon: Search, label: 'You appear in search results immediately' },
              { Icon: Calendar, label: 'Bookings will show up on your dashboard' },
              { Icon: Banknote, label: 'Get paid 48 hours after each session' },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Icon size={20} className="text-[#0077CC]" />
                </div>
                <span className="text-[15px] text-gray-700 font-medium">{label}</span>
              </div>
            ))}
          </div>
          <div className="h-px bg-gray-100 w-full my-8"></div>
          <div className="flex flex-col">
            <h2 className="text-[16px] font-bold text-gray-900 mb-1">Share your profile</h2>
            <p className="text-[14px] text-gray-500 font-medium mb-4">Let people know you're on Crikly</p>
            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-[14px] text-gray-700 font-medium mb-4 font-mono truncate">
              crikly.app/coach
            </div>
            <div className="flex gap-3">
              <button className="flex-1 py-2.5 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-[14px] transition-colors flex items-center justify-center gap-2">
                <Copy size={16} />Copy link
              </button>
              <button className="flex-1 py-2.5 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-bold text-[14px] transition-colors flex items-center justify-center gap-2">
                <Share size={16} />Share
              </button>
            </div>
          </div>
        </div>

        <div className="w-full flex flex-col items-center gap-6 mt-4">
          <button onClick={() => router.push('/coach/dashboard')} className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2">
            Go to my dashboard <ArrowRight size={18} />
          </button>
          <div className="text-center px-4">
            <p className="text-[14px] text-gray-500 font-medium mb-1">
              Want to upgrade to Premium? Get more bookings with priority search placement.
            </p>
            <button className="text-[14px] font-bold text-[#0077CC] hover:text-blue-800 transition-colors inline-flex items-center gap-1">
              See Premium <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
