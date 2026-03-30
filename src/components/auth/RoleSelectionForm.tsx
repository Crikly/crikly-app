'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RoleCard } from '@/components/auth/RoleCard'
import type { RoleSelectionData, AuthError } from '@/types/auth'

export function RoleSelectionForm() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<RoleSelectionData['role'] | null>(null)
  const [apiError, setApiError] = useState<AuthError | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleContinue = async () => {
    if (!selectedRole) return
    setApiError(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole } satisfies RoleSelectionData),
      })
      const data = await res.json()
      if (!res.ok) {
        setApiError(data.error ?? { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' })
        return
      }
      router.push('/dashboard')
    } catch {
      setApiError({ code: 'NETWORK_ERROR', message: 'Connection error. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

      <RoleCard
        role="parent"
        isSelected={selectedRole === 'parent'}
        onSelect={setSelectedRole}
      />
      <RoleCard
        role="player"
        isSelected={selectedRole === 'player'}
        onSelect={setSelectedRole}
      />
      <RoleCard
        role="coach"
        isSelected={selectedRole === 'coach'}
        onSelect={setSelectedRole}
      />

      <p style={{
        textAlign: 'center',
        fontSize: '11px',
        color: '#94A3B8',
        margin: '4px 0 8px',
        lineHeight: 1.5,
      }}>
        Must be 16 or older to register as a player
      </p>

      <button
        onClick={handleContinue}
        disabled={!selectedRole || isLoading}
        data-testid="role-continue"
        style={{
          width: '100%',
          height: '52px',
          background: !selectedRole ? '#94A3B8' : isLoading ? '#378ADD' : '#0077CC',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontSize: '15px',
          fontWeight: 500,
          cursor: !selectedRole || isLoading ? 'not-allowed' : 'pointer',
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
        {isLoading ? 'Saving...' : 'Continue'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
