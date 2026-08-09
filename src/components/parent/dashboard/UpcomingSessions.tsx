'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { Calendar, Clock, MapPin } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { CriklyAvatar } from '@/components/ui/CriklyAvatar'
import type { UpcomingSessionCard } from './types'

// P-04-A (Screen 06): upcoming sessions for the active child. Compact
// single-row empty state (no large illustration); booked state renders
// session cards in a 2-col grid on desktop, stacked on mobile. Cards are
// shadow-only (no borders) apart from the 4px identity-colour left border,
// which is the child's colour — inline style, documented exception
// (see src/constants/childIdentity.ts).

interface UpcomingSessionsProps {
  sessions: UpcomingSessionCard[]
  /** Active child's first name (or the player's own name in player mode). */
  subjectName: string
  /** Identity colour for the card left border. */
  colour: string
  prefersReduced: boolean
}

export function UpcomingSessions({
  sessions,
  subjectName,
  colour,
  prefersReduced,
}: UpcomingSessionsProps) {
  const emptyIconRef = useRef<HTMLSpanElement>(null)

  // Empty-state calendar icon float loop — 3s ease-in-out, skipped
  // entirely under reduced motion.
  useGSAP(
    () => {
      if (prefersReduced || sessions.length > 0 || !emptyIconRef.current) {
        return
      }
      gsap.to(emptyIconRef.current, {
        y: -4,
        duration: 1.5,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      })
    },
    { dependencies: [sessions.length, prefersReduced] },
  )

  return (
    <section data-testid="upcoming-sessions">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-heading text-neutral-900">
          Upcoming sessions
        </h2>
        <Link
          href="/parent/bookings"
          className="text-sm font-medium text-brand-600 no-underline hover:text-brand-700"
        >
          Past bookings
        </Link>
      </div>

      {sessions.length === 0 ? (
        <div
          className="mt-4 flex items-center gap-3 rounded-lg bg-neutral-50 px-4 py-3"
          data-testid="sessions-empty-state"
        >
          <span ref={emptyIconRef} className="flex text-neutral-400">
            <Calendar size={18} />
          </span>
          <p className="text-sm text-neutral-600">
            {subjectName
              ? `${subjectName}'s next session will show up here.`
              : 'Your next session will show up here.'}{' '}
            <Link
              href="/coaches?sport=cricket&role=parent"
              className="font-medium text-brand-600 no-underline hover:text-brand-700"
            >
              Browse coaches
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} colour={colour} />
          ))}
        </div>
      )}
    </section>
  )
}

function SessionCard({
  session,
  colour,
}: {
  session: UpcomingSessionCard
  colour: string
}) {
  return (
    <article
      data-testid="session-card"
      // #FEFEFE warm off-white and the 16px radius come straight from the
      // Screen 06 spec — intentionally not the neutral/radius tokens.
      className="rounded-[16px] bg-[#FEFEFE] p-4 shadow-sm transition-all duration-normal hover:-translate-y-1 hover:shadow-md"
      style={{ borderLeft: `4px solid ${colour}` }}
    >
      <div className="flex items-center gap-3">
        <CriklyAvatar
          seed={session.coachName}
          style="personas"
          size={44}
          alt={session.coachName}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-neutral-900">
            {session.coachName}
          </p>
          <span className="inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
            {session.sportName}
          </span>
        </div>
        <span className="flex-shrink-0 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-bold text-white">
          {session.daysUntil === 0
            ? 'Today'
            : session.daysUntil === 1
              ? 'Tomorrow'
              : `In ${session.daysUntil} days`}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <p className="flex items-center gap-2 text-sm text-neutral-600">
          <Clock size={14} className="flex-shrink-0 text-neutral-400" />
          {session.dateLabel} · {session.timeLabel}
        </p>
        {session.venueName && (
          <p className="flex items-center gap-2 text-sm text-neutral-600">
            <MapPin size={14} className="flex-shrink-0 text-neutral-400" />
            {session.venueName}
          </p>
        )}
      </div>
    </article>
  )
}
