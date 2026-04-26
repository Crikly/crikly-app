'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Rocket, CheckCircle, X } from 'lucide-react'

export interface ComingSoonModalProps {
  isOpen: boolean
  onClose: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type SubmitState = 'idle' | 'loading' | 'success' | 'error'

export function ComingSoonModal({ isOpen, onClose }: ComingSoonModalProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [emailError, setEmailError] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isValidEmail = EMAIL_RE.test(email.trim())
  const canSubmit = isValidEmail && consentGiven

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      // Reset on close
      setEmail('')
      setSubmitState('idle')
      setEmailError('')
      setConsentGiven(false)
    }
  }, [isOpen])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!isValidEmail) {
      setEmailError('Please enter a valid email address.')
      return
    }

    setEmailError('')
    setSubmitState('loading')

    try {
      const role = typeof window !== 'undefined'
        ? sessionStorage.getItem('crikly_role') ?? undefined
        : undefined

      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          ...(role ? { role } : {}),
          consentGiven: true,
          consentAt: new Date().toISOString(),
        }),
      })

      if (res.ok || res.status === 201) {
        setSubmitState('success')
      } else {
        setSubmitState('error')
      }
    } catch {
      setSubmitState('error')
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(15,23,42,0.5)',
        zIndex: 50,
        padding: '20px',
        cursor: 'pointer',
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full text-center"
        style={{
          maxWidth: '400px',
          background: '#fff',
          borderRadius: '14px',
          padding: '40px 32px 28px',
          boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
          cursor: 'default',
          animation: 'pageIn 250ms cubic-bezier(0.22,1,0.36,1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* × close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute inline-flex items-center justify-center"
          style={{
            top: '14px',
            right: '14px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            color: '#64748B',
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#0F172A'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#64748B'
          }}
        >
          <X size={18} strokeWidth={2} />
        </button>

        {/* Icon */}
        <div
          className="inline-flex items-center justify-center mx-auto"
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#E6F3FB',
            color: '#0077CC',
            marginBottom: '18px',
          }}
        >
          <Rocket size={26} strokeWidth={1.8} />
        </div>

        {/* Heading */}
        <h2
          className="font-medium m-0"
          style={{
            fontSize: '20px',
            color: '#0F172A',
            letterSpacing: '-0.01em',
            marginBottom: '10px',
          }}
        >
          Coming soon
        </h2>

        {/* Body */}
        <p
          className="mx-auto"
          style={{
            fontSize: '14px',
            color: '#475569',
            lineHeight: 1.55,
            maxWidth: '320px',
            margin: '0 auto 22px',
          }}
        >
          We&apos;re putting the finishing touches on Crikly. We&apos;ll be ready very soon — check back shortly or leave your email and we&apos;ll let you know the moment we launch.
        </p>

        {/* Email capture */}
        <form onSubmit={handleSubmit} noValidate>
          {submitState !== 'success' ? (
            <>
              <div className="flex" style={{ gap: '8px', marginBottom: '12px' }}>
                <input
                  ref={inputRef}
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value)
                    if (emailError) setEmailError('')
                    if (submitState === 'error') setSubmitState('idle')
                  }}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className="flex-1 min-w-0"
                  style={{
                    height: '44px',
                    padding: '0 14px',
                    background: '#F8FAFC',
                    border: emailError ? '1px solid #EF4444' : '1px solid #F1F5F9',
                    borderRadius: '10px',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    color: '#0F172A',
                    outline: 'none',
                    transition: 'border-color 150ms, box-shadow 150ms',
                  }}
                  onFocus={e => {
                    ;(e.target as HTMLInputElement).style.borderColor = '#0077CC'
                    ;(e.target as HTMLInputElement).style.background = '#fff'
                    ;(e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(0,119,204,0.12)'
                  }}
                  onBlur={e => {
                    ;(e.target as HTMLInputElement).style.borderColor = emailError ? '#EF4444' : '#F1F5F9'
                    ;(e.target as HTMLInputElement).style.background = '#F8FAFC'
                    ;(e.target as HTMLInputElement).style.boxShadow = 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={!canSubmit || submitState === 'loading'}
                  className="font-medium inline-flex items-center justify-center gap-2 flex-shrink-0"
                  style={{
                    height: '44px',
                    padding: '0 16px',
                    background: '#0077CC',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    cursor: canSubmit && submitState !== 'loading' ? 'pointer' : 'not-allowed',
                    opacity: canSubmit && submitState !== 'loading' ? 1 : 0.4,
                    whiteSpace: 'nowrap',
                    transition: 'background 150ms, opacity 150ms',
                  }}
                  onMouseEnter={e => {
                    if (canSubmit && submitState !== 'loading')
                      (e.currentTarget as HTMLButtonElement).style.background = '#005EA3'
                  }}
                  onMouseLeave={e => {
                    ;(e.currentTarget as HTMLButtonElement).style.background = '#0077CC'
                  }}
                >
                  {submitState === 'loading' ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{ animation: 'spin 0.8s linear infinite' }}
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    'Notify me'
                  )}
                </button>
              </div>

              {emailError && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px', marginTop: '-4px' }}>
                  {emailError}
                </p>
              )}

              {/* GDPR consent */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  marginBottom: '8px',
                }}
              >
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={e => setConsentGiven(e.target.checked)}
                  style={{ marginTop: '2px', accentColor: '#0077CC', flexShrink: 0, width: '14px', height: '14px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.5 }}>
                  I agree to be contacted about the Crikly launch. I&apos;ve read the{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#0077CC' }}>Privacy Policy</a>
                  {' '}and{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0077CC' }}>Terms</a>.
                </span>
              </label>

              {submitState === 'error' && (
                <p style={{ fontSize: '12px', color: '#EF4444', marginBottom: '8px', marginTop: '-4px' }}>
                  Something went wrong. Try again.
                </p>
              )}
            </>
          ) : (
            <div
              className="inline-flex items-center justify-center"
              style={{
                gap: '8px',
                color: '#0D9488',
                fontSize: '14px',
                fontWeight: 500,
                height: '44px',
                marginBottom: '12px',
              }}
            >
              <CheckCircle size={16} strokeWidth={2.4} />
              We&apos;ll be in touch!
            </div>
          )}

          <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '18px' }}>
            No spam. One email when we launch, that&apos;s it.
          </p>
        </form>

        {/* Back to homepage */}
        <button
          onClick={() => { onClose(); router.push('/home') }}
          className="font-medium"
          style={{
            background: 'none',
            border: 'none',
            color: '#0077CC',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '6px 10px',
            fontFamily: 'inherit',
            transition: 'color 150ms',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#005EA3')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#0077CC')}
        >
          Back to homepage
        </button>
      </div>
    </div>
  )
}
