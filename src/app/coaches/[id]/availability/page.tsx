import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, MapPin, Star, ShieldCheck } from 'lucide-react'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { PublicFooter } from '@/components/public/PublicFooter'
import { AvailabilityClient, type BookedSlot } from './_components/AvailabilityClient'
import { fetchProgrammeSchedule } from './_components/_data/programmeSchedule'
import type { SlotTemplate } from './_components/_data/slots'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { toGroupPriceTiers } from '@/lib/coach/group-pricing'
import { loadChildSelectorOptions } from '@/lib/children/load-child-selector-options'
import type { AuthedBookingContext } from '@/components/booking/AuthedPlayerPicker'

// ─── Types (subset of the coach API response used on this page) ────────────────

interface ApiSport {
  // P-10 single-flow: sport_id / session_types / max_group_size feed the
  // authed booking context; the API has always returned them.
  sport_id: string
  sport_name: string
  session_types: string[]
  price_individual_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
}

interface ApiCoach {
  id: string
  full_name: string
  location_city: string | null
  location_postcode: string | null
  rating_avg: number | null
  rating_count: number
  dbs_status: string
  min_advance_hours: number
  max_advance_days: number
  cancellation_window_hours: number
  sports: ApiSport[]
}

interface ApiAvailability {
  availability: SlotTemplate[]
  blocked_dates: string[]
  // BUG-14: live bookings as busy intervals (pending_payment / confirmed /
  // completed — migration 034's slot-holding predicate), so booked slots stop
  // rendering as bookable.
  booked_slots: BookedSlot[]
  booking_policy: {
    cancellation_window_hours: number
    min_advance_hours: number
    max_advance_days: number
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

function getMinIndividualPrice(sports: ApiSport[]): number | null {
  const prices = sports
    .map(s => s.price_individual_pence)
    .filter((v): v is number => v !== null)
  return prices.length > 0 ? Math.min(...prices) : null
}

// ─── Data fetching (reuses the profile page's HTTP patterns; routes unchanged) ──

async function fetchCoach(id: string): Promise<ApiCoach | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${id}`, { next: { revalidate: 30 } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch coach: ${res.status}`)
  return res.json() as Promise<ApiCoach>
}

async function fetchAvailability(id: string): Promise<ApiAvailability | null> {
  if (!UUID_RE.test(id)) return null
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${id}/availability`, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json() as Promise<ApiAvailability>
}

// P-10 single-flow: the authed booking context for a signed-in PARENT, or
// null for everyone else (anonymous, coach-only, player-only) — null renders
// the exact guest experience. Children are assembled server-side only (COPPA);
// group_price_tiers is the one field the public coach API omits, read under
// coach_sports' public-live-coach SELECT policy (RLS respected — no admin
// client). The panel needs no commission rate: it shows the coach fee only
// (approved decision 1) and checkout itemises the platform fee server-side.
async function loadAuthedBooking(coach: ApiCoach): Promise<AuthedBookingContext | null> {
  const childrenList = await loadChildSelectorOptions()
  if (childrenList === null) return null

  // BUG-51: sports are name-sorted by the coach API, so [0] is deterministic
  // — the same "first sport" the rest of this page prices from.
  const sport = coach.sports[0]
  if (!sport) return null

  // Never silent (docs/08) but never fatal either: any failure here degrades
  // to "no group pricing" with a server-side log — a thrown query must not
  // 500 the whole page for a signed-in parent on this live surface.
  let tiersJson: Json | null = null
  try {
    const supabase = await createClient()
    const result = await supabase
      .from('coach_sports')
      .select('group_price_tiers')
      .eq('coach_profile_id', coach.id)
      .eq('sport_id', sport.sport_id)
      .eq('is_active', true)
      .maybeSingle()
    if (result.error) {
      console.error('[loadAuthedBooking] group_price_tiers lookup failed:', result.error)
    } else {
      tiersJson = result.data?.group_price_tiers ?? null
    }
  } catch (error) {
    console.error('[loadAuthedBooking] group_price_tiers lookup threw:', error)
  }

  return {
    childrenList,
    sessionTypes: sport.session_types ?? [],
    maxGroupSize: sport.max_group_size,
    groupPriceTiers: toGroupPriceTiers(tiersJson),
  }
}

// ─── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const coach = await fetchCoach(id)
  if (!coach) return { title: 'Coach not found — Crikly' }
  return {
    title: `Book ${coach.full_name} · Availability — Crikly`,
    description: `See ${coach.full_name}'s availability and book a session on Crikly.`,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CoachAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const coach = await fetchCoach(id)
  if (!coach) notFound()

  const [avail, programmeSchedule, authedBooking] = await Promise.all([
    fetchAvailability(coach.id),
    fetchProgrammeSchedule(coach.id),
    // P-10 single-flow: null for guests → byte-identical guest behaviour.
    loadAuthedBooking(coach),
  ])

  // BUG-51: sports are name-sorted by the coach API, so [0] is deterministic.
  // Its duration is only the FALLBACK stride — each template now carries its
  // own sport's session_duration_minutes from the availability API.
  const sport = coach.sports[0] ?? null
  const minPrice = getMinIndividualPrice(coach.sports)
  const firstName = coach.full_name.split(' ')[0]
  const locationLabel = coach.location_city || coach.location_postcode

  // booking_policy is the source of truth; fall back to the coach row if the
  // availability endpoint returned nothing (non-UUID id, or coach not live).
  const policy = avail?.booking_policy ?? {
    min_advance_hours: coach.min_advance_hours,
    max_advance_days: coach.max_advance_days,
    cancellation_window_hours: coach.cancellation_window_hours,
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-32 lg:pb-16 pt-5 lg:pt-7">
        {/* Back link */}
        <Link
          href={`/coaches/${coach.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 mb-5 transition-colors"
          data-testid="back-to-profile"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to {firstName}&apos;s profile
        </Link>

        {/* Coach summary row */}
        <div className="flex items-center gap-4 pb-6 mb-7 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            {/* DM Sans semibold (design system) — design mock used Fraunces. */}
            <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-gray-900 leading-tight">
              {coach.full_name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-sm text-gray-600">
              {sport && (
                <>
                  <span className="font-medium text-gray-900">{sport.sport_name}</span>
                  {(locationLabel || (coach.rating_avg !== null && coach.rating_count > 0) || coach.dbs_status === 'verified') && (
                    <span className="text-gray-300">·</span>
                  )}
                </>
              )}
              {locationLabel && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-400" />
                  {locationLabel}
                </span>
              )}
              {coach.rating_avg !== null && coach.rating_count > 0 && (
                <>
                  {locationLabel && <span className="text-gray-300">·</span>}
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold text-gray-900">{coach.rating_avg.toFixed(1)}</span>
                    <span className="text-gray-400">({coach.rating_count})</span>
                  </span>
                </>
              )}
              {coach.dbs_status === 'verified' && (
                <>
                  <span className="text-gray-300 hidden sm:inline">·</span>
                  <span className="hidden sm:flex items-center gap-1 font-semibold text-teal-800">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    DBS verified
                  </span>
                </>
              )}
            </div>
          </div>
          {minPrice !== null && (
            <div className="text-right flex-shrink-0 hidden sm:block">
              {/* UX-13: "From" signals minPrice is the lowest available rate, not a flat fee */}
              <p className="text-2xl font-bold text-gray-900 leading-none">
                <span className="text-xs font-medium text-gray-500">From </span>
                {formatPence(minPrice)}
              </p>
              <p className="text-xs text-gray-500 mt-1">per session · 1-to-1</p>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Choose a date &amp; time</h2>
          <p className="text-sm text-gray-500 mt-1">
            Pick a slot that suits you — you can change it before you pay.
          </p>
        </div>

        <AvailabilityClient
          coachId={coach.id}
          pricePence={minPrice}
          sessionDurationMinutes={sport?.session_duration_minutes ?? 60}
          templates={avail?.availability ?? []}
          blockedDates={avail?.blocked_dates ?? []}
          bookedSlots={avail?.booked_slots ?? []}
          minAdvanceHours={policy.min_advance_hours}
          maxAdvanceDays={policy.max_advance_days}
          cancellationWindowHours={policy.cancellation_window_hours}
          programmesByDate={programmeSchedule.byDate}
          programmeDates={programmeSchedule.programmeDates}
          authedBooking={authedBooking}
        />
      </main>

      <PublicFooter variant="links" />
    </div>
  )
}
