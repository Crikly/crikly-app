'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Calendar, Pencil, Shield } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { ChildCardData } from './types'

// P-07 (Screen 07): the child profile player card. Header strip in the
// child's identity colour, avatar overlapping into the content, then skill
// track / coaching history / safety note / passport tiles and the next
// session row. GSAP choreo from the design note: header sweeps in from the
// left 300ms, avatar drops with a slight bounce, sections fade up
// staggered — all skipped under reduced motion. Avatar tap-to-change and
// photo upload are out of scope for v1 (Step 0 decision B); the passport
// tile is COMING SOON (P-17).
//
// Identity-colour styling is inline by the documented childIdentity
// exception (dynamic per-child hex, not a Tailwind token).

const SKILL_STOPS = ['beginner', 'intermediate', 'advanced'] as const

function skillLabel(skill: string): string {
  return skill.charAt(0).toUpperCase() + skill.slice(1)
}

interface ChildProfileCardProps {
  child: ChildCardData
}

export function ChildProfileCard({ child }: ChildProfileCardProps) {
  const prefersReduced = usePrefersReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (prefersReduced || !rootRef.current) return
      // clearProps must list ONLY the tweened properties. 'all' wipes the
      // whole inline style attribute on completion — which deleted the
      // React-set identity-colour background off the hero (transparent
      // banner, white-on-white text/back link).
      gsap.from('[data-child-hero]', {
        xPercent: -100,
        duration: 0.3,
        ease: 'power2.out',
        clearProps: 'transform',
      })
      gsap.from('[data-child-avatar]', {
        y: -24,
        opacity: 0,
        duration: 0.45,
        delay: 0.15,
        ease: 'back.out(1.6)',
        clearProps: 'transform,opacity',
      })
      gsap.from('[data-child-section]', {
        y: 24,
        opacity: 0,
        duration: 0.45,
        stagger: 0.1,
        delay: 0.2,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      })
    },
    { scope: rootRef },
  )

  const subline = [`Age ${child.age}`, child.sportName].filter(Boolean).join(' · ')

  return (
    <div ref={rootRef} className="overflow-x-clip pb-16">
      {/* Header strip — identity colour, sweeps in from the left. */}
      <div
        data-child-hero
        className="px-4 pb-10 pt-6 md:px-8"
        style={{ backgroundColor: child.colour }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href="/parent/dashboard"
            data-testid="child-card-back"
            className="flex min-h-[44px] items-center gap-2 text-base font-medium text-white/85 no-underline hover:text-white"
          >
            <ArrowLeft size={16} aria-hidden />
            Dashboard
          </Link>
          <Link
            href={`/parent/children/${child.id}/edit`}
            aria-label={`Edit ${child.firstName}'s profile`}
            data-testid="child-card-edit"
            className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/15 text-white no-underline transition-colors hover:bg-white/25"
          >
            <Pencil size={18} aria-hidden />
          </Link>
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <h1 className="text-[28px] font-bold tracking-tight text-white md:text-[44px]">
            {child.firstName}
          </h1>
          <p className="mt-1 text-base text-white/80">{subline}</p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 md:px-8">
        {/* Avatar overlaps the header strip. */}
        <div data-child-avatar className="-mt-10 inline-block rounded-full bg-white">
          <CriklyAvatar
            seed={child.firstName}
            style="adventurer"
            size={80}
            ringColor={child.colour}
            ringWidth={4}
            alt={`${child.firstName}'s avatar`}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Skill level */}
          <div data-child-section className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="tracking-label text-xs font-semibold uppercase text-neutral-400">
              Skill level
            </h2>
            {child.sportName && child.skillLevel ? (
              <>
                <div className="mt-6 flex items-center px-1" aria-hidden>
                  {SKILL_STOPS.map((stop, index) => {
                    const active = child.skillLevel === stop
                    return (
                      <span key={stop} className="contents">
                        {index > 0 && <span className="h-0.5 flex-1 bg-neutral-100" />}
                        {active ? (
                          // Identity colour — the documented dynamic-hex
                          // inline-style exception (childIdentity.ts).
                          <span
                            className="h-[18px] w-[18px] rounded-full"
                            style={{
                              backgroundColor: child.colour,
                              boxShadow: `0 0 0 5px ${child.colour}2E`,
                            }}
                          />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-neutral-100 bg-white" />
                        )}
                      </span>
                    )
                  })}
                </div>
                <div className="mt-3 flex justify-between">
                  {SKILL_STOPS.map((stop) => (
                    <span
                      key={stop}
                      className={
                        child.skillLevel === stop
                          ? 'text-sm font-bold'
                          : 'text-sm text-neutral-400'
                      }
                      style={child.skillLevel === stop ? { color: child.colour } : undefined}
                    >
                      {skillLabel(stop)}
                    </span>
                  ))}
                </div>
                <p className="sr-only">{`Skill level: ${skillLabel(child.skillLevel)}`}</p>
              </>
            ) : (
              <p className="mt-4 text-base text-neutral-600">
                No sport yet.{' '}
                <Link
                  href={`/parent/children/${child.id}/edit`}
                  className="font-medium text-brand-600 no-underline hover:text-brand-800"
                >
                  Add one
                </Link>
              </p>
            )}
          </div>

          {/* Coaching history */}
          <div data-child-section className="rounded-lg bg-white p-5 shadow-sm">
            <h2 className="tracking-label text-xs font-semibold uppercase text-neutral-400">
              Coaching history
            </h2>
            <p
              className="mt-2 text-[44px] font-bold leading-tight tracking-tight"
              style={{ color: child.colour }}
              data-testid="sessions-completed"
            >
              {child.sessionsCompleted}
            </p>
            <p className="text-base text-neutral-600">
              {child.sessionsCompleted === 1 ? 'session' : 'sessions'} completed with Crikly
            </p>
          </div>

          {/* Safety note + passport tiles */}
          <div className="flex flex-col gap-4">
            <Link
              data-child-section
              href={`/parent/children/${child.id}/edit`}
              data-testid="safety-note-tile"
              className="flex flex-1 items-center gap-3 rounded-lg bg-white p-5 no-underline shadow-sm transition-shadow hover:shadow-md"
            >
              <Shield size={18} className="shrink-0 text-neutral-400" aria-hidden />
              <span className="text-base text-neutral-600">
                {child.medicalNotes ?? 'Add a safety note for coaches (optional)'}
              </span>
            </Link>
            <div
              data-child-section
              className="flex flex-1 items-center gap-3 rounded-lg bg-neutral-50 p-5 opacity-70"
            >
              <BookOpen size={18} className="shrink-0 text-neutral-400" aria-hidden />
              <span className="text-base font-medium text-neutral-600">Training Passport</span>
              <span className="ml-auto rounded-sm bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-600">
                COMING SOON
              </span>
            </div>
          </div>
        </div>

        {/* Next session */}
        <div data-child-section className="mt-8 flex flex-col gap-3">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            {child.firstName}&apos;s next session
          </h2>
          <div
            data-testid="next-session-row"
            className="flex max-w-xl flex-wrap items-center gap-3 rounded-lg bg-white px-5 py-4 shadow-sm"
          >
            <Calendar size={16} style={{ color: child.colour }} aria-hidden />
            {child.nextSession ? (
              <span className="text-base text-neutral-900">
                {child.nextSession.dateLabel} · {child.nextSession.timeLabel} with{' '}
                {child.nextSession.coachName}
              </span>
            ) : (
              <>
                <span className="text-base text-neutral-600">No sessions yet</span>
                <Link
                  href={`/coaches?sport=${child.sportSlug ?? 'cricket'}&role=parent`}
                  data-testid="find-coach-link"
                  className="text-base font-medium text-brand-600 no-underline hover:text-brand-800"
                >
                  Find a coach for {child.firstName}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ChildProfileCardSkeleton() {
  return (
    <div className="animate-pulse pb-16">
      <div className="h-40 bg-neutral-100" />
      <div className="mx-auto max-w-3xl px-4 md:px-8">
        <div className="-mt-10 h-[80px] w-[80px] rounded-full bg-neutral-100" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-36 rounded-lg bg-neutral-100" />
          <div className="h-36 rounded-lg bg-neutral-100" />
          <div className="h-36 rounded-lg bg-neutral-100" />
        </div>
        <div className="mt-8 h-14 max-w-xl rounded-lg bg-neutral-100" />
      </div>
    </div>
  )
}
