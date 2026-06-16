'use client'

import React, { useState, useEffect } from 'react'
import { MapPin, Calendar, XCircle, CalendarDays, CheckCircle, ShieldCheck } from 'lucide-react'
// AF-P-Wave-1: profile cache adoption
import { fetchCoachProfileCached, fetchSessionTypesCached } from '@/lib/onboarding-cache'

interface OnboardingPreviewPanelProps {
  coachName: string
  sport?: string
  location?: string
  availabilityDays?: string[]
  priceFromPence?: number
  isDbs?: boolean
  infoBox?: {
    type: 'success' | 'neutral'
    message: string
    subMessage?: string
  }
  bookingPolicy?: {
    cancellationWindow: string
    minimumNotice: string
    bookingHorizon: string
    approvalType: 'instant' | 'manual'
  }
}

export function OnboardingPreviewPanel({
  coachName,
  sport,
  location,
  availabilityDays,
  priceFromPence,
  isDbs = false,
  infoBox,
  bookingPolicy
}: OnboardingPreviewPanelProps) {
  // Fix-22: Internal state for fetched price
  const [fetchedPrice, setFetchedPrice] = useState<number | undefined>(undefined)
  // Fix-24: Internal state for avatar URL
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // Fix-22 & Fix-24: Fetch minimum price and avatar on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // AF-P-01 / Fix-SESSION-TYPES-CACHE: cached — dedupes across the
        // per-step panel remounts (was an uncached fetch per step).
        const data = await fetchSessionTypesCached()
        if (data.session_types && data.session_types.length > 0) {
          const prices = data.session_types
            .map((st: { price_individual_pence: number | null }) => st.price_individual_pence)
            .filter((p: number | null): p is number => p !== null && p > 0)
          if (prices.length > 0) {
            setFetchedPrice(Math.min(...prices))
          }
        }
      } catch {
        // Fail silently — panel still renders with £-- fallback
      }

      try {
        // AF-P-Wave-1: use cache (was Fix-24 raw fetch)
        const profileData = await fetchCoachProfileCached()
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url)
        }
      } catch {
        // Fail silently — falls back to initials
      }
    }
    fetchData()
  }, [])

  // Extract initials from coach name
  const initials = coachName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'AJ'

  // Fix-22: Use priceFromPence prop if provided, otherwise use fetchedPrice
  const resolvedPrice = priceFromPence ?? fetchedPrice
  const formattedPrice = resolvedPrice
    ? `£${(resolvedPrice / 100).toFixed(0)}` 
    : '£--'

  // Format availability days
  const availabilityText = availabilityDays && availabilityDays.length > 0
    ? availabilityDays.join(', ')
    : 'No availability set yet'

  // Format sport label
  const sportLabel = sport ? `${sport} Coach` : 'Cricket Coach'

  return (
    <aside className="hidden xl:flex w-80 shrink-0 flex-col bg-white p-6 h-full overflow-y-auto border-l border-gray-100 sticky top-0">
      <div className="sticky top-6">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-4" style={{ letterSpacing: '0.05em' }}>
          WHAT PARENTS SEE
        </p>
        
        {/* Coach preview card */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-xl p-5 mb-4">
          {/* Avatar + Name */}
          <div className="flex items-start gap-3 mb-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={coachName}
                className="w-16 h-16 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-16 h-16 bg-[#E6F1FB] rounded-full flex items-center justify-center shrink-0">
                <span className="text-[#0C447C] text-[20px] font-bold">{initials}</span>
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-[16px] font-bold text-gray-900 mb-0.5">
                {coachName || <span className="text-gray-300">Your name</span>}
              </h3>
              <p className="text-[13px] text-gray-500">{sportLabel}</p>
            </div>
          </div>
          
          {/* Star rating */}
          <div className="flex items-center gap-1 mb-3">
            <span className="text-amber-400 text-[15px]">★★★★★</span>
            <span className="text-[12px] text-gray-500 ml-1">New coach</span>
          </div>
          
          {/* Location & Availability */}
          <div className="flex flex-col gap-2 mb-4">
            {location && (
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <MapPin size={14} className="text-gray-400" />
                <span>{location}</span>
              </div>
            )}
            {availabilityDays && (
              <div className="flex items-center gap-2 text-[13px] text-gray-600">
                <Calendar size={14} className="text-gray-400" />
                <span>{availabilityText}</span>
              </div>
            )}
          </div>
          
          {/* Price */}
          <div className={`text-[15px] font-bold mb-4 ${resolvedPrice ? 'text-gray-900' : 'text-gray-400'}`}>
            from {formattedPrice} / session
          </div>
          
          {/* DBS badge */}
          {isDbs && (
            <div className="flex items-center gap-2 mb-4">
              <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#E0F6F8] rounded-md text-[11px] font-bold text-[#006677]">
                <ShieldCheck size={12} /> DBS checked
              </div>
            </div>
          )}
          
          {/* Book button */}
          <button 
            className="w-full bg-[#0077CC] hover:bg-[#0066AA] text-white rounded-full py-3 text-[14px] font-bold transition-colors pointer-events-none"
            disabled
          >
            Book a session
          </button>
        </div>

        {/* Info box */}
        {infoBox && (
          <div className={`rounded-lg p-3 ${
            infoBox.type === 'success' 
              ? 'bg-green-50 border border-green-200'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <p className={`text-[11px] font-bold mb-1 ${
              infoBox.type === 'success' ? 'text-[#166534]' : 'text-gray-600'
            }`}>
              {infoBox.message}
            </p>
            {infoBox.subMessage && (
              <p className={`text-[10px] ${
                infoBox.type === 'success' ? 'text-[#166534]' : 'text-gray-500'
              }`}>
                {infoBox.subMessage}
              </p>
            )}
          </div>
        )}

        {/* Booking policy summary */}
        {bookingPolicy && (
          <div className="bg-white border border-gray-100 rounded-lg p-5 mt-6">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-4" style={{ letterSpacing: '0.05em' }}>
              BOOKING POLICY PREVIEW
            </p>
            
            <div className="flex flex-col gap-3">
              {/* Cancellation */}
              <div className="flex items-start gap-3">
                <XCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-gray-900 mb-0.5">Cancellation</p>
                  <p className={`text-[12px] ${
                    bookingPolicy.cancellationWindow === 'No cancellations' 
                      ? 'text-amber-600' 
                      : 'text-gray-600'
                  }`}>
                    {bookingPolicy.cancellationWindow === 'No cancellations'
                      ? 'Non-refundable once booked'
                      : `${bookingPolicy.cancellationWindow} notice for a refund`
                    }
                  </p>
                </div>
              </div>

              {/* Booking window */}
              <div className="flex items-start gap-3">
                <CalendarDays size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-gray-900 mb-0.5">Booking window</p>
                  <p className="text-[12px] text-gray-600">
                    {bookingPolicy.minimumNotice} to {bookingPolicy.bookingHorizon} in advance
                  </p>
                </div>
              </div>

              {/* Approval */}
              <div className="flex items-start gap-3">
                <CheckCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-[12px] font-bold text-gray-900 mb-0.5">Approval</p>
                  <p className="text-[12px] text-gray-600">
                    {bookingPolicy.approvalType === 'instant' 
                      ? 'Instant on payment' 
                      : 'Manual review'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
