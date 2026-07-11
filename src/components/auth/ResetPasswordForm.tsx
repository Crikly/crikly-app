'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { AuthError } from '@/types/auth'

// BUG-33: set-new-password form for the recovery session established by
// /auth/callback?type=recovery. Mirrors the LoginForm/ForgotPasswordForm
// patterns (validation, show/hide toggle, error surface, loading state).
export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({})
  const [apiError, setApiError] = useState<AuthError | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const validate = (): boolean => {
    const newErrors: { password?: string; confirmPassword?: string } = {}
    if (!password) newErrors.password = 'Password is required'
    else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }
    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your password'
    else if (confirmPassword !== password) {
      newErrors.confirmPassword = 'Passwords do not match'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    setApiError(null)
    if (!validate()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = (await res.json()) as { redirectTo?: string; error?: AuthError }
      if (!res.ok) {
        setApiError(data.error ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' })
        return
      }
      router.push(data.redirectTo ?? '/dashboard')
    } catch {
      setApiError({ code: 'NETWORK_ERROR', message: 'Connection error. Please check your internet and try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const inputStyle = (hasError: boolean) => ({
    display: 'block',
    width: '100%',
    height: '52px',
    padding: '0 16px',
    background: '#F8FAFC',
    border: `1px solid ${hasError ? '#B91C1C' : '#E2E8F0'}`,
    borderRadius: '10px',
    fontSize: '15px',
    color: '#0F172A',
    fontFamily: 'DM Sans, sans-serif',
    outline: 'none',
    boxSizing: 'border-box' as const,
  })

  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: '#64748B',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    marginBottom: '6px',
  }

  const sessionExpired = apiError?.code === 'SESSION_EXPIRED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          {sessionExpired && (
            <>
              {' '}
              <Link
                href="/forgot-password"
                style={{ color: '#B91C1C', fontWeight: 600, textDecoration: 'underline' }}
              >
                Request a new link
              </Link>
            </>
          )}
        </div>
      )}

      <div>
        <label htmlFor="new-password" style={labelStyle}>New password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle(!!errors.password)}
            autoComplete="new-password"
            aria-describedby={errors.password ? 'new-password-error' : undefined}
            data-testid="reset-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        {errors.password && (
          <span id="new-password-error" style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px', display: 'block' }}>
            {errors.password}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="confirm-password" style={labelStyle}>Confirm new password</label>
        <input
          id="confirm-password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Repeat your new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          style={inputStyle(!!errors.confirmPassword)}
          autoComplete="new-password"
          aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
          data-testid="reset-confirm-password"
        />
        {errors.confirmPassword && (
          <span id="confirm-password-error" style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px', display: 'block' }}>
            {errors.confirmPassword}
          </span>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        data-testid="reset-submit"
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
          marginTop: '4px',
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
        {isLoading ? 'Saving...' : 'Save new password'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
