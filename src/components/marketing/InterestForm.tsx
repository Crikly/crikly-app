'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check, Copy, Link } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Sport {
  id: string
  name: string
}

export interface InterestFormProps {
  mode: 'fullscreen' | 'modal'
  onClose?: () => void
  onSuccess?: () => void
}

type FormView = 'form' | 'thankyou'

// ─── Field label style ────────────────────────────────────────────────────────

const FIELD_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: '#64748B',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '8px',
}

const INPUT_BASE: React.CSSProperties = {
  width: '100%',
  height: '48px',
  padding: '0 16px',
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  fontFamily: 'inherit',
  fontSize: '15px',
  color: '#0F172A',
  outline: 'none',
  boxSizing: 'border-box',
}

// ─── Skeleton pill ────────────────────────────────────────────────────────────

function SkeletonPill() {
  return (
    <div
      className="inline-block rounded-full animate-pulse"
      style={{ height: '36px', width: '80px', background: '#E2E8F0' }}
    />
  )
}

// ─── Thank You view ───────────────────────────────────────────────────────────

function ThankYouView({ onClose, onSuccess }: { onClose?: () => void; onSuccess?: () => void }) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText('https://crikly.app').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleExplore() {
    onClose?.()
    onSuccess?.()
    router.push('/home')
  }

  return (
    <div className="text-center" style={{ maxWidth: '420px', margin: '0 auto' }}>
      {/* Teal checkmark icon */}
      <div
        className="rounded-full inline-flex items-center justify-center"
        style={{
          width: '80px',
          height: '80px',
          background: '#E0F6F8',
          color: '#0099AA',
          margin: '0 auto 28px',
        }}
      >
        <Check size={40} strokeWidth={2.4} />
      </div>

      <h2
        className="font-medium text-[#0F172A] m-0 mb-3"
        style={{ fontSize: '28px', letterSpacing: '-0.02em' }}
      >
        You&apos;re on the list
      </h2>

      <p
        className="m-0"
        style={{
          fontSize: '16px',
          color: '#475569',
          lineHeight: 1.55,
          maxWidth: '380px',
          margin: '0 auto 32px',
        }}
      >
        Thanks for registering your interest. We&apos;ll be in touch personally
        when Crikly is ready for coaches in your area. Keep an eye on your inbox.
      </p>

      <button
        onClick={handleExplore}
        className="font-medium transition-colors"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#0077CC',
          fontFamily: 'inherit',
          fontSize: '15px',
          cursor: 'pointer',
          padding: '8px 12px',
          textDecoration: 'none',
          display: 'inline-block',
        }}
      >
        Explore the platform →
      </button>

      {/* Share row */}
      <div
        className="text-center"
        style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #E2E8F0' }}
      >
        <p
          className="m-0"
          style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '14px' }}
        >
          Know another coach who&apos;d be interested? Share Crikly with them.
        </p>
        <div className="inline-flex" style={{ gap: '10px' }}>
          {/* Copy link */}
          <button
            onClick={handleCopy}
            title={copied ? 'Copied!' : 'Copy link'}
            className="rounded-full inline-flex items-center justify-center transition-all"
            style={{
              width: '44px',
              height: '44px',
              background: copied ? '#E6F3FB' : '#F8FAFC',
              border: `1px solid ${copied ? '#0077CC' : '#E2E8F0'}`,
              color: copied ? '#0077CC' : '#475569',
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={18} /> : <Link size={18} />}
          </button>

          {/* WhatsApp */}
          <a
            href="https://wa.me/?text=Check%20out%20Crikly%20%E2%80%94%20https%3A%2F%2Fcrikly.app"
            target="_blank"
            rel="noopener noreferrer"
            title="Share on WhatsApp"
            className="rounded-full inline-flex items-center justify-center transition-all"
            style={{
              width: '44px',
              height: '44px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#475569',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
          </a>

          {/* Twitter / X */}
          <a
            href="https://x.com/intent/tweet?text=Check%20out%20Crikly%20%E2%80%94%20https%3A%2F%2Fcrikly.app"
            target="_blank"
            rel="noopener noreferrer"
            title="Share on X"
            className="rounded-full inline-flex items-center justify-center transition-all"
            style={{
              width: '44px',
              height: '44px',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#475569',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InterestForm({ mode, onClose, onSuccess }: InterestFormProps) {
  const [view, setView] = useState<FormView>('form')

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [location, setLocation] = useState('')

  // Sports fetch
  const [sports, setSports] = useState<Sport[]>([])
  const [sportsLoading, setSportsLoading] = useState(true)
  const [sportsFallback, setSportsFallback] = useState(false)
  const [sportsFallbackText, setSportsFallbackText] = useState('')

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)

  // Escape key for modal
  useEffect(() => {
    if (mode !== 'modal') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  // Fetch sports on mount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('sports')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data, error }) => {
        if (error || !data?.length) {
          setSportsFallback(true)
        } else {
          setSports(data)
        }
        setSportsLoading(false)
      })
  }, [])

  const validateEmail = useCallback((v: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
  }, [])

  function handleEmailBlur() {
    if (email && !validateEmail(email)) {
      setEmailError('Enter a valid email address.')
    } else {
      setEmailError('')
    }
  }

  function toggleSport(sportName: string) {
    setSelectedSports(prev =>
      prev.includes(sportName)
        ? prev.filter(s => s !== sportName)
        : [...prev, sportName]
    )
  }

  const sportsValue = sportsFallback ? [sportsFallbackText] : selectedSports
  const isValid =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    validateEmail(email) &&
    sportsValue.some(s => s.trim().length > 0) &&
    location.trim().length > 0 &&
    consentGiven

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || submitting) return

    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role: 'coach',
          sports: sportsValue.filter(s => s.trim().length > 0),
          location: location.trim(),
          consentGiven: true,
          consentAt: new Date().toISOString(),
        }),
      })

      if (res.status === 201) {
        setView('thankyou')
        onSuccess?.()
      } else {
        setSubmitError('Something went wrong. Please try again.')
        setSubmitting(false)
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // ── Inner content ──────────────────────────────────────────────────────────

  const formContent = (
    <div style={{ width: '100%', maxWidth: '480px' }}>
      {mode === 'fullscreen' && view === 'form' && (
        <div
          className="font-bold select-none leading-none text-center"
          style={{
            fontSize: '32px',
            letterSpacing: '-0.035em',
            color: '#0F172A',
            marginBottom: '28px',
            display: 'block',
          }}
        >
          crikl<span style={{ color: '#0077CC' }}>y</span>
        </div>
      )}

      {view === 'thankyou' ? (
        <ThankYouView onClose={onClose} onSuccess={onSuccess} />
      ) : (
        <>
          <h2
            className="font-medium text-[#0F172A] m-0 mb-2"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            Register your interest
          </h2>
          <p className="m-0" style={{ fontSize: '14px', color: '#475569', marginBottom: '28px' }}>
            Be first to know when Crikly launches. We&apos;ll reach out personally.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Full name */}
            <div style={{ marginBottom: '18px' }}>
              <label style={FIELD_LABEL}>Full name</label>
              <input
                style={INPUT_BASE}
                type="text"
                name="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '18px' }}>
              <label style={FIELD_LABEL}>Email address</label>
              <input
                style={{
                  ...INPUT_BASE,
                  borderColor: emailError ? '#B91C1C' : '#E2E8F0',
                  background: emailError ? '#fff' : '#F8FAFC',
                }}
                type="email"
                name="email"
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailError) setEmailError('') }}
                onBlur={handleEmailBlur}
                placeholder="your@email.com"
                autoComplete="email"
                required
              />
              {emailError && (
                <span style={{ display: 'block', fontSize: '12px', color: '#B91C1C', marginTop: '4px' }}>
                  {emailError}
                </span>
              )}
            </div>

            {/* Sport(s) */}
            <div style={{ marginBottom: '18px' }}>
              <label style={FIELD_LABEL}>Sport(s) you coach</label>
              {sportsFallback ? (
                <input
                  style={INPUT_BASE}
                  type="text"
                  value={sportsFallbackText}
                  onChange={e => setSportsFallbackText(e.target.value)}
                  placeholder="Enter the sport(s) you coach"
                />
              ) : sportsLoading ? (
                <div className="flex flex-wrap" style={{ gap: '8px' }}>
                  {[80, 68, 90].map(w => (
                    <div
                      key={w}
                      className="rounded-full animate-pulse"
                      style={{ height: '36px', width: `${w}px`, background: '#E2E8F0' }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap" style={{ gap: '8px' }}>
                  {sports.map(sport => {
                    const active = selectedSports.includes(sport.name)
                    return (
                      <button
                        key={sport.id}
                        type="button"
                        onClick={() => toggleSport(sport.name)}
                        className="inline-flex items-center font-medium transition-all"
                        style={{
                          height: '36px',
                          padding: '0 14px',
                          borderRadius: '999px',
                          border: `1px solid ${active ? '#0077CC' : '#CBD5E1'}`,
                          background: active ? '#E6F3FB' : '#fff',
                          color: active ? '#0077CC' : '#334155',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        {sport.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Location */}
            <div style={{ marginBottom: '18px' }}>
              <label style={FIELD_LABEL}>Your location</label>
              <input
                style={INPUT_BASE}
                type="text"
                name="location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City or postcode"
                required
              />
            </div>

            {/* GDPR consent */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={e => setConsentGiven(e.target.checked)}
                  style={{ marginTop: '2px', accentColor: '#0077CC', flexShrink: 0, width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                  I agree to Crikly contacting me about my registration and the platform launch. I have read the{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#0077CC' }}>Privacy Policy</a>
                  {' '}and{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0077CC' }}>Terms &amp; Conditions</a>.
                </span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="w-full font-medium flex items-center justify-center transition-opacity"
              style={{
                height: '52px',
                background: '#0077CC',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                opacity: isValid && !submitting ? 1 : 0.4,
                gap: '8px',
              }}
            >
              {submitting ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Registering…
                </>
              ) : (
                'Register my interest'
              )}
            </button>

            {submitError && (
              <p style={{ fontSize: '13px', color: '#B91C1C', textAlign: 'center', marginTop: '8px' }}>
                {submitError}
              </p>
            )}

            <p style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center', marginTop: '12px' }}>
              No spam. We&apos;ll only contact you when we&apos;re ready for you.
            </p>
          </form>
        </>
      )}
    </div>
  )

  // ── Fullscreen mode ────────────────────────────────────────────────────────

  if (mode === 'fullscreen') {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center overflow-y-auto"
        style={{ background: '#fff', zIndex: 50, padding: '56px 20px 40px' }}
      >
        {formContent}
      </div>
    )
  }

  // ── Modal mode ─────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)', zIndex: 50, padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="relative w-full overflow-y-auto"
        style={{
          maxWidth: '480px',
          maxHeight: 'calc(100vh - 40px)',
          background: '#fff',
          borderRadius: '14px',
          padding: '32px 32px 28px',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* × close button */}
        {view === 'form' && onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute inline-flex items-center justify-center rounded-full transition-colors"
            style={{
              top: '14px',
              right: '14px',
              width: '36px',
              height: '36px',
              border: 'none',
              background: 'transparent',
              color: '#64748B',
              cursor: 'pointer',
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        )}
        {formContent}
      </div>
    </div>
  )
}
