'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { RoleCard } from '@/components/auth/RoleCard'
import type { RoleSelectionData, AuthError, AuthResponse } from '@/types/auth'
import type { RoleParam } from '@/lib/auth/role-param'

interface RoleSelectionFormProps {
  /** P-04-B: allow-list-validated ?role= — auto-submitted on mount when set. */
  preselectedRole?: RoleParam | null
}

export function RoleSelectionForm({
  preselectedRole = null,
}: RoleSelectionFormProps = {}) {
  const router = useRouter()
  // P-04-B: with a validated pre-selected role the form mounts already in
  // the submitting state (spinner instead of cards) — seeding state from
  // the prop avoids a synchronous setState inside the effect below.
  const [submittingRole, setSubmittingRole] = useState<RoleSelectionData['role'] | null>(
    preselectedRole,
  )
  const [apiError, setApiError] = useState<AuthError | null>(null)
  const autoSubmitStarted = useRef(false)

  // Shared submit path for both the tapped card and the auto-submit. All
  // state updates happen after the awaited fetch resolves.
  const submitRole = async (role: RoleSelectionData['role']) => {
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

  // P-04-PREP-01: one-tap advance — tapping a role saves it immediately and
  // routes on the API's redirect. There is no separate Continue button. The
  // spinner stays on the tapped card until navigation unmounts the form; it
  // is only cleared on error so the user can tap again.
  const handleSelect = (role: RoleSelectionData['role']) => {
    if (submittingRole) return
    setApiError(null)
    setSubmittingRole(role)
    void submitRole(role)
  }

  // P-04-B auto-submit: reuses POST /api/auth/roles unchanged (allow-list,
  // auth checks, user_roles upsert, coach-profile creation all keep their
  // single home). On API failure submittingRole clears and the normal
  // cards render as the fallback.
  useEffect(() => {
    if (!preselectedRole || autoSubmitStarted.current) return
    autoSubmitStarted.current = true
    void submitRole(preselectedRole)
    // submitRole is stable for the life of the mount; this effect must run
    // exactly once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedRole])

  // P-04-B: while the pre-selected role is being applied, the picker UI is
  // skipped entirely — the user sees a brief setting-up state instead.
  if (preselectedRole && submittingRole === preselectedRole && !apiError) {
    return (
      <div
        className="flex flex-col items-center gap-3 py-10"
        data-testid="role-autosubmit-loading"
      >
        <Loader2 size={22} className="animate-spin text-brand-600" />
        <p className="text-sm text-neutral-600">Setting up your account…</p>
      </div>
    )
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
