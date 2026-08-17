import type { Metadata } from 'next'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { GuestBookingFlow, type GuestCheckoutParams } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'
import { getCommissionRate } from '@/lib/booking/commission-rate'
import { displayCommissionPence } from '@/lib/booking/commission-display'

export const metadata: Metadata = {
  title: 'Complete your booking · Crikly',
  description: 'Review your coaching session and pay securely.',
}

// ─── Types (subset of the coach API response used on this page) ─────────────────

interface ApiSport {
  sport_id: string
  sport_name: string
  session_types: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  session_duration_minutes: number
}

interface ApiCoach {
  id: string
  slug: string | null
  full_name: string
  sports: ApiSport[]
}

// Fallback coach price (pence) used only when the page is opened without a
// `price` query param and the resolved sport has no price (e.g. local UI
// preview). Real bookings always arrive with the slot params from the
// availability page or the profile booking card.
const FALLBACK_PRICE_PENCE = 4000

type CheckoutError = 'payment' | 'slot_taken' | 'slot_unavailable' | 'price_changed'

// ─── Param parsing ───────────────────────────────────────────────────────────────

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseSimulatedError(value: string | string[] | undefined): CheckoutError | undefined {
  const v = firstParam(value)
  if (v === 'payment' || v === 'slot_taken' || v === 'slot_unavailable' || v === 'price_changed') return v
  return undefined
}

function parseSessionType(value: string | string[] | undefined): 'individual' | 'group' {
  return firstParam(value) === 'group' ? 'group' : 'individual'
}

function parsePricePence(value: string | string[] | undefined, fallback: number): number {
  const raw = firstParam(value)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// UX-16: participant name from the availability page. Trimmed and length-capped
// to mirror the POST /api/guest/bookings validation (required there — an empty
// name here still renders the page; the API rejects at submit).
function parseParticipantName(value: string | string[] | undefined): string {
  return (firstParam(value) ?? '').trim().slice(0, 100)
}

// UX-16: optional age — integer 1–99 or null, mirroring the API + DB CHECK.
function parseParticipantAge(value: string | string[] | undefined): number | null {
  const raw = firstParam(value)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 99 ? parsed : null
}

// P-10 Phase 3: total player count for a guest GROUP booking (2..6 — the
// participants validator's hard cap); anything else means 1 player.
function parsePlayersCount(value: string | string[] | undefined): number {
  const raw = firstParam(value)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isInteger(parsed) && parsed >= 2 && parsed <= 6 ? parsed : 1
}

// ─── Display formatting ──────────────────────────────────────────────────────────

// Parse a YYYY-MM-DD slot date at local noon so the weekday/day never shift
// across a UTC midnight boundary (e.g. BST). Falls back when the param is
// missing/malformed — the summary's "Change date/time" link lets the guest pick.
function formatSessionDate(dateISO: string | undefined): string {
  if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return 'Date to be selected'
  const d = new Date(`${dateISO}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 'Date to be selected'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

// "14:00" → "2:00pm". Returns null for missing/malformed input.
function formatClockTime(hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  if (h > 23) return null
  const period = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]}${period}`
}

function formatSessionTime(startTime: string | undefined, durationMinutes: number): string {
  const clock = startTime ? formatClockTime(startTime) : null
  if (!clock) return 'Choose a time'
  return `${clock} · ${durationMinutes} minutes`
}

// ─── Data fetching (reuses the public coach API; no new route) ──────────────────

async function fetchCoach(id: string): Promise<ApiCoach | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${id}`, { next: { revalidate: 30 } })
  if (!res.ok) return null
  return res.json() as Promise<ApiCoach>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GuestBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ coachId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { coachId } = await params
  const sp = await searchParams

  // Render the real coach + slot the guest chose. The descriptive fields come
  // from the coach API; the MONEY field is driven by the `price` query param and
  // re-verified server-side against coach_sports in POST /api/guest/bookings
  // (anti-tampering, BR-01).
  const coach = await fetchCoach(coachId)

  const sessionType = parseSessionType(sp.sessionType)
  const sportIdParam = firstParam(sp.sportId)
  const sport =
    coach?.sports.find((s) => s.sport_id === sportIdParam) ?? coach?.sports[0] ?? null

  const durationMinutes = sport?.session_duration_minutes ?? 60
  const sportPrice =
    sessionType === 'group' ? sport?.price_group_pence : sport?.price_individual_pence
  const pricePence = parsePricePence(sp.price, sportPrice ?? FALLBACK_PRICE_PENCE)
  // BUG-70: real rate from platform_config so the displayed fee matches the
  // amount POST /api/guest/bookings will actually charge.
  const commissionRate = await getCommissionRate()
  const platformFeePence = displayCommissionPence(pricePence, commissionRate)

  const date = firstParam(sp.date)
  const startTime = firstParam(sp.startTime)

  // UX-16: who the session is for — entered on the availability page, shown on
  // the summary/confirmation, and persisted server-side at booking creation.
  const participantName = parseParticipantName(sp.participant)
  const participantAge = parseParticipantAge(sp.age)

  // P-10 Phase 3: extra group players ride numbered params from the
  // availability page (participant2/age2…). Only meaningful for a group
  // booking; the guest API re-validates names/count at submit.
  const playersCount = sessionType === 'group' ? parsePlayersCount(sp.players) : 1
  const extraPlayers = Array.from({ length: Math.max(0, playersCount - 1) }, (_, i) => ({
    name: parseParticipantName(sp[`participant${i + 2}`]),
    age: parseParticipantAge(sp[`age${i + 2}`]),
  }))

  const summary: BookingSummary = {
    coachName: coach?.full_name ?? 'Your coach',
    sportLabel: sport?.sport_name ?? 'Coaching',
    sessionDate: formatSessionDate(date),
    sessionTime: formatSessionTime(startTime, durationMinutes),
    sessionType:
      sessionType === 'group'
        ? `Group session · ${playersCount} players`
        : '1-to-1 session',
    participant: participantName
      ? participantAge !== null
        ? `${participantName} (age ${participantAge})`
        : participantName
      : undefined,
    sessionFeePence: pricePence,
    platformFeePence,
  }

  const checkout: GuestCheckoutParams = {
    coachId,
    sportId: sport?.sport_id ?? sportIdParam ?? '',
    sessionType,
    date: date ?? '',
    startTime: startTime ?? '',
    pricePence,
    participantName,
    participantAge,
    extraPlayers,
  }

  return (
    <main className="min-h-screen bg-white">
      <PublicHeader />
      <div className="mx-auto w-full max-w-6xl px-5 py-5 lg:px-10 lg:pt-6 lg:pb-14">
        <GuestBookingFlow
          coachId={coachId}
          coachSlug={coach?.slug ?? undefined}
          summary={summary}
          checkout={checkout}
          initialError={parseSimulatedError(firstParam(sp.simulateError))}
        />
      </div>
      <PublicFooter variant="links" />
    </main>
  )
}
