'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ClipboardCheck, Mail, User, Users } from 'lucide-react'

// PUB-03: pre-auth role chooser — client UI for the three role cards.
// Parent + player aren't yet bookable — clicking expands the card with a
// "Coming soon" line and an email collector that fires a toast on submit.
// Coach goes straight to /login. Parent server-component reads ?role=
// and seeds initialExpanded so the matching card opens without a flash.

// ─── Toast hook ──────────────────────────────────────────────────────────────

const TOAST_MS = 2600
const SHARED_TOAST = "Thanks — we'll let you know when booking opens!"

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

type Expanded = 'parent' | 'player' | null

export function JoinPageClient({ initialExpanded }: { initialExpanded: Expanded }) {
  const [expanded, setExpanded] = useState<Expanded>(initialExpanded)
  const [parentEmail, setParentEmail] = useState('')
  const [playerEmail, setPlayerEmail] = useState('')
  const { message: toastMessage, show: showToast } = useToast()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    showToast(SHARED_TOAST)
  }

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-6 py-10">
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
        <h1 className="mb-2 text-center text-[clamp(24px,3vw,28px)] font-semibold tracking-tight text-gray-900">
          Which best describes you?
        </h1>
        <p className="mb-8 text-center text-base text-neutral-600">
          Great coaching, one tap away.
        </p>

        {/* Card stack */}
        <div className="flex flex-col gap-3">
          <ExpandableRoleCard
            role="parent"
            title="I'm a parent"
            description="Book sessions for my child"
            icon={<Users size={22} strokeWidth={1.8} />}
            expanded={expanded === 'parent'}
            email={parentEmail}
            onEmailChange={setParentEmail}
            onClick={() => setExpanded((cur) => (cur === 'parent' ? null : 'parent'))}
            onSubmit={handleSubmit}
          />
          <ExpandableRoleCard
            role="player"
            title="I'm a player"
            description="Book coaching for myself (16+)"
            icon={<User size={22} strokeWidth={1.8} />}
            expanded={expanded === 'player'}
            email={playerEmail}
            onEmailChange={setPlayerEmail}
            onClick={() => setExpanded((cur) => (cur === 'player' ? null : 'player'))}
            onSubmit={handleSubmit}
          />
          <CoachLinkCard />
        </div>

        {/* Footer link */}
        <p className="mt-8 text-center text-sm text-neutral-600">
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

interface ExpandableRoleCardProps {
  role: 'parent' | 'player'
  title: string
  description: string
  icon: React.ReactNode
  expanded: boolean
  email: string
  onEmailChange: (v: string) => void
  onClick: () => void
  onSubmit: (e: React.FormEvent) => void
}

function ExpandableRoleCard({
  role,
  title,
  description,
  icon,
  expanded,
  email,
  onEmailChange,
  onClick,
  onSubmit,
}: ExpandableRoleCardProps) {
  return (
    <div
      data-testid={`join-card-${role}`}
      className={`overflow-hidden rounded-2xl border transition-all ${
        expanded
          ? 'border-brand-600 bg-brand-50/30'
          : 'border-neutral-100 bg-white hover:-translate-y-[1px] hover:border-neutral-200'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        aria-controls={`join-card-${role}-panel`}
        className="flex w-full items-center gap-3.5 p-4 text-left"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-semibold leading-tight text-gray-900">{title}</p>
          <p className="mt-0.5 text-[13px] text-neutral-600">{description}</p>
        </div>
        <ArrowRight
          size={16}
          strokeWidth={2.2}
          className={`shrink-0 text-neutral-400 transition-transform ${
            expanded ? 'rotate-90 text-brand-600' : ''
          }`}
        />
      </button>

      {/* Panel always rendered so aria-controls always resolves to a DOM
          node. `hidden` collapses both layout and accessibility tree when
          the card isn't selected. */}
      <form
        id={`join-card-${role}-panel`}
        onSubmit={onSubmit}
        hidden={!expanded}
        className="border-t border-brand-100 px-4 py-4"
      >
        <p className="mb-3 text-[13px] leading-relaxed text-neutral-600">
          Booking opens soon — leave your email and we&apos;ll be in touch the moment it
          goes live.
        </p>
        <div className="flex items-stretch gap-2 max-[420px]:flex-col">
          <label htmlFor={`join-email-${role}`} className="sr-only">
            Email address
          </label>
          <div className="flex flex-1 items-center gap-2 rounded-[10px] border border-neutral-100 bg-white px-3">
            <Mail size={16} className="shrink-0 text-neutral-400" />
            <input
              id={`join-email-${role}`}
              type="email"
              required
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="h-11 w-full min-w-0 border-0 bg-transparent p-0 text-[14px] text-gray-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border-0 bg-brand-600 px-5 text-[14px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
          >
            Notify me
          </button>
        </div>
      </form>
    </div>
  )
}

function CoachLinkCard() {
  return (
    <Link
      href="/login"
      data-testid="join-card-coach"
      className="flex items-center gap-3.5 rounded-2xl border border-neutral-100 bg-white p-4 no-underline transition-all hover:-translate-y-[1px] hover:border-neutral-200"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
        <ClipboardCheck size={22} strokeWidth={1.8} />
      </div>
      <div className="flex-1">
        <p className="text-[15px] font-semibold leading-tight text-gray-900">I&apos;m a coach</p>
        <p className="mt-0.5 text-[13px] text-neutral-600">
          Offer sessions and get paid reliably
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-brand-600">
        Log in
        <ArrowRight size={16} strokeWidth={2.2} />
      </span>
    </Link>
  )
}
