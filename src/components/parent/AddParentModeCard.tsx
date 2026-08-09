'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

// P-04-C (Screen 05): one-screen add-parent onboarding for existing coaches.
// Centred 480px white card — icon, promise copy, name field pre-filled from
// the coach's account, single CTA. On submit: persist an edited name, then
// POST /api/auth/roles (role=parent — the full setup flow owns the user_roles
// upsert) and land on the parent dashboard. The POST's redirectTo
// (/onboarding/terms) is deliberately ignored: this user has already
// accepted terms.

interface AddParentModeCardProps {
  initialName: string
}

export function AddParentModeCard({ initialName }: AddParentModeCardProps) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const prefersReduced = usePrefersReducedMotion()

  useGSAP(
    () => {
      if (prefersReduced || !cardRef.current) return
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' },
      )
    },
    { dependencies: [prefersReduced], scope: cardRef },
  )

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const trimmed = name.trim()

      // Persist an edited name — "Your name" here is the account name
      // (user_profiles.full_name); the coaching display_name is untouched.
      if (trimmed && trimmed !== initialName.trim()) {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          const { error: nameError } = await supabase
            .from('user_profiles')
            .update({
              full_name: trimmed,
              updated_at: new Date().toISOString(),
            })
            .eq('auth_user_id', user.id)
          if (nameError) {
            setError('Could not save your name. Please try again.')
            return
          }
        }
      }

      const res = await fetch('/api/auth/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'parent' }),
      })
      const data = (await res.json()) as {
        success: boolean
        error?: { message?: string }
      }
      if (!res.ok || !data.success) {
        setError(
          data.error?.message ?? 'Could not add parent mode. Please try again.',
        )
        return
      }

      router.push('/parent/dashboard')
      router.refresh()
    } catch {
      setError('Could not add parent mode. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={cardRef}
      data-testid="add-parent-card"
      className="w-full max-w-[480px] rounded-lg bg-white p-6 text-center shadow-[0_12px_32px_rgba(15,23,42,0.12)] sm:p-9"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-50">
        <Users size={22} aria-hidden className="text-brand-600" />
      </span>

      <h2 className="mt-[18px] text-2xl font-bold tracking-tight text-neutral-900">
        Book coaching for your child
      </h2>
      <p className="mt-2.5 text-base leading-relaxed text-neutral-600">
        Use your existing Crikly account. Your coaching profile stays
        completely separate.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="mt-6 text-left">
          <label
            htmlFor="add-parent-name"
            className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            Your name
          </label>
          <input
            id="add-parent-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className="h-12 w-full rounded-md border border-neutral-100 bg-slate-50 px-3.5 text-base text-neutral-900 transition-colors focus:border-brand-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,119,204,0.18)] focus:outline-none sm:h-11"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 h-12 w-full rounded-md bg-brand-600 text-base font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:opacity-40"
        >
          {submitting ? 'Adding parent account…' : 'Add parent account'}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </form>

      <p className="mt-4 text-sm text-neutral-400">
        Switch roles anytime from the top of any screen.
      </p>
    </div>
  )
}
