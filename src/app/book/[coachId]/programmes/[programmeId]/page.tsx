import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { GuestEnrolmentFlow } from '@/components/booking/GuestEnrolmentFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'
import { fetchProgrammeDetail } from '@/app/coaches/[id]/programmes/[programmeId]/_components/_data/programmeDetail'
import { displayCommissionPence } from '@/lib/booking/commission-display'
import { parseSelectionList, encodeSelection } from '@/lib/booking/slot-selection'

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
    // Block enrol — the whole programme. BUG-23 (approved ruling): camps are
    // per_session only, so a block checkout for a camp is never a valid URL.
    if (programme.campMode) notFound()
    if (programme.paymentType !== 'block_upfront' || programme.blockTotalPence === null) notFound()
    paymentType = 'block_upfront'
    coachSubtotalPence = programme.blockTotalPence
    scheduleSummary = programme.spanLabel ?? programme.scheduleLabel
    sessionsSummary = `Whole programme · ${programme.sessionCount} session${programme.sessionCount !== 1 ? 's' : ''}`
  } else if (sessionsParam) {
    // Per-session enrol — BUG-23: entries are (sessionId, slotIndex) pairs
    // ("uuid" = slot 0, "uuid.N" = camp block N). Each pair prices at the
    // per-session rate — a full camp day (both slots) is 2×. Display only:
    // the API re-derives the authoritative amount from DB rows.
    if (programme.paymentType !== 'per_session' || programme.pricePerSessionPence === null) notFound()
    paymentType = 'per_session'
    const parsed = parseSelectionList(sessionsParam.split(',').filter(Boolean))
    if (!parsed || parsed.length === 0) notFound()

    // Validate each pair against the programme's real sessions. programmeDetail
    // flattens camp slots into one SessionView per block, so the number of
    // views sharing a sessionId IS that session's block count.
    const blockCountBySession = new Map<string, number>()
    for (const s of programme.sessions) {
      blockCountBySession.set(s.sessionId, (blockCountBySession.get(s.sessionId) ?? 0) + 1)
    }
    const valid = parsed.filter(
      (sel) => sel.slotIndex < (blockCountBySession.get(sel.sessionId) ?? 0),
    )
    if (valid.length !== parsed.length || valid.length === 0) notFound()

    selectedSessionIds = valid.map(encodeSelection)
    coachSubtotalPence = programme.pricePerSessionPence * valid.length
    scheduleSummary = programme.scheduleLabel
    sessionsSummary = `${valid.length} session${valid.length !== 1 ? 's' : ''}`
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
