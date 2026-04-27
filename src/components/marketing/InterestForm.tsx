'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LocationAutocomplete } from '@/components/coach/shared/LocationAutocomplete'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'coach' | 'parent' | 'player'

interface Sport {
  id: string
  name: string
}

export interface InterestFormProps {
  mode: 'fullscreen' | 'modal'
  initialRole?: Role
  onClose?: () => void
  onSuccess?: () => void
}

type FormView = 'form' | 'thankyou'

// ─── Styles ───────────────────────────────────────────────────────────────────

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

const SHARE_BTN: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: '44px',
  padding: '0 18px',
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  color: '#334155',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'background 150ms, border-color 150ms',
  whiteSpace: 'nowrap' as const,
}

// ─── Share text ───────────────────────────────────────────────────────────────

const SHARE_TEXT = encodeURIComponent(
  'Just registered with Crikly — looks promising for cricket coaching in the UK. https://www.crikly.app'
)

// ─── Thank You view ───────────────────────────────────────────────────────────

function ThankYouView({
  role,
  firstName,
  onClose,
}: {
  role: Role
  firstName: string
  onClose?: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard?.writeText('https://www.crikly.app').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleClose() {
    onClose?.()
  }

  const greeting = firstName ? `, ${firstName}` : ''
  const isCoach = role === 'coach'

  return (
    <div className="text-center" style={{ maxWidth: '560px', margin: '0 auto' }}>
      {/* Logo */}
      <div style={{ marginBottom: '36px' }}>
        <Image
          src="/logo.png"
          alt="Crikly"
          height={64}
          width={176}
          priority
          style={{ display: 'inline-block' }}
        />
      </div>

      {/* Heading */}
      <h2
        className="font-medium text-[#0F172A] m-0"
        style={{ fontSize: '30px', letterSpacing: '-0.025em', marginBottom: '6px' }}
      >
        {isCoach ? 'Welcome to Crikly.' : 'You\u2019re in. \uD83C\uDF89'}
      </h2>

      <p
        className="font-medium m-0"
        style={{ fontSize: '17px', color: '#0F172A', marginBottom: '24px' }}
      >
        Thanks for registering{greeting}.
      </p>

      {/* Body copy */}
      {isCoach ? (
        <>
          <p className="m-0" style={{ fontSize: '15px', color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
            Coaching is hard, important work. The hours you put in — the evenings, the weather days,
            the players who show up nervous and leave a little taller — that&apos;s what this platform
            is built to protect.
          </p>
          <p className="m-0" style={{ fontSize: '15px', color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
            We&apos;re focused on building Crikly for coaches first. When we open up your area,
            you&apos;ll be one of the first we contact.
          </p>
          <p className="m-0" style={{ fontSize: '15px', color: '#475569', lineHeight: 1.7, marginBottom: '36px' }}>
            In the meantime, we&apos;ll send you the occasional update on what we&apos;re building
            — no marketing fluff, just genuine progress.
          </p>
        </>
      ) : (
        <>
          <p className="m-0" style={{ fontSize: '15px', color: '#475569', lineHeight: 1.7, marginBottom: '14px' }}>
            We&apos;re verifying coaches now and will be in touch the moment Crikly is ready in
            your area.
          </p>
          <p className="m-0" style={{ fontSize: '15px', color: '#475569', lineHeight: 1.7, marginBottom: '36px' }}>
            Until then, you&apos;ll occasionally hear from us with genuine updates — no spam, no
            marketing fluff.
          </p>
        </>
      )}

      {/* Share section */}
      <div
        style={{
          paddingTop: '28px',
          borderTop: '1px solid #E2E8F0',
          marginBottom: '32px',
        }}
      >
        <p
          className="m-0"
          style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {isCoach ? '— Help us reach more coaches —' : '— Help us spread the word —'}
        </p>

        <div
          className="flex flex-wrap justify-center"
          style={{ gap: '10px' }}
        >
          {/* WhatsApp */}
          <a
            href={`https://wa.me/?text=${SHARE_TEXT}`}
            target="_blank"
            rel="noopener noreferrer"
            style={SHARE_BTN}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#F8FAFC'
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#CBD5E1'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#fff'
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#E2E8F0'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
            </svg>
            WhatsApp
          </a>

          {/* X / Twitter */}
          <a
            href={`https://twitter.com/intent/tweet?text=${SHARE_TEXT}`}
            target="_blank"
            rel="noopener noreferrer"
            style={SHARE_BTN}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#F8FAFC'
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#CBD5E1'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#fff'
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#E2E8F0'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Share on X
          </a>

          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fwww.crikly.app"
            target="_blank"
            rel="noopener noreferrer"
            style={SHARE_BTN}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#F8FAFC'
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#CBD5E1'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLAnchorElement).style.background = '#fff'
              ;(e.currentTarget as HTMLAnchorElement).style.borderColor = '#E2E8F0'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/>
              <circle cx="4" cy="4" r="2"/>
            </svg>
            LinkedIn
          </a>

          {/* Copy link */}
          <button
            onClick={handleCopy}
            style={{
              ...SHARE_BTN,
              background: copied ? '#E6F3FB' : '#fff',
              borderColor: copied ? '#0077CC' : '#E2E8F0',
              color: copied ? '#0077CC' : '#334155',
            }}
            onMouseEnter={e => {
              if (!copied) {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#CBD5E1'
              }
            }}
            onMouseLeave={e => {
              if (!copied) {
                ;(e.currentTarget as HTMLButtonElement).style.background = '#fff'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0'
              }
            }}
          >
            {copied ? <Check size={14} strokeWidth={2.5} /> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            )}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* Close */}
      <button
        onClick={handleClose}
        className="font-medium"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#64748B',
          fontFamily: 'inherit',
          fontSize: '14px',
          cursor: 'pointer',
          padding: '8px 16px',
        }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#0F172A')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#64748B')}
      >
        Close
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InterestForm({ mode, initialRole, onClose, onSuccess }: InterestFormProps) {
  const [view, setView] = useState<FormView>('form')

  // Form fields
  const [role, setRole] = useState<Role | undefined>(initialRole)
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
  const sportsRequired = role === 'coach'

  const isValid =
    role !== undefined &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    validateEmail(email) &&
    (!sportsRequired || sportsValue.some(s => s.trim().length > 0)) &&
    location.trim().length > 0 &&
    consentGiven

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid || submitting || !role) return

    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
          sports: sportsValue.filter(s => s.trim().length > 0),
          location: location.trim(),
          consentGiven: true,
          consentAt: new Date().toISOString(),
        }),
      })

      if (res.status === 201) {
        setView('thankyou')
      } else {
        setSubmitError('Something went wrong. Please try again.')
        setSubmitting(false)
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const firstName = name.trim().split(' ')[0] ?? ''

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
        <ThankYouView
          role={role ?? 'coach'}
          firstName={firstName}
          onClose={onClose}
        />
      ) : (
        <>
          <h2
            className="font-medium text-[#0F172A] m-0 mb-2"
            style={{ fontSize: '24px', letterSpacing: '-0.02em' }}
          >
            Register your interest
          </h2>
          <p className="m-0" style={{ fontSize: '14px', color: '#475569', marginBottom: '24px' }}>
            Be first to know when Crikly launches. We&apos;ll reach out personally.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {/* Role selector — hidden when initialRole is set */}
            {!initialRole && (
              <div style={{ marginBottom: '20px' }}>
                <label style={FIELD_LABEL}>I am a</label>
                <div className="flex" style={{ gap: '8px' }}>
                  {(['coach', 'parent', 'player'] as Role[]).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className="flex-1 font-medium capitalize transition-all"
                      style={{
                        height: '44px',
                        borderRadius: '10px',
                        border: `1.5px solid ${role === r ? '#0077CC' : '#E2E8F0'}`,
                        background: role === r ? '#E6F3FB' : '#fff',
                        color: role === r ? '#0077CC' : '#475569',
                        fontSize: '14px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
              <label style={FIELD_LABEL}>
                {role === 'coach' ? "Sport(s) you coach" : "Sport you're looking for coaching in"}
              </label>
              {sportsFallback ? (
                <input
                  style={INPUT_BASE}
                  type="text"
                  value={sportsFallbackText}
                  onChange={e => setSportsFallbackText(e.target.value)}
                  placeholder={role === 'coach' ? 'Enter the sport(s) you coach' : 'e.g. Cricket'}
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
              {!sportsRequired && (
                <p style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>Optional</p>
              )}
            </div>

            {/* Location */}
            <div style={{ marginBottom: '18px' }}>
              <label style={FIELD_LABEL}>Your location</label>
              <LocationAutocomplete
                value={location}
                onChange={val => setLocation(val)}
                onSelect={place => {
                  const formatted = [place.city, place.postcode].filter(Boolean).join(', ')
                  setLocation(formatted)
                }}
                placeholder="City, town, or postcode"
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
