'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ClipboardCheck, User, Users } from 'lucide-react'

// PUB-03: pre-auth role chooser — 3-column grid. Coach card navigates to
// /login. Parent + player cards fire a "booking opens soon" toast on
// click and briefly highlight the clicked card (1s) before resetting.

// ─── Constants ───────────────────────────────────────────────────────────────

const TOAST_MS = 2600
const HIGHLIGHT_MS = 1000
const TOAST_MSG = "Booking opens soon — we'll let you know!"

// ─── Toast hook ──────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((msg: string) => {
    setMessage(msg)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMessage(null), TOAST_MS)
  }, [])
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )
  return { message, show }
}

// ─── Page body ───────────────────────────────────────────────────────────────

type Highlighted = 'parent' | 'player' | null

export function JoinPageClient() {
  const [highlighted, setHighlighted] = useState<Highlighted>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { message: toastMessage, show: showToast } = useToast()

  const handleNonCoachClick = (role: 'parent' | 'player') => {
    setHighlighted(role)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => setHighlighted(null), HIGHLIGHT_MS)
    showToast(TOAST_MSG)
  }

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    },
    [],
  )

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-[960px] flex-col justify-center px-6 py-10">
        {/* Logo — centered, links to / */}
        <Link
          href="/"
          aria-label="Crikly home"
          className="mb-10 flex justify-center no-underline"
        >
          <Image
            src="/logo.png"
            alt="Crikly"
            width={120}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </Link>

        {/* Header copy */}
        <h1 className="mb-2 text-center text-[clamp(28px,3vw,32px)] font-semibold tracking-tight text-gray-900">
          Which best describes you?
        </h1>
        <p className="mb-10 text-center text-base text-neutral-600 max-md:mb-8">
          Great coaching, one tap away.
        </p>

        {/* 3-col grid */}
        <div className="grid grid-cols-3 gap-5 max-md:grid-cols-1 max-md:gap-3">
          <CoachCard />
          <ToastingRoleCard
            role="parent"
            title="Parent"
            description="Book sessions for my child"
            icon={<Users size={32} strokeWidth={1.6} />}
            highlighted={highlighted === 'parent'}
            onClick={() => handleNonCoachClick('parent')}
          />
          <ToastingRoleCard
            role="player"
            title="Player"
            description="Book coaching for myself (16+)"
            icon={<User size={32} strokeWidth={1.6} />}
            highlighted={highlighted === 'player'}
            onClick={() => handleNonCoachClick('player')}
          />
        </div>

        {/* Footer link */}
        <p className="mt-10 text-center text-sm text-neutral-600 max-md:mt-8">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-brand-600 no-underline">
            Log in
          </Link>
        </p>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 rounded-full bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          {toastMessage}
        </div>
      )}
    </main>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CoachCard() {
  return (
    <Link
      href="/login"
      data-testid="join-card-coach"
      className="group flex flex-col items-center justify-between rounded-2xl border border-neutral-100 bg-white p-8 text-center no-underline transition-all hover:-translate-y-[2px] hover:border-neutral-200"
    >
      <div>
        <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <ClipboardCheck size={32} strokeWidth={1.6} />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Coach</h2>
        <p className="mx-auto mb-6 max-w-[20ch] text-sm text-neutral-600">
          Offer sessions and get paid reliably
        </p>
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 transition-all group-hover:border-brand-600 group-hover:text-brand-600">
        <ArrowRight size={18} strokeWidth={2} />
      </span>
    </Link>
  )
}

interface ToastingRoleCardProps {
  role: 'parent' | 'player'
  title: string
  description: string
  icon: React.ReactNode
  highlighted: boolean
  onClick: () => void
}

function ToastingRoleCard({
  role,
  title,
  description,
  icon,
  highlighted,
  onClick,
}: ToastingRoleCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`join-card-${role}`}
      className={`group flex flex-col items-center justify-between rounded-2xl border bg-white p-8 text-center transition-all hover:-translate-y-[2px] ${
        highlighted ? 'border-brand-600' : 'border-neutral-100 hover:border-neutral-200'
      }`}
    >
      <div>
        <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-50 text-brand-600">
          {icon}
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">{title}</h2>
        <p className="mx-auto mb-6 max-w-[20ch] text-sm text-neutral-600">
          {description}
        </p>
      </div>
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
          highlighted
            ? 'border-brand-600 text-brand-600'
            : 'border-neutral-200 text-neutral-400 group-hover:border-brand-600 group-hover:text-brand-600'
        }`}
      >
        <ArrowRight size={18} strokeWidth={2} />
      </span>
    </button>
  )
}
