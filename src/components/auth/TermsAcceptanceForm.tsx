'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { AuthError } from '@/types/auth'

export function TermsAcceptanceForm() {
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [checkboxError, setCheckboxError] = useState('')
  const [apiError, setApiError] = useState<AuthError | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleContinue = async () => {
    setCheckboxError('')
    setApiError(null)

    if (!accepted) {
      setCheckboxError('You must accept the Terms & Conditions to continue')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptedAt: new Date().toISOString() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setApiError(data.error ?? {
          code: 'UNKNOWN_ERROR',
          message: 'Something went wrong. Please try again.',
        })
        return
      }
      // Fix-AUDIT-02: route by canonical role after accepting terms — coaches
      // to their dashboard (NOT /dashboard, which is a redirect-only route).
      // P-04-A: parent and player now land on the real parent dashboard
      // (replaces the P-04-PREP-01 /coaches placeholder).
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase
            .from('user_profiles')
            .select('active_role')
            .eq('auth_user_id', user.id)
            .single()
        : { data: null }
      const activeRole = profile?.active_role

      // P-04-B: terms acceptance is the once-per-account moment right
      // after a NEW registration (logins never pass through here), so this
      // is where the guest-booking check fires — parent/player only. Any
      // failure degrades to the dashboard: never block the auth path on
      // the guest scan.
      let parentDestination = '/parent/dashboard'
      if (activeRole === 'parent' || activeRole === 'player') {
        try {
          const guestRes = await fetch('/api/auth/guest-bookings')
          if (guestRes.ok) {
            const guestData = (await guestRes.json()) as { count?: number }
            if ((guestData.count ?? 0) > 0) {
              parentDestination = '/parent/link-bookings'
            }
          }
        } catch {
          // Degrade silently — offer simply not made.
        }
      }

      router.push(
        activeRole === 'coach'
          ? '/coach/dashboard'
          : activeRole === 'parent' || activeRole === 'player'
            ? parentDestination
            : '/onboarding/role'
      )
    } catch {
      setApiError({
        code: 'NETWORK_ERROR',
        message: 'Connection error. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {apiError && (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#B91C1C',
          }}
        >
          {apiError.message}
        </div>
      )}

      <div style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        padding: '16px',
        fontSize: '13px',
        color: '#475569',
        lineHeight: 1.6,
      }}>
        <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#0F172A', fontSize: '14px' }}>
          Before you continue
        </p>
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <li>Crikly connects parents, players, and verified coaches</li>
          <li>All coaches are DBS checked before appearing on the platform</li>
          <li>Payments are processed securely via Stripe</li>
          <li>You can cancel bookings within the cancellation window</li>
          <li>Your data is handled in accordance with UK GDPR</li>
        </ul>
      </div>

      <div>
        <label
          htmlFor="terms-checkbox"
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            cursor: 'pointer',
          }}
        >
          <input
            id="terms-checkbox"
            type="checkbox"
            checked={accepted}
            onChange={(e) => {
              setAccepted(e.target.checked)
              if (e.target.checked) setCheckboxError('')
            }}
            data-testid="terms-checkbox"
            style={{
              width: '18px',
              height: '18px',
              marginTop: '2px',
              accentColor: '#0077CC',
              flexShrink: 0,
              cursor: 'pointer',
            }}
            aria-describedby={checkboxError ? 'terms-error' : undefined}
          />
          <span style={{ fontSize: '14px', color: '#0F172A', lineHeight: 1.5 }}>
            I agree to the{' '}
            <Link
              href="/terms"
              target="_blank"
              style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}
            >
              Terms & Conditions
            </Link>
            {' '}and{' '}
            <Link
              href="/privacy"
              target="_blank"
              style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}
            >
              Privacy Policy
            </Link>
          </span>
        </label>

        {checkboxError && (
          <p
            id="terms-error"
            role="alert"
            style={{
              fontSize: '12px',
              color: '#B91C1C',
              margin: '8px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {checkboxError}
          </p>
        )}
      </div>

      <button
        onClick={handleContinue}
        disabled={isLoading}
        data-testid="terms-continue"
        style={{
          width: '100%',
          height: '52px',
          background: isLoading ? '#378ADD' : '#0077CC',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 500,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontFamily: 'DM Sans, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        aria-busy={isLoading}
      >
        {isLoading && (
          <div style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(255,255,255,0.4)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        )}
        {isLoading ? 'Saving...' : 'Accept and continue'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
