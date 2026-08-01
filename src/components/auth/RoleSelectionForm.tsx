'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RoleCard } from '@/components/auth/RoleCard'
import type { RoleSelectionData, AuthError, AuthResponse } from '@/types/auth'

export function RoleSelectionForm() {
  const router = useRouter()
  const [submittingRole, setSubmittingRole] = useState<RoleSelectionData['role'] | null>(null)
  const [apiError, setApiError] = useState<AuthError | null>(null)

  // P-04-PREP-01: one-tap advance — tapping a role saves it immediately and
  // routes on the API's redirect. There is no separate Continue button. The
  // spinner stays on the tapped card until navigation unmounts the form; it
  // is only cleared on error so the user can tap again.
  const handleSelect = async (role: RoleSelectionData['role']) => {
    if (submittingRole) return
    setApiError(null)
    setSubmittingRole(role)
    try {
      const res = await fetch('/api/auth/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role } satisfies RoleSelectionData),
      })
      const data = (await res.json()) as AuthResponse
      if (!res.ok || !data.success) {
        setApiError(
          'error' in data
            ? data.error
            : { code: 'UNKNOWN_ERROR', message: 'Something went wrong. Please try again.' }
        )
        setSubmittingRole(null)
        return
      }
      router.push(data.redirectTo)
    } catch {
      setApiError({ code: 'NETWORK_ERROR', message: 'Connection error. Please try again.' })
      setSubmittingRole(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {apiError && (
        <div
          role="alert"
          className="rounded-lg bg-danger/10 px-3.5 py-3 text-sm text-danger"
        >
          {apiError.message}
        </div>
      )}

      <RoleCard role="parent" onSelect={handleSelect} isSubmitting={submittingRole === 'parent'} />
      <RoleCard role="player" onSelect={handleSelect} isSubmitting={submittingRole === 'player'} />
      <RoleCard role="coach" onSelect={handleSelect} isSubmitting={submittingRole === 'coach'} />

      <p className="mb-1 mt-1 text-center text-xs leading-normal text-neutral-400">
        Must be 16 or older to register as a player
      </p>
    </div>
  )
}
