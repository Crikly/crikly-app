'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Lock, Globe, Smartphone } from 'lucide-react'

export function GetPaidStep() {
  const router = useRouter()

  return (
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pb-32">
      <div className="w-full max-w-[640px] px-6 pt-10">
        <div className="mb-8">
          <button onClick={() => router.push('/coach/onboarding/policy')} className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-8 transition-colors">
            <ArrowLeft size={18} /><span>Dashboard</span>
          </button>
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Get paid</h1>
          <p className="text-[16px] text-gray-500 font-medium mb-6">Set up payments to start accepting bookings</p>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
            <p className="text-[14px] text-gray-600 font-medium leading-relaxed">This step is optional — you can go live without it, but you won't be able to accept bookings until payments are set up.</p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="mb-4"><span className="text-[40px] font-bold tracking-tighter text-[#635BFF]">stripe</span></div>
              <p className="text-[15px] text-gray-600 font-medium max-w-[280px]">Crikly uses Stripe to send your earnings directly to your bank account</p>
            </div>
            <div className="flex flex-col gap-4 mb-8">
              {[
                'Payments land in your bank within 2 days',
                'No manual invoicing or chasing payments',
                'Your earnings are protected and guaranteed',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                    <Check size={12} strokeWidth={3} className="text-green-600" />
                  </div>
                  <p className="text-[15px] text-gray-700 font-medium">{item}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center">
              <button className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2 mb-3">
                Connect with Stripe <ArrowLeft size={18} className="rotate-180" />
              </button>
              <p className="text-[13px] text-gray-400 font-medium text-center">You'll be redirected to Stripe to complete setup.<br/>Takes about 5 minutes.</p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-20">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Why Stripe?</h2>
            <div className="flex flex-col gap-5">
              {[
                { Icon: Lock, label: 'Bank-level security' },
                { Icon: Globe, label: 'Used by millions of businesses worldwide' },
                { Icon: Smartphone, label: 'Manage payouts from the Stripe app' },
              ].map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-gray-600" />
                  </div>
                  <span className="text-[15px] text-gray-700 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-6 flex justify-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <div className="w-full max-w-[640px] flex flex-col items-center gap-3">
          <button onClick={() => router.push('/coach/onboarding/go-live')} className="w-full py-4 border-2 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 rounded-xl font-bold text-[15px] transition-colors flex items-center justify-center">
            Skip for now — set up later
          </button>
          <p className="text-[13px] text-gray-400 font-medium text-center">You can complete this from your dashboard at any time</p>
        </div>
      </div>
    </div>
  )
}
