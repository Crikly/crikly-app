'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LoginFormData, AuthError } from '@/types/auth'

interface LoginFormProps {
  onSuccess?: () => void
}

export function LoginForm({ onSuccess }: LoginFormProps = {}) {
  const router = useRouter()
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  })
  const [errors, setErrors] = useState<Partial<LoginFormData>>({})
  const [apiError, setApiError] = useState<AuthError | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const validate = (): boolean => {
    const newErrors: Partial<LoginFormData> = {}
    if (!formData.email.trim()) newErrors.email = 'Email address is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }
    if (!formData.password) newErrors.password = 'Password is required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    setApiError(null)
    if (!validate()) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' })
        return
      }
      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/dashboard')
      }
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
        </div>
      )}

      <div>
        <label htmlFor="email" style={labelStyle}>Email address</label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
          style={inputStyle(!!errors.email)}
          autoComplete="email"
          aria-describedby={errors.email ? 'email-error' : undefined}
          data-testid="login-email"
        />
        {errors.email && (
          <span id="email-error" style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px', display: 'block' }}>
            {errors.email}
          </span>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label htmlFor="password" style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
          <Link
            href="/forgot-password"
            style={{ fontSize: '12px', color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}
          >
            Forgot password?
          </Link>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            style={inputStyle(!!errors.password)}
            autoComplete="current-password"
            aria-describedby={errors.password ? 'password-error' : undefined}
            data-testid="login-password"
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
          <span id="password-error" style={{ fontSize: '12px', color: '#B91C1C', marginTop: '4px', display: 'block' }}>
            {errors.password}
          </span>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        data-testid="login-submit"
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
        {isLoading ? 'Logging in...' : 'Log in'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
