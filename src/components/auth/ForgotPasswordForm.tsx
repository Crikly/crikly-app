'use client'

import { useState } from 'react'
import type { ForgotPasswordFormData, AuthError } from '@/types/auth'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [apiError, setApiError] = useState<AuthError | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validate = (): boolean => {
    if (!email.trim()) {
      setEmailError('Email address is required')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError('')
    return true
  }

  const handleSubmit = async () => {
    setApiError(null)
    if (!validate()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email } satisfies ForgotPasswordFormData),
      })
      if (!res.ok) {
        const data = await res.json()
        setApiError(data.error ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' })
        return
      }
      setIsSuccess(true)
    } catch {
      setApiError({ code: 'NETWORK_ERROR', message: 'Connection error. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: '#E6F3FB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#0077CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <p style={{ fontSize: '15px', color: '#0F172A', fontWeight: 500, margin: '0 0 8px' }}>
          Check your inbox
        </p>
        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
          We&apos;ve sent a reset link to <strong>{email}</strong>
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {apiError && (
        <div role="alert" style={{
          padding: '12px 14px',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#B91C1C',
        }}>
          {apiError.message}
        </div>
      )}

      <div>
        <label htmlFor="email" style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 600,
          color: '#64748B',
          letterSpacing: '0.5px',
          textTransform: 'uppercase' as const,
          marginBottom: '6px',
        }}>
          Email address
        </label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            height: '52px',
            padding: '0 16px',
            background: '#F8FAFC',
            border: `1px solid ${emailError ? '#B91C1C' : '#E2E8F0'}`,
            borderRadius: '10px',
            fontSize: '15px',
            color: '#0F172A',
            fontFamily: 'DM Sans, sans-serif',
            outline: 'none',
            boxSizing: 'border-box' as const,
          }}
          autoComplete="email"
          data-testid="forgot-email"
        />
        {emailError && (
          <span style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px', display: 'block' }}>
            {emailError}
          </span>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        data-testid="forgot-submit"
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
        {isLoading ? 'Sending...' : 'Send reset link'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
