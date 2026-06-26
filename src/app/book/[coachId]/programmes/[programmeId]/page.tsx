import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { GuestEnrolmentFlow } from '@/components/booking/GuestEnrolmentFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'
import { fetchProgrammeDetail } from '@/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail'
import { displayCommissionPence } from '@/lib/booking/commission-display'

// P-00c-ENROL — guest programme-enrolment checkout page. Mirrors the 1-to-1
// /book/[coachId] page: parses the selection from query params, builds a
// BookingSummary (commission added ON TOP per BR-01 — same "Platform fee" line
// as the 1-to-1 checkout), and renders the GuestEnrolmentFlow. Server-side price
// is authoritative; the summary here is display only.
//   per_session:   ?sessions=id1,id2,id3
//   block_upfront: ?block=true

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ coachId: string; programmeId: string }>
}): Promise<Metadata> {
  const { coachId, programmeId } = await params
  const programme = await fetchProgrammeDetail(coachId, programmeId)
  if (!programme) return { title: 'Complete your enrolment · Crikly' }
  return {
    title: `Enrol — ${programme.title} · Crikly`,
    description: `Complete your enrolment in ${programme.title} with ${programme.coach.fullName}.`,
  }
}

export default async function ProgrammeEnrolmentCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string; programmeId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { coachId, programmeId } = await params
  const sp = await searchParams

  const programme = await fetchProgrammeDetail(coachId, programmeId)
  if (!programme) notFound()

  const isBlock = firstParam(sp.block) === 'true'
  const sessionsParam = firstParam(sp.sessions)

  let paymentType: 'per_session' | 'block_upfront'
  let selectedSessionIds: string[] = []
  let coachSubtotalPence: number
  let scheduleSummary: string
  let sessionsSummary: string

  if (isBlock) {
    // Block enrol — the whole programme.
    if (programme.paymentType !== 'block_upfront' || programme.blockTotalPence === null) notFound()
    paymentType = 'block_upfront'
    coachSubtotalPence = programme.blockTotalPence
    scheduleSummary = programme.spanLabel ?? programme.scheduleLabel
    sessionsSummary = `Whole programme · ${programme.sessionCount} session${programme.sessionCount !== 1 ? 's' : ''}`
  } else if (sessionsParam) {
    // Per-session enrol — only the IDs that resolve to real, current sessions.
    if (programme.paymentType !== 'per_session' || programme.pricePerSessionPence === null) notFound()
    paymentType = 'per_session'
    const requested = new Set(sessionsParam.split(',').filter(Boolean))
    // Dedupe by session-row id (camp slots share a row id — S0 decision 4).
    selectedSessionIds = [...new Set(programme.sessions.filter((s) => requested.has(s.sessionId)).map((s) => s.sessionId))]
    if (selectedSessionIds.length === 0) notFound()
    coachSubtotalPence = programme.pricePerSessionPence * selectedSessionIds.length
    scheduleSummary = programme.scheduleLabel
    sessionsSummary = `${selectedSessionIds.length} session${selectedSessionIds.length !== 1 ? 's' : ''}`
  } else {
    // No valid selection in the URL.
    notFound()
  }

  const summary: BookingSummary = {
    coachName: programme.coach.fullName,
    sportLabel: programme.sportName,
    sessionDate: programme.title,
    sessionTime: scheduleSummary,
    sessionType: sessionsSummary,
    sessionFeePence: coachSubtotalPence,
    platformFeePence: displayCommissionPence(coachSubtotalPence),
  }

  return (
    <main className="min-h-screen bg-white">
      <PublicHeader />
      <div className="mx-auto w-full max-w-6xl px-5 py-5 lg:px-10 lg:pt-6 lg:pb-14">
        <GuestEnrolmentFlow
          coachId={programme.coach.id}
          programmeId={programme.id}
          paymentType={paymentType}
          selectedSessionIds={selectedSessionIds}
          summary={summary}
        />
      </div>
      <PublicFooter variant="links" />
    </main>
  )
}
