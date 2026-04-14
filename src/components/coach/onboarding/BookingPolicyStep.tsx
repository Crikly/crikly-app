'use client'
import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'

export function BookingPolicyStep() {
  const router = useRouter()
  const [cancellationWindow, setCancellationWindow] = useState('48 hours')
  const [earliestBooking, setEarliestBooking] = useState('24 hours')
  const [latestBooking, setLatestBooking] = useState('8 weeks')
  const [bookingApproval, setBookingApproval] = useState('Instant')
  const [saving, setSaving] = useState(false)

  const cancellationOptions = ['No cancellations', '24 hours', '48 hours', '72 hours', '1 week']
  const earliestOptions = ['12 hours', '24 hours', '48 hours', '1 week']
  const latestOptions = ['2 weeks', '4 weeks', '8 weeks', '12 weeks']

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancellation_window: cancellationWindow,
          earliest_booking: earliestBooking,
          latest_booking: latestBooking,
          booking_approval: bookingApproval.toLowerCase(),
        })
      })
      router.push('/coach/onboarding/get-paid')
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="flex w-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center pt-10 pb-32 min-h-screen bg-white">
        <div className="w-full max-w-[640px] px-6">
          <div className="mb-10">
            {/* Step indicator - Step 5 of 5 */}
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-2 h-2 rounded-full bg-[#E2E8F0]"></div>
                <div className="w-6 h-2 rounded-full bg-[#0077CC]"></div>
              </div>
              <p className="text-[11px] text-[#94A3B8]">Step 5 of 5</p>
            </div>
            
            <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Booking policy</h1>
            <p className="text-[16px] text-gray-500 font-medium">These settings control how parents book and cancel with you</p>
          </div>

        <div className="flex flex-col gap-6">
          {/* Cancellation policy */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Cancellation policy</h2>
            <div className="flex flex-col gap-3">
              <label className="text-[14px] font-bold text-gray-900">Cancellation window</label>
              <p className="text-[14px] text-gray-500 font-medium mb-1">How much notice must parents give to receive a refund?</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {cancellationOptions.map((opt) => (
                  <button key={opt} onClick={() => setCancellationWindow(opt)} className={`px-4 py-2 rounded-full text-[14px] font-bold transition-all border-2 ${cancellationWindow === opt ? 'bg-blue-50 border-[#0077CC] text-[#0077CC]' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                    {opt}
                  </button>
                ))}
              </div>
              {cancellationWindow === 'No cancellations' ? (
                <div className="p-3 bg-amber-50 rounded-xl">
                  <p className="text-[13px] text-amber-700 font-medium">Strict policies can reduce booking confidence for first-time parents</p>
                </div>
              ) : (
                <p className="text-[13px] text-gray-500 font-medium">Parents who cancel within this window won't receive a refund</p>
              )}
            </div>
          </div>

          {/* Booking window */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Booking window</h2>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-bold text-gray-900">Minimum notice</label>
                <p className="text-[14px] text-gray-500 font-medium mb-1">How much notice you need before a session can start</p>
                <div className="flex flex-wrap gap-2">
                  {earliestOptions.map((opt) => (
                    <button key={opt} onClick={() => setEarliestBooking(opt)} className={`px-4 py-2 rounded-full text-[14px] font-bold transition-all border-2 ${earliestBooking === opt ? 'bg-blue-50 border-[#0077CC] text-[#0077CC]' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-px bg-gray-100 w-full"></div>
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-bold text-gray-900">Booking horizon</label>
                <p className="text-[14px] text-gray-500 font-medium mb-1">How far ahead parents can book sessions with you</p>
                <div className="flex flex-wrap gap-2">
                  {latestOptions.map((opt) => (
                    <button key={opt} onClick={() => setLatestBooking(opt)} className={`px-4 py-2 rounded-full text-[14px] font-bold transition-all border-2 ${latestBooking === opt ? 'bg-blue-50 border-[#0077CC] text-[#0077CC]' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Booking approval */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-6">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Booking approval</h2>
            <div className="flex flex-col gap-3">
              <label className="text-[14px] font-bold text-gray-900 mb-2">How do you want to confirm bookings?</label>
              <div className="flex flex-col gap-3">
                {[
                  { key: 'Instant', desc: 'Bookings confirmed automatically on payment', helper: 'Parents get instant confirmation — better for conversion' },
                  { key: 'Manual', desc: 'You review and approve each booking request', helper: 'You review each request before confirming — slower for parents' }
                ].map(({ key, desc, helper }) => (
                  <button key={key} onClick={() => setBookingApproval(key)} className={`flex items-start gap-4 p-5 rounded-xl border-2 transition-all text-left ${bookingApproval === key ? 'border-[#0077CC] bg-blue-50/50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                    <div className="mt-0.5 shrink-0">
                      {bookingApproval === key
                        ? <CheckCircle2 size={20} className="text-[#0077CC] fill-blue-100" />
                        : <Circle size={20} className="text-gray-300" />
                      }
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[15px] font-bold mb-1 ${bookingApproval === key ? 'text-[#0077CC]' : 'text-gray-900'}`}>{key}</span>
                      <span className="text-[14px] text-gray-600 font-medium mb-1">{desc}</span>
                      <span className="text-[12px] text-gray-500">{helper}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

          {/* Standard onboarding footer */}
          <div 
            className="sticky bottom-0 bg-white border-t-[0.5px] border-gray-100 px-6 py-3 flex justify-between items-center"
            style={{ boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}
          >
            <button 
              onClick={() => router.push('/coach/onboarding/availability')}
              className="text-[13px] text-gray-500 hover:text-gray-900 font-medium transition-colors"
            >
              ← Back
            </button>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full px-7 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save & continue →'}
            </button>
          </div>
        </div>
      </div>

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName="Alex Johnson"
        sport="Cricket"
        location="London"
        availabilityDays={['Mon', 'Wed', 'Fri']}
        priceFromPence={5000}
        isDbs={true}
        bookingPolicy={{
          cancellationWindow: cancellationWindow,
          minimumNotice: earliestBooking,
          bookingHorizon: latestBooking,
          approvalType: bookingApproval.toLowerCase() as 'instant' | 'manual'
        }}
      />
    </div>
  )
}
