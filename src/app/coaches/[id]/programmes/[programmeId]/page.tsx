import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { CalendarDays, Clock, Users, CalendarRange, ShieldCheck, Star } from 'lucide-react'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { fetchProgrammeDetail, type ProgrammeDetailView } from './_components/_data/programmeDetail'
import { SessionPicker } from './_components/SessionPicker'
import { ProgrammeSchedule } from './_components/ProgrammeSchedule'

// P-00c-D1: public programme detail page — the page a parent lands on when a
// coach shares a direct link to a group programme. Two states driven by
// payment_type: per_session (session picker + running total) and block_upfront
// (numbered schedule + single enrol CTA). Server component fetches the data;
// the interactive picker/schedule are client components. Card borders use
// Tailwind gray-200 (= #E2E8F0), matching the sibling coach profile page.

// ─── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; programmeId: string }>
}): Promise<Metadata> {
  const { id, programmeId } = await params
  const programme = await fetchProgrammeDetail(id, programmeId)
  if (!programme) return { title: 'Programme not found — Crikly' }
  return {
    title: `${programme.title} · ${programme.coach.fullName} — Crikly`,
    description: `Book ${programme.title} with ${programme.coach.fullName} on Crikly.`,
  }
}

// ─── Hero image (server) ───────────────────────────────────────────────────────

function ProgrammeHero({ imageUrl, title, sportName }: { imageUrl: string | null; title: string; sportName: string }) {
  return (
    <div
      className="relative -mx-4 sm:-mx-6 lg:mx-0 h-[240px] md:h-[320px] overflow-hidden sm:rounded-[14px]"
      data-testid="programme-hero"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${title} — ${sportName} programme image`}
          fill
          sizes="(max-width: 720px) 100vw, 720px"
          className="object-cover"
          priority
        />
      ) : (
        // Graceful fallback — brand-tinted block with the sport name centred.
        <div className="absolute inset-0 flex items-center justify-center bg-brand-50">
          <span className="text-2xl md:text-3xl font-semibold text-brand-800 tracking-tight">{sportName}</span>
        </div>
      )}
    </div>
  )
}

// ─── Coach card (server) ───────────────────────────────────────────────────────

function CoachCard({ coach }: { coach: ProgrammeDetailView['coach'] }) {
  const initials = coach.fullName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()

  return (
    <div className="bg-white border border-gray-200 rounded-[14px] p-[18px] md:p-[22px]" data-testid="coach-card">
      <div className="flex items-center gap-4">
        {/* Hand-rendered avatar — the shared Avatar `lg` token is 80px; this
            page's design calls for 52/64px, so the brand-50/brand-800 treatment
            is reproduced at the right size for visual fidelity. */}
        <div className="w-[52px] h-[52px] md:w-16 md:h-16 rounded-full bg-brand-50 flex-shrink-0 flex items-center justify-center">
          <span className="text-lg md:text-2xl font-semibold text-brand-800 tracking-tight">{initials}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-lg md:text-xl font-semibold text-gray-900 tracking-tight">{coach.fullName}</span>
            {coach.dbsVerified && (
              // DBS teal (#E6F6F8 / #0A7A86) is a known token gap — kept inline,
              // consistent with the coach profile page's DBS treatment.
              <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full bg-[#E6F6F8] text-[#0A7A86] text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                DBS verified
              </span>
            )}
          </div>
          {coach.ratingAvg !== null && coach.ratingCount > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-sm text-gray-600">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold text-gray-900">{coach.ratingAvg.toFixed(1)}</span>
              <span>
                · {coach.ratingCount} review{coach.ratingCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Programme details card (server) ───────────────────────────────────────────

function ProgrammeDetailsCard({ programme }: { programme: ProgrammeDetailView }) {
  const facts: { icon: ReactNode; label?: string; text: string }[] = [
    { icon: <CalendarDays className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" strokeWidth={1.8} />, text: programme.scheduleLabel },
  ]
  if (programme.startingLabel) {
    facts.push({
      icon: <Clock className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" strokeWidth={1.8} />,
      label: 'Starting',
      text: programme.durationLabel
        ? `${programme.startingLabel} · ${programme.durationLabel}`
        : programme.startingLabel,
    })
  }
  if (programme.ageGroups.length > 0) {
    facts.push({
      icon: <Users className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" strokeWidth={1.8} />,
      text: programme.ageGroups.join(', '),
    })
  }
  if (!programme.startingLabel && programme.durationLabel) {
    facts.push({
      icon: <CalendarRange className="w-[18px] h-[18px] text-gray-400 flex-shrink-0" strokeWidth={1.8} />,
      text: programme.durationLabel,
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-[14px] p-[18px] md:p-6" data-testid="programme-details">
      <h1 className="text-[22px] md:text-[28px] font-semibold text-gray-900 leading-tight tracking-tight text-balance">
        {programme.title}
      </h1>
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        {/* Sport chip — text-only (no emoji), per the design-system rule. */}
        <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-brand-50 text-brand-800 text-xs font-semibold">
          {programme.sportName}
        </span>
        {programme.ageGroups.map((age) => (
          <span
            key={age}
            className="inline-flex items-center h-6 px-2.5 rounded-full bg-gray-50 text-gray-700 text-xs font-semibold border border-gray-200"
          >
            {age}
          </span>
        ))}
      </div>

      <div className="h-px bg-gray-200 my-4" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {facts.map((fact, i) => (
          <div key={i} className="flex items-center gap-3">
            {fact.icon}
            <div className="text-[15px] text-gray-700">
              {fact.label && <span className="text-gray-500">{fact.label} </span>}
              {fact.text}
            </div>
          </div>
        ))}
      </div>

      <div className="h-px bg-gray-200 my-4" />

      {programme.campMode ? (
        /* BUG-23 ruling 3: camp capacity is PER SLOT — a programme-level
           "N of M left" is meaningless (current_spots stays 0). State the
           per-session capacity; the live per-slot truth is on each row. */
        <span className="text-sm font-semibold text-gray-900" data-testid="camp-spots-banner">
          {programme.maxSpots} spot{programme.maxSpots !== 1 ? 's' : ''} per session
        </span>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-900">
              {programme.spotsLeft} of {programme.maxSpots} spots left
            </span>
            {programme.scarcity && <span className="text-sm font-medium text-warning">{programme.scarcity}</span>}
          </div>
          <div className="h-[7px] rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
            {/* Runtime width — inline style is the only option for a dynamic %. */}
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${programme.fillPct}%` }} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ProgrammeDetailPage({
  params,
}: {
  params: Promise<{ id: string; programmeId: string }>
}) {
  const { id, programmeId } = await params

  const programme = await fetchProgrammeDetail(id, programmeId)
  if (!programme) notFound()

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <main className="max-w-[720px] mx-auto px-4 sm:px-6 pt-6 pb-12">
        <div className="flex flex-col gap-[18px]">
          <ProgrammeHero imageUrl={programme.imageUrl} title={programme.title} sportName={programme.sportName} />
          <CoachCard coach={programme.coach} />
          <ProgrammeDetailsCard programme={programme} />

          {programme.paymentType === 'block_upfront' ? (
            <ProgrammeSchedule
              coachId={programme.coach.id}
              programmeId={programme.id}
              schedule={programme.schedule}
              sessionCount={programme.sessionCount}
              blockTotalPence={programme.blockTotalPence}
              spanLabel={programme.spanLabel}
              scheduleLabel={programme.scheduleLabel}
            />
          ) : (
            <SessionPicker
              coachId={programme.coach.id}
              programmeId={programme.id}
              pricePerSessionPence={programme.pricePerSessionPence}
              campMode={programme.campMode}
              sessions={programme.sessions}
              campDays={programme.campDays}
            />
          )}
        </div>
      </main>

      <PublicFooter variant="links" />
    </div>
  )
}
