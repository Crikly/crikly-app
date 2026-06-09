'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'
import { fetchCoachProfileCached, clearCoachProfileCache } from '@/lib/onboarding-cache'

export function BookingPolicyStep() {
  const router = useRouter()
  const [cancellationWindow, setCancellationWindow] = useState('48 hours')
  const [earliestBooking, setEarliestBooking] = useState('24 hours')
  const [latestBooking, setLatestBooking] = useState('8 weeks')
  // Fix-AC-14: Manual approval is opt-in per updated BR-06
  const [bookingApproval, setBookingApproval] = useState<'Instant' | 'Manual'>('Instant')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [coachName, setCoachName] = useState<string>('Your name')
  
  // Fix-14A: Fetch and pre-populate saved booking policy
  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        setLoading(true)
        // AF-P-01: cached fetch — returns cached profile if hit, network otherwise
        const data = await fetchCoachProfileCached()
        
        // Fix-16e: Set coach name
        setCoachName(data.full_name || 'Your name')
        
        // Map cancellation_window_hours to UI string
        if (data.cancellation_window_hours !== undefined) {
          const hours = data.cancellation_window_hours
          if (hours === 0) setCancellationWindow('No cancellations')
          else if (hours === 24) setCancellationWindow('24 hours')
          else if (hours === 48) setCancellationWindow('48 hours')
          else if (hours === 72) setCancellationWindow('72 hours')
          else if (hours === 168) setCancellationWindow('1 week')
        }
        
        // Map min_advance_hours to UI string
        if (data.min_advance_hours !== undefined) {
          const hours = data.min_advance_hours
          if (hours === 12) setEarliestBooking('12 hours')
          else if (hours === 24) setEarliestBooking('24 hours')
          else if (hours === 48) setEarliestBooking('48 hours')
          else if (hours === 168) setEarliestBooking('1 week')
        }
        
        // Map max_advance_days to UI string
        if (data.max_advance_days !== undefined) {
          const days = data.max_advance_days
          if (days === 14) setLatestBooking('2 weeks')
          else if (days === 28) setLatestBooking('4 weeks')
          else if (days === 56) setLatestBooking('8 weeks')
          else if (days === 84) setLatestBooking('12 weeks')
        }

        // Fix-AC-14: pre-populate booking approval mode
        if (data.requires_manual_approval !== undefined) {
          setBookingApproval(data.requires_manual_approval ? 'Manual' : 'Instant')
        }
      } catch (err) {
        console.error('Failed to fetch booking policy:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchPolicy()
  }, [])

  const cancellationOptions = ['No cancellations', '24 hours', '48 hours', '72 hours', '1 week']
  const earliestOptions = ['12 hours', '24 hours', '48 hours', '1 week']
  const latestOptions = ['2 weeks', '4 weeks', '8 weeks', '12 weeks']

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      // CD-03: verified - BookingPolicyStep saves to coach_profiles table
      // Maps to: cancellation_window_hours, min_advance_hours, max_advance_days

      // Convert UI strings to hours/days integers
      const cancellationHours = cancellationWindow === 'No cancellations' ? 0 :
                                cancellationWindow === '24 hours' ? 24 :
                                cancellationWindow === '48 hours' ? 48 :
                                cancellationWindow === '72 hours' ? 72 :
                                cancellationWindow === '1 week' ? 168 : 48

      const minAdvanceHours = earliestBooking === '12 hours' ? 12 :
                             earliestBooking === '24 hours' ? 24 :
                             earliestBooking === '48 hours' ? 48 :
                             earliestBooking === '1 week' ? 168 : 24

      const maxAdvanceDays = latestBooking === '2 weeks' ? 14 :
                            latestBooking === '4 weeks' ? 28 :
                            latestBooking === '8 weeks' ? 56 :
                            latestBooking === '12 weeks' ? 84 : 56

      const response = await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancellation_window_hours: cancellationHours,
          min_advance_hours: minAdvanceHours,
          max_advance_days: maxAdvanceDays,
          // Fix-AC-14: persist manual-approval opt-in
          requires_manual_approval: bookingApproval === 'Manual',
        })
      })

      // Fix-AC-14: surface API errors instead of silently navigating
      if (!response.ok) {
        setSaveError('Failed to save booking policy. Please try again.')
        return
      }

      // AF-P-01: invalidate cache — this save mutates coach_profiles
      clearCoachProfileCache()

      router.push('/coach/onboarding/get-paid')
    } catch (err) {
      console.error('Failed to save booking policy:', err)
      setSaveError('Failed to save booking policy. Please try again.')
    } finally {
      setSaving(false)
    }
  }


  return (
    <div className="flex-1 overflow-y-auto flex w-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center pt-10 pb-32 min-h-screen bg-white">
        <div className="w-full max-w-[640px] px-6">
          {/* Fix-14A: Loading state */}
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
              <p className="text-[14px] text-gray-500">Loading policy...</p>
            </div>
          )}
          
          {!loading && (
          <div className="page-content-enter">
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
                <p className="text-[13px] text-gray-500 font-medium">Parents who cancel within this window won&apos;t receive a refund</p>
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

          {/* Fix-AC-14: Booking approval — opt-in per updated BR-06 */}
          <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-6">
            <h2 className="text-[18px] font-bold text-gray-900 mb-6">Booking approval</h2>
            <div className="flex flex-col gap-3">
              <label className="text-[14px] font-bold text-gray-900 mb-2">How do you want to confirm bookings?</label>
              <div className="flex flex-col gap-3">
                {[
                  { key: 'Instant' as const, desc: 'Bookings confirmed automatically on payment', helper: 'Parents get instant confirmation' },
                  { key: 'Manual' as const, desc: 'You review and approve each booking request', helper: 'You review each request before confirming' }
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

          {/* Fix-AC-14: inline save error */}
          {saveError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-[13px] font-medium text-red-700">{saveError}</p>
            </div>
          )}

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
          )}
        </div>
      </div>

      {/* Right panel - What parents see */}
      <OnboardingPreviewPanel
        coachName={coachName}
        sport={undefined}
        location={undefined}
        availabilityDays={undefined}
        priceFromPence={undefined}
        isDbs={false}
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
