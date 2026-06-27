import type { Metadata } from 'next'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { GuestBookingFlow, type GuestCheckoutParams } from '@/components/booking/GuestBookingFlow'
import type { BookingSummary } from '@/components/booking/BookingSummaryCard'

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

// TODO(P-00c-COMMISSION-DISPLAY): fetch the rate from platform_config so the
// displayed fee matches the charged amount. Today this is BR-02's default for
// DISPLAY ONLY — the server re-reads platform_config and is authoritative, so an
// admin changing the rate would make this label diverge from the real charge.
const COMMISSION_RATE = 0.1

type CheckoutError = 'payment' | 'slot_taken'

// ─── Param parsing ───────────────────────────────────────────────────────────────

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseSimulatedError(value: string | string[] | undefined): CheckoutError | undefined {
  const v = firstParam(value)
  if (v === 'payment' || v === 'slot_taken') return v
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
  const platformFeePence = Math.round(pricePence * COMMISSION_RATE)

  const date = firstParam(sp.date)
  const startTime = firstParam(sp.startTime)

  const summary: BookingSummary = {
    coachName: coach?.full_name ?? 'Your coach',
    sportLabel: sport?.sport_name ?? 'Coaching',
    sessionDate: formatSessionDate(date),
    sessionTime: formatSessionTime(startTime, durationMinutes),
    sessionType: sessionType === 'group' ? 'Group session' : '1-to-1 session',
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
