'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Fix-PROD-PROFILE-01 / Fix-AUTH-RESEND-01: the verify screen previously
// rendered "Resend email" as a <Link href="/register"> — a navigation that
// never resent anything. This button stays on /verify and actually calls
// supabase.auth.resend({ type: 'signup' }), with sending/sent/error states.

type Status = 'idle' | 'sending' | 'sent' | 'error'

const linkStyle: React.CSSProperties = {
  color: '#0077CC',
  fontWeight: 500,
  fontSize: '13px',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
}

export function ResendEmailButton({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  const handleResend = async () => {
    if (status === 'sending' || status === 'sent') return
    setStatus('sending')
    setMessage('')

    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setStatus('error')
      setMessage(
        error.code === 'over_email_send_rate_limit' ||
          error.message.toLowerCase().includes('rate limit')
          ? 'Too many requests — please wait a minute and try again.'
          : 'Could not resend. Please try again.',
      )
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <span style={{ color: '#1A7A4A', fontWeight: 500, fontSize: '13px' }}>
        Email sent — check your inbox
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleResend}
        disabled={status === 'sending'}
        style={{
          ...linkStyle,
          cursor: status === 'sending' ? 'not-allowed' : 'pointer',
          opacity: status === 'sending' ? 0.6 : 1,
        }}
      >
        {status === 'sending' ? 'Sending…' : 'Resend email'}
      </button>
      {status === 'error' && (
        <span style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: '#B91C1C' }}>
          {message}
        </span>
      )}
    </>
  )
}
