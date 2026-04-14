'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'

export function GetPaidStep() {
  const router = useRouter()
  
  // CD-03: verified - GetPaidStep initiates Stripe Connect onboarding flow
  // No direct Supabase save - stripe_onboarding_complete flag set by Stripe webhook
  // coach_profiles.stripe_account_id populated after successful Stripe Connect

  return (
    <div className="flex w-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center pt-10 pb-32 min-h-screen bg-white">
        <div className="w-full max-w-[640px] px-6">
          <div className="mb-8">
            {/* Step indicator - Step 6 of 6 */}
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              </div>
              <p className="text-[11px] text-[#94A3B8]">Step 6 of 6</p>
            </div>
            
            <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Get paid</h1>
            <p className="text-[16px] text-gray-500 font-medium mb-6">Set up payments to start accepting bookings</p>
            <div className="p-3 bg-blue-50 rounded-lg border-l-4 border-[#0077CC]">
              <p className="text-[14px] text-gray-600 font-medium leading-relaxed">Payouts must be set up before you can receive paid bookings.</p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
              <div className="flex flex-col items-center text-center mb-8">
                <div className="mb-4"><span className="text-[40px] font-bold tracking-tighter text-[#635BFF]">stripe</span></div>
                <p className="text-[15px] text-gray-600 font-medium max-w-[280px]">Crikly uses Stripe to send your earnings directly to your bank account.</p>
              </div>
              <div className="flex flex-col gap-4 mb-8">
                {[
                  'Payments land in your bank within 2 days',
                  'No manual invoicing or chasing payments',
                  'Secure payout processing',
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
                <p className="text-[13px] text-gray-400 font-medium text-center">Takes about 5 minutes. You'll complete setup securely on Stripe.</p>
              </div>
            </div>

            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-6">
              <h2 className="text-[18px] font-bold text-gray-900 mb-6">Before you start</h2>
              <div className="flex flex-col gap-4 mb-6">
                {[
                  'Your bank account details',
                  'Photo ID — may be required by Stripe',
                  'Personal or business details',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-[15px] text-gray-700 font-medium">{item}</p>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-gray-500 font-medium">Payments are processed securely by Stripe.</p>
            </div>
          </div>

          {/* Standard onboarding footer - three-slot pattern */}
          <div 
            className="sticky bottom-0 bg-white border-t-[0.5px] border-gray-100 px-6 py-3 flex justify-between items-center"
            style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}
          >
            <button 
              onClick={() => router.push('/coach/onboarding/policy')}
              className="text-[13px] text-gray-500 hover:text-gray-900 font-medium transition-colors"
            >
              ← Back
            </button>
            <div className="flex flex-col items-center">
              <button 
                onClick={() => router.push('/coach/onboarding/go-live')}
                className="text-[13px] text-gray-500 hover:text-gray-900 font-medium transition-colors"
              >
                Skip for now
              </button>
              <p className="text-[10px] text-gray-400 mt-0.5">You can complete this from your dashboard</p>
            </div>
            <button 
              className="bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full px-7 py-2.5 text-[13px] font-medium transition-colors"
            >
              Connect with Stripe →
            </button>
          </div>
        </div>
      </div>

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName="Your name"
        sport={undefined}
        location={undefined}
        availabilityDays={undefined}
        priceFromPence={undefined}
        isDbs={false}
      />
    </div>
  )
}
