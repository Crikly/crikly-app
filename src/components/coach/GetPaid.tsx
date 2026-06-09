'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Building2, FileText, Info, ExternalLink, ChevronRight, AlertCircle, CheckCircle2, Check } from 'lucide-react'
// PERF-03 + PERF-04: 60s TTL cache + in-flight guard for Stripe status.
// Type moved alongside the cache helpers so the cache and its serialised
// shape live in one place.
import {
  readStripeStatusCache,
  writeStripeStatusCache,
  clearStripeStatusCache,
  type StripeConnectStatus,
} from '@/lib/stripe-status-cache'

export function GetPaid() {
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus>({ connected: false })
  // CG-03: Banner shown after returning from Stripe onboarding
  const [returnBanner, setReturnBanner] = useState<'success' | 'refresh' | null>(null)

  // PERF-04: in-flight guard prevents React strict-mode double-invoke
  // (and any future double-call) from firing two parallel Stripe API
  // round-trips. The ref is stable across renders so useCallback deps
  // stay [].
  const fetchingRef = useRef(false)

  // CG-03: Fetch real Stripe Connect status.
  // PERF-03: 60s sessionStorage cache. Cache hits avoid the ~800ms
  // Stripe accounts.retrieve() round-trip. Cache is busted explicitly
  // after Stripe return-from-onboarding (see useEffect below).
  const fetchStripeStatus = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      setError(null)
      const cached = readStripeStatusCache()
      if (cached) {
        setStripeStatus(cached)
        return
      }
      // PERF-03: set loading ONLY after cache miss confirmed — cache hits
      // should feel instant (no spinner flicker for the 60s window), but
      // the retry-button path needs the spinner to show during the network
      // round-trip otherwise the error UI sits static for ~800ms.
      setLoading(true)
      const response = await fetch('/api/payments/connect/onboard')
      if (!response.ok) throw new Error('Failed to fetch Stripe status')
      const data: StripeConnectStatus = await response.json()
      setStripeStatus(data)
      writeStripeStatusCache(data)
    } catch (err) {
      console.error('[GetPaid] Failed to fetch Stripe status:', err)
      setError('Failed to load payment information. Please try again.')
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  // CG-03: On mount — detect return from Stripe and fetch status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const justReturnedFromStripe =
      params.get('success') === 'true' || params.get('refresh') === 'true'

    if (params.get('success') === 'true') {
      setReturnBanner('success')
      window.history.replaceState({}, '', '/coach/get-paid')
    } else if (params.get('refresh') === 'true') {
      setReturnBanner('refresh')
      window.history.replaceState({}, '', '/coach/get-paid')
    }

    // PERF-03: bust cache when returning from Stripe — onboarding state
    // may have changed during the redirect, so the cached snapshot is
    // stale. Without this the cache could serve the pre-onboarding
    // value for up to 60s after the coach completed onboarding.
    if (justReturnedFromStripe) {
      clearStripeStatusCache()
    }

    fetchStripeStatus()
  }, [fetchStripeStatus])

  // CG-03: Start or resume Stripe Connect onboarding
  const handleConnectStripe = async () => {
    try {
      setConnecting(true)
      setError(null)
      const response = await fetch('/api/payments/connect/onboard', { method: 'POST' })
      if (!response.ok) throw new Error('Failed to start Stripe onboarding')
      const { onboarding_url } = await response.json() as { onboarding_url: string }
      window.location.href = onboarding_url
    } catch (err) {
      console.error('[GetPaid] Stripe onboarding error:', err)
      setError('Could not connect to Stripe. Please try again.')
      setConnecting(false)
    }
  }

  // Derived state — fully live means Stripe can charge and pay out
  const fullyConnected = stripeStatus.connected &&
    stripeStatus.charges_enabled &&
    stripeStatus.payouts_enabled

  const partiallyConnected = stripeStatus.connected && !fullyConnected
  return (
    <div className="min-h-screen flex justify-center font-sans p-6 lg:p-10">
      <div className="w-full max-w-3xl flex flex-col gap-8 pb-20">

        <div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight">Get Paid</h1>
        </div>

        {/* CG-03: Return banners from Stripe onboarding */}
        {returnBanner === 'success' && (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
            <p className="text-[14px] text-green-800 font-medium">Bank account connected successfully. You&apos;re ready to receive payouts.</p>
          </div>
        )}
        {returnBanner === 'refresh' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] text-amber-800 font-medium">Setup wasn&apos;t completed. You can try again below.</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-gray-200 border-t-[#0077CC] rounded-full animate-spin mb-3" />
            <p className="text-[14px] text-gray-500">Loading payment information...</p>
          </div>
        ) : error ? (
          // Error state
          <div className="py-16 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-[18px] font-bold text-gray-900 mb-2">Failed to load payment information</h3>
            <p className="text-[14px] text-gray-500 mb-6">{error}</p>
            <button
              onClick={() => fetchStripeStatus()}
              className="bg-[#0077CC] hover:bg-[#0066AA] text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : !stripeStatus.connected ? (
          // CG-03: Not connected state — real Connect button
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-8 shadow-sm flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-full bg-[#F0F7FF] flex items-center justify-center">
              <Building2 size={32} className="text-[#0077CC]" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-2">Connect your bank account</h2>
              <p className="text-[14px] text-gray-500 max-w-md">
                Set up Stripe to receive payments from parents. It takes 2 minutes and payouts are automatic.
              </p>
            </div>
            <button
              onClick={handleConnectStripe}
              disabled={connecting}
              className="bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl text-[15px] font-bold transition-colors flex items-center gap-2"
            >
              {connecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Connecting…
                </>
              ) : 'Connect with Stripe'}
            </button>
            <div className="bg-[#F0F7FF] rounded-lg px-4 py-3 max-w-md">
              <p className="text-[12px] text-[#0C447C] leading-relaxed">
                Stripe is trusted by millions of businesses worldwide. Your bank details are encrypted and never stored on Crikly.
              </p>
            </div>
          </div>
        ) : partiallyConnected ? (
          // CG-03: Connected but setup incomplete — Finish setup button
          <div className="bg-white border border-amber-200 rounded-[16px] p-8 shadow-sm flex flex-col items-center text-center gap-6">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
              <AlertCircle size={32} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-gray-900 mb-2">Almost there — finish your setup</h2>
              <p className="text-[14px] text-gray-500 max-w-md">
                Your Stripe account is connected but needs a few more details before you can receive payouts.
              </p>
            </div>
            <button
              onClick={handleConnectStripe}
              disabled={connecting}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl text-[15px] font-bold transition-colors flex items-center gap-2"
            >
              {connecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Loading…
                </>
              ) : 'Finish setup'}
            </button>
          </div>
        ) : (
          // CD-11: Connected state (existing UI)
          <>

        {/* CF-D09 CHANGE 1: Stripe hero card with next payout prominent */}
        <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-6 shadow-sm flex flex-col gap-6">
          {/* Top row: Stripe Connected status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-[#635BFF] flex items-center justify-center shrink-0 shadow-sm">
                <svg viewBox="0 0 40 40" className="w-10 h-10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19.98 40C31.0257 40 40 31.0457 40 20C40 8.9543 31.0257 0 19.98 0C8.9343 0 0 8.9543 0 20C0 31.0457 8.9343 40 19.98 40Z" fill="#635BFF"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M19.7891 16.5183C18.2325 16.5183 17.2023 17.2141 17.2023 18.2715C17.2023 19.1764 18.0649 19.6437 19.5539 20.0163L20.8091 20.3168C23.2372 20.8988 24.5901 22.0298 24.5901 24.1687C24.5901 27.2415 22.1769 28.8471 18.4239 28.8471C15.4227 28.8471 13.0644 27.6749 11.5173 26.069L13.7845 23.3644C15.1118 24.7865 16.7171 25.5456 18.5367 25.5456C20.2524 25.5456 21.3653 24.8198 21.3653 23.6335C21.3653 22.6186 20.4776 22.1105 18.6657 21.6669L17.5815 21.3917C14.881 20.7303 13.9189 19.5348 13.9189 17.4385C13.9189 14.5368 16.3262 13.0901 19.6083 13.0901C22.1643 13.0901 24.1205 13.9669 25.6888 15.2639L23.5184 18.069C22.2536 17.0673 20.9324 16.5183 19.7891 16.5183Z" fill="white"/>
                </svg>
              </div>
              <div>
                {/* CF-D09 CHANGE 1: Green dot + Stripe Connected */}
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                  <span className="text-[13px] font-medium text-gray-900">Stripe Connected</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">Payouts to ****4242 · Lloyds Bank</div>
              </div>
            </div>
          </div>

          {/* CF-D09 CHANGE 1: Main section with next payout prominent */}
          <div className="border-t-[0.5px] border-gray-100 pt-3.5">
            <div className="flex items-start gap-8 md:gap-12">
              {/* Left: Next payout (primary) */}
              <div className="flex-1">
                <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Next payout</div>
                <div className="text-[28px] font-medium text-[#0077CC] mb-1">£90.00</div>
                <div className="text-[12px] text-gray-500">Releasing 10 Apr · in 2 days</div>
              </div>
              
              {/* Right: Total earned (secondary) */}
              <div className="flex-1">
                <div className="text-[11px] text-gray-400 mb-1.5">Total earned</div>
                <div className="text-[20px] font-medium text-gray-900">£1,240.00</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* CF-D09 CHANGE 2: Payout timeline card */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="mb-3">
            <h3 className="text-[13px] font-medium text-gray-900">How payouts work</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Money moves automatically — here&apos;s the journey</p>
          </div>
          
          {/* 3-step timeline */}
          <div className="flex items-center w-full mb-3">
            {/* Step 1: Done */}
            <div className="flex flex-col items-center">
              <div className="w-[26px] h-[26px] rounded-full bg-[#DCFCE7] text-[#166534] flex items-center justify-center font-medium">
                <Check size={14} />
              </div>
              <div className="text-[9px] text-gray-500 text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                Session completed
              </div>
            </div>
            
            {/* Connecting line 1 */}
            <div className="flex-1 h-[1.5px] bg-[#86EFAC] mx-2" />
            
            {/* Step 2: Active */}
            <div className="flex flex-col items-center">
              <div className="w-[26px] h-[26px] rounded-full bg-[#0077CC] text-white flex items-center justify-center text-[14px] font-medium">
                ⟳
              </div>
              <div className="text-[9px] text-[#0077CC] font-medium text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                48hr processing
              </div>
            </div>
            
            {/* Connecting line 2 */}
            <div className="flex-1 h-[1.5px] bg-[#E2E8F0] mx-2" />
            
            {/* Step 3: Future */}
            <div className="flex flex-col items-center">
              <div className="w-[26px] h-[26px] rounded-full bg-[#F1F5F9] text-[#94A3B8] flex items-center justify-center text-[14px] font-medium">
                £
              </div>
              <div className="text-[9px] text-gray-400 text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                Released to bank
              </div>
            </div>
          </div>
          
          {/* Reassurance note */}
          <div className="bg-[#F0F7FF] rounded-lg px-3 py-2.5">
            <p className="text-[11px] text-[#0C447C] leading-relaxed">
              The 48-hour delay protects both coaches and parents — it gives time to resolve any issues before money moves.
            </p>
          </div>
        </div>

        {/* CF-D09 CHANGE 3: Upcoming payouts list with cleaner rows */}
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Upcoming payouts</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm flex flex-col">
            <div className="px-4 py-3 flex items-center justify-between border-b-[0.5px] border-gray-100 hover:bg-gray-50 transition-all duration-100">
              <div>
                <div className="text-[13px] font-medium text-gray-900">Thu 10 Apr</div>
                <div className="text-[11px] text-gray-400 mt-0.5">2 sessions · releasing in 2 days</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-[14px] font-medium text-gray-900">£90.00</div>
                <div className="px-2 py-0.5 bg-[#DCFCE7] text-[#166534] text-[10px] font-medium rounded-full">
                  Scheduled
                </div>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-all duration-100">
              <div>
                <div className="text-[13px] font-medium text-gray-900">Sat 12 Apr</div>
                <div className="text-[11px] text-gray-400 mt-0.5">1 session · releasing in 4 days</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-[14px] font-medium text-gray-900">£45.00</div>
                <div className="px-2 py-0.5 bg-[#FEF3C7] text-[#92400E] text-[10px] font-medium rounded-full">
                  Pending
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CF-D09 CHANGE 4: Payout account card with balanced CTA */}
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-bold text-gray-900">Payout account</h2>
          <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                  <Building2 size={20} className="text-gray-600" />
                </div>
                <div>
                  <div className="text-[16px] font-bold text-gray-900">Lloyds Bank</div>
                  <div className="text-[14px] text-gray-500 mt-0.5">Account ending ****4242</div>
                </div>
              </div>
              {/* CF-D09 CHANGE 4: Smaller, right-aligned secondary button */}
              <button className="px-4 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 text-[12px] font-medium hover:bg-gray-50 transition-colors outline-none shrink-0">
                Update bank account
              </button>
            </div>
          </div>
        </div>

        {/* CF-D09 CHANGE 5: Tax section with polish */}
        <div className="flex flex-col gap-4 mt-6">
          <h2 className="text-[18px] font-bold text-gray-900">Tax</h2>
          <div className="bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
            {/* AF-M-BATCH-01: tax section disabled until endpoints exist */}
            <button
              disabled
              aria-disabled="true"
              className="w-full px-4 py-3 flex items-center gap-3 border-b-[0.5px] border-gray-100 text-left opacity-50 cursor-not-allowed"
            >
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                <FileText size={16} className="text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-gray-900">Annual earnings summary</div>
                <div className="text-[11px] text-gray-400 mt-0.5">Download your tax summary for 2025–26</div>
              </div>
              <ChevronRight size={18} className="text-gray-300 shrink-0" />
            </button>
            <button
              disabled
              aria-disabled="true"
              className="w-full px-4 py-3 flex items-center gap-3 text-left opacity-50 cursor-not-allowed"
            >
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                <Info size={16} className="text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="text-[13px] font-medium text-gray-900">Self-assessment guidance</div>
                <div className="text-[11px] text-gray-400 mt-0.5">HMRC resources for self-employed coaches</div>
              </div>
              <ChevronRight size={18} className="text-gray-300 shrink-0" />
            </button>
          </div>
        </div>

        <div className="mt-2">
          <button className="flex gap-4 p-4 items-start text-left hover:bg-white rounded-xl transition-colors group w-full max-w-lg">
            <div className="shrink-0 mt-0.5 text-[#0077CC]"><ExternalLink size={20} /></div>
            <div>
              <div className="text-[16px] font-bold text-[#0077CC] group-hover:underline">Manage Stripe account →</div>
              <div className="text-[13px] text-gray-500 mt-1">View detailed payouts, invoices and settings on Stripe</div>
            </div>
          </button>
        </div>
        </>
        )}

      </div>
    </div>
  )
}
