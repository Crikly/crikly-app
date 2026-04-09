'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react'

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
    <div className="min-h-full bg-white font-sans text-gray-900 flex flex-col items-center pb-32">
      <div className="w-full max-w-[640px] px-6 pt-10">
        <div className="mb-10">
          <button onClick={() => router.push('/coach/onboarding/availability')} className="flex items-center gap-2 text-[#0077CC] hover:text-blue-800 font-bold text-[15px] mb-8 transition-colors">
            <ArrowLeft size={18} /><span>Dashboard</span>
          </button>
          <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Booking policy</h1>
          <p className="text-[16px] text-gray-500 font-medium">Set how people can book and cancel sessions</p>
        </div>

        <div className="flex flex-col gap-6">
          {/* Cancellation policy */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Cancellation policy</h2>
            <div className="flex flex-col gap-3">
              <label className="text-[14px] font-bold text-gray-900">Cancellation window</label>
              <p className="text-[14px] text-gray-500 font-medium mb-1">How much notice is required to cancel and receive a refund?</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {cancellationOptions.map((opt) => (
                  <button key={opt} onClick={() => setCancellationWindow(opt)} className={`px-4 py-2 rounded-full text-[14px] font-bold transition-all border-2 ${cancellationWindow === opt ? 'bg-blue-50 border-[#0077CC] text-[#0077CC]' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                    {opt}
                  </button>
                ))}
              </div>
              {cancellationWindow === 'No cancellations' ? (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/50">
                  <p className="text-[13px] text-amber-800 font-medium">People will see a non-refundable warning before they book</p>
                </div>
              ) : (
                <p className="text-[13px] text-gray-500 font-medium">Cancellations after this window are non-refundable</p>
              )}
            </div>
          </div>

          {/* Booking window */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Booking window</h2>
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3">
                <label className="text-[14px] font-bold text-gray-900">Earliest booking</label>
                <p className="text-[14px] text-gray-500 font-medium mb-1">Minimum notice required before a session can be booked</p>
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
                <label className="text-[14px] font-bold text-gray-900">Latest booking</label>
                <p className="text-[14px] text-gray-500 font-medium mb-1">How far ahead sessions can be booked</p>
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
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-20">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Booking approval</h2>
            <div className="flex flex-col gap-3">
              <label className="text-[14px] font-bold text-gray-900 mb-2">How bookings are confirmed</label>
              <div className="flex flex-col gap-3">
                {[
                  { key: 'Instant', desc: 'Bookings confirmed automatically on payment' },
                  { key: 'Manual', desc: 'You review and approve each booking request' }
                ].map(({ key, desc }) => (
                  <button key={key} onClick={() => setBookingApproval(key)} className={`flex items-start gap-4 p-5 rounded-xl border-2 transition-all text-left ${bookingApproval === key ? 'border-[#0077CC] bg-blue-50/50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                    <div className="mt-0.5 shrink-0">
                      {bookingApproval === key
                        ? <CheckCircle2 size={20} className="text-[#0077CC] fill-blue-100" />
                        : <Circle size={20} className="text-gray-300" />
                      }
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[15px] font-bold mb-1 ${bookingApproval === key ? 'text-[#0077CC]' : 'text-gray-900'}`}>{key}</span>
                      <span className="text-[14px] text-gray-600 font-medium">{desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-100 p-6 flex justify-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.03)]">
        <div className="w-full max-w-[640px] flex flex-col gap-3">
          <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2">
            {saving ? 'Saving...' : 'Save & continue →'}
          </button>
          <button onClick={() => router.push('/coach/dashboard')} className="w-full py-3 text-gray-500 hover:text-gray-900 font-bold text-[14px] transition-colors">Save & go back to dashboard</button>
        </div>
      </div>
    </div>
  )
}
