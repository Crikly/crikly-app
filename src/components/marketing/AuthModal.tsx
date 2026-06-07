'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { LoginForm } from '@/components/auth/LoginForm'
import { RegisterForm } from '@/components/auth/RegisterForm'

export interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  defaultMode?: 'login' | 'register'
  postAuthAction?: 'return' | 'onboarding' | 'booking'
  bookingContext?: {
    coachSlug: string
    selectedSlot?: string
  }
}

type TabMode = 'login' | 'register'

export function AuthModal({
  isOpen,
  onClose,
  defaultMode = 'login',
  postAuthAction = 'return',
  bookingContext,
}: AuthModalProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabMode>(defaultMode)

  // Sync active tab when defaultMode changes (e.g. nav opens with 'register')
  useEffect(() => {
    setActiveTab(defaultMode)
  }, [defaultMode, isOpen])

  // Escape key
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  function handleSuccess() {
    onClose()

    if (postAuthAction === 'onboarding') {
      router.push('/onboarding/role')
      return
    }

    if (postAuthAction === 'booking') {
      try {
        const raw = typeof window !== 'undefined'
          ? sessionStorage.getItem('crikly_booking_intent')
          : null

        if (raw) {
          const intent = JSON.parse(raw) as { coachSlug: string; selectedSlot?: string }
          sessionStorage.removeItem('crikly_booking_intent')
          const params = intent.selectedSlot
            ? `?slot=${encodeURIComponent(intent.selectedSlot)}`
            : ''
          router.push(`/coaches/${intent.coachSlug}/book${params}`)
          return
        }
      } catch {
        // Fallback on parse error
      }

      if (bookingContext?.coachSlug) {
        const params = bookingContext.selectedSlot
          ? `?slot=${encodeURIComponent(bookingContext.selectedSlot)}`
          : ''
        router.push(`/coaches/${bookingContext.coachSlug}/book${params}`)
        return
      }

      router.push('/home')
      return
    }

    // postAuthAction === 'return' — stay on page, modal already closed
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background: 'rgba(15,23,42,0.5)',
        zIndex: 50,
        padding: '20px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full"
        style={{
          maxWidth: '420px',
          background: '#fff',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 20px 60px rgba(15,23,42,0.18)',
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
            color: '#94A3B8',
            cursor: 'pointer',
            transition: 'background 150ms, color 150ms',
          }}
          onMouseEnter={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#0F172A'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'
          }}
        >
          <X size={18} strokeWidth={2} />
        </button>

        {/* Tab toggle */}
        <div
          className="flex"
          style={{ borderBottom: '1px solid #F1F5F9', marginBottom: '24px' }}
        >
          {(['login', 'register'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="font-medium"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #0077CC' : '2px solid transparent',
                color: activeTab === tab ? '#0077CC' : '#64748B',
                fontSize: '14px',
                padding: '0 4px 12px',
                marginRight: '20px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 150ms, border-color 150ms',
              }}
            >
              {tab === 'login' ? 'Log in' : 'Register'}
            </button>
          ))}
        </div>

        {/* Active form */}
        {activeTab === 'login' ? (
          <LoginForm onSuccess={handleSuccess} />
        ) : (
          <RegisterForm onSuccess={handleSuccess} />
        )}

        {/* Footer switch link */}
        <p
          className="text-center"
          style={{ fontSize: '13px', color: '#475569', marginTop: '20px', marginBottom: 0 }}
        >
          {activeTab === 'login' ? (
            <>
              New to Crikly?{' '}
              <button
                onClick={() => setActiveTab('register')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0077CC',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  padding: 0,
                }}
              >
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setActiveTab('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0077CC',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  padding: 0,
                }}
              >
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
