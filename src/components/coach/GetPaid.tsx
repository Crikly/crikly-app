'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  HelpCircle,
  Info,
  Landmark,
} from 'lucide-react'
// PERF-03 + PERF-04: 60s TTL cache + in-flight guard for Stripe status.
// Type moved alongside the cache helpers so the cache and its serialised
// shape live in one place.
import {
  readStripeStatusCache,
  writeStripeStatusCache,
  clearStripeStatusCache,
  type StripeConnectStatus,
} from '@/lib/stripe-status-cache'

// C-PAY-06: this page is payment setup only — all earnings figures and payout
// rows moved to the Earnings page's unified transaction list. The earnings
// fetch, hero card and Upcoming payouts section are gone by design.

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
  const hasBankDetails = Boolean(stripeStatus.bank_last4)

  return (
    <div className="min-h-screen flex justify-center font-sans p-6 lg:p-10">
      <div className="w-full max-w-3xl flex flex-col gap-6 pb-20">

        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] md:text-[32px] font-bold text-gray-900 tracking-tight">Get paid</h1>
          <p className="text-base text-neutral-600 m-0">Where your money goes and when it lands.</p>
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
            <div className="w-8 h-8 border-3 border-gray-200 border-t-brand-600 rounded-full animate-spin mb-3" />
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
              className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-xl text-[15px] font-bold transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            {/* Stripe connection status card */}
            {fullyConnected ? (
              <div className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-4" data-testid="stripe-status-connected">
                <div className="w-11 h-11 shrink-0 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-success" />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-success inline-block" />
                    <span className="text-lg font-medium text-neutral-900">Stripe connected</span>
                  </div>
                  <span className="text-sm text-neutral-600" data-testid="payout-destination">
                    {hasBankDetails
                      ? `Payouts to ****${stripeStatus.bank_last4}${stripeStatus.bank_name ? ` · ${stripeStatus.bank_name}` : ''}`
                      : 'Payouts via Stripe'}
                  </span>
                </div>
                <span className="text-xs font-medium tracking-label uppercase text-success bg-green-100 px-2.5 py-1.5 rounded-sm">
                  Active
                </span>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-4" data-testid="stripe-status-disconnected">
                <div className="w-11 h-11 shrink-0 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={22} className="text-warning" />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-lg font-medium text-neutral-900">
                    {partiallyConnected ? 'Finish your Stripe setup' : 'Stripe not connected'}
                  </span>
                  <span className="text-sm text-neutral-600">
                    {partiallyConnected
                      ? 'Your Stripe account needs a few more details before payouts can flow.'
                      : 'Connect Stripe to receive payouts. Sessions stay on hold until you do.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleConnectStripe}
                  disabled={connecting}
                  className="h-btn-desktop px-5 rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-base font-medium transition-colors flex items-center gap-2 shrink-0"
                >
                  {connecting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Connecting…
                    </>
                  ) : partiallyConnected ? 'Finish setup' : 'Connect Stripe'}
                </button>
              </div>
            )}

            {/* How payouts work — 3-step explainer */}
            <div className="bg-white rounded-lg shadow-sm p-6 flex flex-col gap-5">
              <h2 className="text-lg font-medium text-neutral-900 m-0">How payouts work</h2>
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4">
                <div className="flex flex-col items-center gap-2.5 text-center">
                  <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
                    <CheckCircle2 size={22} className="text-brand-600" />
                  </div>
                  <span className="text-[14px] font-medium text-neutral-900">Session completed</span>
                  <span className="text-sm text-neutral-600">Money is captured from the parent.</span>
                </div>
                <ArrowRight size={20} className="text-neutral-100" />
                <div className="flex flex-col items-center gap-2.5 text-center">
                  <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
                    <Clock size={22} className="text-brand-600" />
                  </div>
                  <span className="text-[14px] font-medium text-neutral-900">48hr processing</span>
                  <span className="text-sm text-neutral-600">Your payout clears in the background.</span>
                </div>
                <ArrowRight size={20} className="text-neutral-100" />
                <div className="flex flex-col items-center gap-2.5 text-center">
                  <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center">
                    <Landmark size={22} className="text-brand-600" />
                  </div>
                  <span className="text-[14px] font-medium text-neutral-900">Released to bank</span>
                  <span className="text-sm text-neutral-600">Sent to your connected account.</span>
                </div>
              </div>
              <div className="bg-neutral-50 rounded-md px-4 py-3.5 flex items-center gap-2.5">
                <Info size={18} className="text-brand-600 shrink-0" />
                <span className="text-[14px] text-brand-800">The 48-hour delay protects both coaches and parents.</span>
              </div>
            </div>

            {/* Payout account card — Stripe-managed bank details */}
            {fullyConnected && (
              <div className="bg-white rounded-lg shadow-sm p-6 flex items-center gap-4">
                <div className="w-11 h-11 shrink-0 rounded-full bg-slate-50 flex items-center justify-center">
                  <Landmark size={22} className="text-neutral-600" />
                </div>
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-xs font-medium tracking-label uppercase text-neutral-600">Payout account</span>
                  <span className="text-[16px] font-medium text-neutral-900" data-testid="payout-bank-name">
                    {stripeStatus.bank_name ?? 'Bank account'}
                  </span>
                  <span className="text-sm text-neutral-600" data-testid="payout-bank-last4">
                    {hasBankDetails ? `Account ending ****${stripeStatus.bank_last4}` : 'Connected via Stripe'}
                  </span>
                </div>
                {/* BUG-45: bank details are managed on Stripe — this opens the
                    coach's Stripe Express dashboard via one-time login link. */}
                <a
                  href="/api/payments/connect/login-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="update-bank-account"
                  className="h-btn-desktop px-4 rounded-md border-[1.5px] border-brand-600 bg-white text-brand-600 text-base font-medium hover:bg-brand-50 transition-colors flex items-center shrink-0 no-underline"
                >
                  Update bank account
                </a>
              </div>
            )}

            {/* Tax section */}
            <div className="bg-white rounded-lg shadow-sm px-6 py-2 flex flex-col">
              <div className="pt-4 pb-3">
                <span className="text-xs font-medium tracking-label uppercase text-neutral-600">Tax</span>
              </div>
              {/* AF-M-BATCH-01: tax rows stay disabled until the endpoints exist */}
              <button
                disabled
                aria-disabled="true"
                className="w-full py-3.5 flex items-center gap-3 border-t border-neutral-100 text-left opacity-50 cursor-not-allowed"
              >
                <FileText size={20} className="text-neutral-400 shrink-0" />
                <span className="flex-1 text-base font-medium text-neutral-900">Annual earnings summary</span>
                <ChevronRight size={18} className="text-neutral-400 shrink-0" />
              </button>
              <button
                disabled
                aria-disabled="true"
                className="w-full py-3.5 flex items-center gap-3 border-t border-neutral-100 text-left opacity-50 cursor-not-allowed"
              >
                <HelpCircle size={20} className="text-neutral-400 shrink-0" />
                <span className="flex-1 text-base font-medium text-neutral-900">Self-assessment guidance</span>
                <ChevronRight size={18} className="text-neutral-400 shrink-0" />
              </button>
            </div>

            {/* Manage Stripe account link */}
            {fullyConnected && (
              // BUG-25: opens the coach's one-time Stripe Express dashboard link in
              // a new tab. The server route (GET /api/payments/connect/login-link)
              // 303-redirects to the link — the URL never touches client JS.
              <a
                href="/api/payments/connect/login-link"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 self-start text-base font-medium text-brand-600 hover:text-brand-700 py-1 no-underline"
              >
                Manage Stripe account
                <ArrowRight size={18} />
              </a>
            )}
          </>
        )}

      </div>
    </div>
  )
}
