'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle } from 'lucide-react'
import { OnboardingPreviewPanel } from '../OnboardingPreviewPanel'
// AF-P-Wave-1: profile cache adoption + clear after go-live mutation
import { fetchCoachProfileCached, clearCoachProfileCache } from '@/lib/onboarding-cache'
// UX-01 BUG 5: real Stripe Connect status — same endpoint + 60s cache as
// the dashboard GetPaid page, so both surfaces always agree.
import {
  readStripeStatusCache,
  writeStripeStatusCache,
  clearStripeStatusCache,
  type StripeConnectStatus,
} from '@/lib/stripe-status-cache'

export function GetPaidStep() {
  const router = useRouter()
  const [coachName, setCoachName] = useState<string>('Your name')
  const [isGoingLive, setIsGoingLive] = useState(false)
  // PILOT-01: profile submitted for manual review — swaps the step content
  // for the "under review" confirmation instead of the live celebration.
  const [submitted, setSubmitted] = useState(false)
  // Fix-STRIPE-01: Path A (Connect with Stripe) state — distinct from Path B (Skip).
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Guards the success-return effect against React strict-mode double-invoke
  // (same pattern as GetPaid.tsx fetchingRef).
  const handledReturnRef = useRef(false)
  // UX-01 BUG 5: null = status unknown (loading); the connect card only
  // renders once Stripe has confirmed the coach is NOT ready, so an
  // already-connected coach never sees "Connect with Stripe" flash.
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null)
  const fetchingStatusRef = useRef(false)

  const fetchStripeStatus = useCallback(async () => {
    if (fetchingStatusRef.current) return
    fetchingStatusRef.current = true
    try {
      const cached = readStripeStatusCache()
      if (cached) {
        setStripeStatus(cached)
        return
      }
      const response = await fetch('/api/payments/connect/onboard')
      if (!response.ok) throw new Error('Failed to fetch Stripe status')
      const data: StripeConnectStatus = await response.json()
      setStripeStatus(data)
      writeStripeStatusCache(data)
    } catch (err) {
      console.error('[GetPaidStep] Failed to fetch Stripe status:', err)
      // Fall back to the connect card — it is always a safe state to show,
      // and the go-live API re-checks Stripe server-side anyway.
      setStripeStatus({ connected: false })
    } finally {
      fetchingStatusRef.current = false
    }
  }, [])

  // AF-P-Wave-1: use cache (was Fix-16e raw fetch)
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await fetchCoachProfileCached()
        // UX-01 BUG 2: preview shows the public display_name, not full_name
        setCoachName(data?.display_name || data?.full_name || 'Your name')
      } catch (error) {
        console.error('[GetPaidStep] Failed to fetch profile:', error)
      }
    }
    fetchProfile()
  }, [])

  // Fix-36: Go live and navigate to dashboard with celebration modal.
  // C-PAY-03: this is now ONLY the post-Stripe-return action (Path A). The API
  // rejects go-live until Stripe onboarding is complete (409
  // STRIPE_ONBOARDING_INCOMPLETE), re-checking Stripe directly to absorb the
  // return-redirect vs webhook race. stripe_onboarding_complete itself stays
  // webhook-owned — never written from the client.
  const handleGoLive = useCallback(async () => {
    setIsGoingLive(true)
    setError(null)
    try {
      const res = await fetch('/api/coaches/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_profile_live: true })
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { code?: string } | null
        if (data?.code === 'STRIPE_ONBOARDING_INCOMPLETE') {
          setError('Stripe is still verifying your details. You can go live as soon as verification completes — or connect Stripe now if you haven’t yet.')
        } else if (data?.code === 'STRIPE_STATUS_CHECK_FAILED') {
          setError('We couldn’t confirm your Stripe account status. Please try again in a moment.')
        } else {
          setError('Could not go live. Please try again.')
        }
        setIsGoingLive(false)
        return
      }
      // PILOT-01: "Go live" now submits for manual review — the profile is
      // NOT live yet, so no ?celebrated=true (that modal congratulates a live
      // profile). Show the under-review confirmation instead; the coach heads
      // to the dashboard from there. Cache still cleared (AF-P-Wave-1) so
      // dashboard reads pick up submitted_for_review_at.
      clearCoachProfileCache()
      setSubmitted(true)
      setIsGoingLive(false)
    } catch (error) {
      console.error('Failed to go live:', error)
      setError('Could not go live. Please try again.')
      setIsGoingLive(false)
    }
  }, [router])

  // C-PAY-03 Path B ("Skip for now"): no longer attempts go-live — a profile
  // cannot be live without a payout destination. The coach lands on the
  // dashboard still in draft (no celebration modal) and can go live from
  // there once Stripe setup is complete.
  const handleSkip = useCallback(() => {
    router.push('/coach/dashboard')
  }, [router])

  // Fix-STRIPE-01 Path A: initiate the REAL Stripe Connect onboarding flow.
  // Mirrors GetPaid.tsx handleConnectStripe, but return_path brings the coach
  // back to THIS onboarding step (not the dashboard) so we can complete go-live.
  const handleConnectStripe = useCallback(async () => {
    if (connecting) return
    setConnecting(true)
    setError(null)
    try {
      const response = await fetch('/api/payments/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_path: '/coach/onboarding/get-paid' }),
      })
      if (!response.ok) throw new Error('Failed to start Stripe onboarding')
      const { onboarding_url } = (await response.json()) as { onboarding_url: string }
      window.location.href = onboarding_url
    } catch (err) {
      console.error('[GetPaidStep] Stripe onboarding error:', err)
      setError('Could not connect to Stripe. Please try again.')
      setConnecting(false)
    }
  }, [connecting])

  // Fix-STRIPE-01 Path A return: Stripe redirects the coach back here.
  //   ?success=true → finished the hosted flow → go live (is_profile_live=true)
  //                   then head to the dashboard. The webhook flips
  //                   stripe_onboarding_complete when Stripe enables the account.
  //   ?refresh=true → link expired / abandoned → stay on this step to retry or
  //                   skip. No go-live.
  useEffect(() => {
    if (handledReturnRef.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      handledReturnRef.current = true
      // UX-01 BUG 5: Stripe state changed during the redirect — the cached
      // snapshot is stale (same busting rule as GetPaid.tsx).
      clearStripeStatusCache()
      window.history.replaceState({}, '', '/coach/onboarding/get-paid')
      handleGoLive()
    } else if (params.get('refresh') === 'true') {
      handledReturnRef.current = true
      clearStripeStatusCache()
      window.history.replaceState({}, '', '/coach/onboarding/get-paid')
    }
  }, [handleGoLive])

  // UX-01 BUG 5: fetch status on mount — runs after the return-param effect
  // above so a just-returned coach never reads the stale cache entry.
  useEffect(() => {
    fetchStripeStatus()
  }, [fetchStripeStatus])

  // Same readiness semantics as the go-live API gate and the Stripe webhook:
  // charges_enabled && payouts_enabled ⇔ stripe_onboarding_complete.
  const stripeConnected =
    stripeStatus?.connected === true &&
    stripeStatus.charges_enabled === true &&
    stripeStatus.payouts_enabled === true
  const statusLoading = stripeStatus === null

  // PILOT-01: submitted-for-review confirmation replaces the whole step —
  // Stripe is connected and the profile is with Lasith for approval.
  if (submitted) {
    return (
      <div className="flex-1 overflow-y-auto flex w-full">
        <div className="flex-1 flex flex-col items-center pt-10 pb-32 min-h-screen bg-white">
          <div className="w-full max-w-[640px] px-6 page-content-enter">
            <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mt-16 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <Check size={22} strokeWidth={3} className="text-green-600" />
              </div>
              <h1 className="text-[24px] font-bold text-gray-900 mb-2">Your profile is under review</h1>
              <p className="text-[15px] text-gray-600 font-medium max-w-[400px] mb-8">
                We&rsquo;ll be in touch soon — you&rsquo;ll get an email as soon as your profile goes live.
              </p>
              <button
                onClick={() => router.push('/coach/dashboard')}
                className="bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-[15px] px-8 py-3.5 transition-colors shadow-sm"
              >
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
        <OnboardingPreviewPanel
          coachName={coachName}
          sport={undefined}
          location={undefined}
          availabilityDays={undefined}
          priceFromPence={undefined}
          isDbs={false}
        />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto flex w-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center pt-10 pb-32 min-h-screen bg-white">
        <div className="w-full max-w-[640px] px-6 page-content-enter">
          <div className="mb-8">
            {/* AF-H-22: step indicator removed — Get Paid is the post-numbered "go live" page,
                not a numbered step in the X-of-5 onboarding flow */}
            <h1 className="text-[32px] font-bold text-gray-900 leading-tight mb-2">Get paid</h1>
            <p className="text-[16px] text-gray-500 font-medium mb-6">Set up payments to start accepting bookings</p>
            <div className="p-3 bg-blue-50 rounded-lg border-l-4 border-[#0077CC]">
              <p className="text-[14px] text-gray-600 font-medium leading-relaxed">Payouts must be set up before you can receive paid bookings.</p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* UX-01 BUG 5: three states — checking / already connected / connect */}
            {statusLoading && (
              <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-6">
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-3 border-gray-200 border-t-brand-600 rounded-full animate-spin mb-3" />
                  <p className="text-[14px] text-gray-500 font-medium">Checking your payout setup...</p>
                </div>
              </div>
            )}

            {!statusLoading && stripeConnected && (
              <div className="bg-white border border-gray-100 shadow-sm rounded-[24px] p-8 mb-6" data-testid="stripe-step-connected">
                <div className="flex flex-col items-center text-center mb-8">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <Check size={22} strokeWidth={3} className="text-green-600" />
                  </div>
                  <h2 className="text-[20px] font-bold text-gray-900 mb-2">Stripe connected</h2>
                  <p className="text-[15px] text-gray-600 font-medium max-w-[320px]">
                    {stripeStatus?.bank_last4
                      ? `Payouts go to your bank account ending ${stripeStatus.bank_last4}.`
                      : 'Your payout account is set up.'}{' '}
                    You&apos;re ready to accept paid bookings.
                  </p>
                </div>
                <div className="flex flex-col items-center">
                  <button
                    onClick={handleGoLive}
                    disabled={isGoingLive}
                    className="w-full py-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2 mb-3"
                  >
                    {isGoingLive ? 'Submitting…' : 'Go live'} <ArrowLeft size={18} className="rotate-180" />
                  </button>
                  {error && (
                    <p className="text-[13px] text-red-600 font-medium text-center mb-2">{error}</p>
                  )}
                  <p className="text-[13px] text-gray-400 font-medium text-center">Your profile is submitted for review — we&apos;ll email you when it goes live.</p>
                </div>
              </div>
            )}

            {!statusLoading && !stripeConnected && (
            <>
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
                <button
                  onClick={handleConnectStripe}
                  disabled={connecting || isGoingLive}
                  className="w-full py-4 bg-[#0077CC] hover:bg-[#0066AA] disabled:opacity-60 text-white rounded-xl font-bold text-[16px] transition-colors shadow-sm flex items-center justify-center gap-2 mb-3"
                >
                  {connecting ? 'Connecting…' : 'Connect with Stripe'} <ArrowLeft size={18} className="rotate-180" />
                </button>
                {error && (
                  <p className="text-[13px] text-red-600 font-medium text-center mb-2">{error}</p>
                )}
                <p className="text-[13px] text-gray-400 font-medium text-center">Takes about 5 minutes. You&apos;ll complete setup securely on Stripe.</p>
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
            </>
            )}
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
                onClick={handleSkip}
                disabled={isGoingLive || connecting}
                className="text-[13px] text-gray-500 hover:text-gray-900 font-medium transition-colors disabled:opacity-60"
              >
                Skip for now
              </button>
              <p className="text-[10px] text-gray-400 mt-0.5">You can complete this from your dashboard</p>
            </div>
            {/* UX-01 BUG 5: primary CTA follows the Stripe state — an
                already-connected coach goes live instead of re-connecting */}
            {stripeConnected ? (
              <button
                onClick={handleGoLive}
                disabled={isGoingLive}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-full px-7 py-2.5 text-[13px] font-medium transition-colors"
              >
                {isGoingLive ? 'Submitting…' : 'Go live →'}
              </button>
            ) : (
              <button
                onClick={handleConnectStripe}
                disabled={connecting || isGoingLive || statusLoading}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white rounded-full px-7 py-2.5 text-[13px] font-medium transition-colors"
              >
                {connecting ? 'Connecting…' : 'Connect with Stripe →'}
              </button>
            )}
          </div>
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
      />
    </div>
  )
}
