import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, MapPin, Star, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCommissionRate } from '@/lib/booking/commission-rate'
import { toGroupPriceTiers } from '@/lib/coach/group-pricing'
import { ageFromDateOfBirth } from '@/lib/children/child-api'
import { childIdentityColour, firstNameOf } from '@/constants/childIdentity'
import type { SlotTemplate } from '@/lib/availability/slots'
import type { ChildSelectorOption } from '@/components/parent/children/ChildSelector'
import {
  SlotPickerClient,
  type AuthedBookedSlot,
  type SlotPickerData,
} from '@/components/parent/booking/SlotPickerClient'

// P-10 Screen 1 (rev 2): authed parent slot picker at /parent/book/[coachSlug],
// page chrome pattern-copied from the LIVE guest picker page
// (src/app/coaches/[id]/availability/page.tsx) — back link, coach summary row,
// "Choose a date & time" heading — so both flows look identical. Differences:
// the parent AppShell (from parent/layout.tsx) replaces PublicHeader/Footer,
// and the page additionally assembles the parent's child profiles for the
// ChildSelector (COPPA — child data must never be fetched client-side).
//
// Auth comes from src/proxy.ts (protected prefix) + parent/layout.tsx (role +
// terms gates). Coach + availability come from the existing public APIs,
// unchanged; group_price_tiers is the one field those APIs omit, read directly
// under coach_sports' public-live-coach SELECT policy (RLS respected — no
// admin client).

// ─── Types (subset of the coach API response used on this page) ──────────────

interface ApiSport {
  sport_id: string
  sport_name: string
  session_types: string[]
  price_individual_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
}

interface ApiCoach {
  id: string
  slug: string | null
  full_name: string
  location_city: string | null
  location_postcode?: string | null
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
  booked_slots: AuthedBookedSlot[]
  booking_policy: {
    cancellation_window_hours: number
    min_advance_hours: number
    max_advance_days: number
  }
}

// ─── Helpers (mirrors the guest availability page) ───────────────────────────

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

// "From" price is the minimum across ALL the coach's sports — same as the
// guest availability page — even though P-10 books sports[0] only, so the
// header matches the guest flow for a multi-sport coach.
function getMinIndividualPrice(sports: ApiSport[]): number | null {
  const prices = sports
    .map((s) => s.price_individual_pence)
    .filter((v): v is number => v !== null)
  return prices.length > 0 ? Math.min(...prices) : null
}

// ─── Data fetching (same HTTP pattern as coaches/[id]/availability/page.tsx) ─

async function fetchCoach(slugOrId: string): Promise<ApiCoach | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${slugOrId}`, {
    next: { revalidate: 30 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch coach: ${res.status}`)
  return res.json() as Promise<ApiCoach>
}

async function fetchAvailability(coachId: string): Promise<ApiAvailability | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${coachId}/availability`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json() as Promise<ApiAvailability>
}

// Children hang off parent_profiles (join path: user_profiles.id →
// parent_profiles.user_profile_id → child_profiles.parent_profile_id) — same
// assembly as parent/dashboard/page.tsx. Failures degrade to [] with a
// server-side error log (never silent, never client-fetched).
async function loadChildren(): Promise<ChildSelectorOption[]> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!userProfile) return []

    const { data: parentProfile } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', userProfile.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parentProfile) return []

    const { data: childRows, error } = await supabase
      .from('child_profiles')
      .select('id, full_name, date_of_birth')
      .eq('parent_profile_id', parentProfile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[ParentSlotPickerPage] child_profiles lookup failed:', error)
      return []
    }

    return (childRows ?? []).map(
      (child, index): ChildSelectorOption => ({
        id: child.id,
        firstName: firstNameOf(child.full_name),
        colour: childIdentityColour(index),
        age: ageFromDateOfBirth(child.date_of_birth),
      }),
    )
  } catch (error) {
    console.error('[ParentSlotPickerPage] children fetch failed:', error)
    return []
  }
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ coachSlug: string }>
}): Promise<Metadata> {
  const { coachSlug } = await params
  const coach = await fetchCoach(coachSlug)
  if (!coach) return { title: 'Coach not found — Crikly' }
  return {
    title: `Book ${coach.full_name} — Crikly`,
    description: `Pick a date and time for a session with ${coach.full_name} on Crikly.`,
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ParentSlotPickerPage({
  params,
}: {
  params: Promise<{ coachSlug: string }>
}) {
  const { coachSlug } = await params

  const coach = await fetchCoach(coachSlug)
  if (!coach) notFound()

  // BUG-51: sports are name-sorted by the coach API, so [0] is deterministic.
  // Its duration is only the fallback stride — each availability template
  // carries its own sport's session_duration_minutes.
  const sport = coach.sports[0] ?? null
  if (!sport) notFound()

  // Client created ahead of the Promise.all so the tiers query genuinely runs
  // concurrently with the other three fetches.
  const supabase = await createClient()
  const [avail, commissionRate, childrenList, tiersResult] = await Promise.all([
    fetchAvailability(coach.id),
    getCommissionRate(),
    loadChildren(),
    // group_price_tiers is absent from the public coach API — read it under
    // the "Public can view sports for live coaches" SELECT policy.
    supabase
      .from('coach_sports')
      .select('group_price_tiers')
      .eq('coach_profile_id', coach.id)
      .eq('sport_id', sport.sport_id)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  // Never silent (docs/08): a failed read degrades to "no group pricing",
  // which must be visible in server logs, not invisible in prod.
  if (tiersResult.error) {
    console.error(
      '[ParentSlotPickerPage] group_price_tiers lookup failed:',
      tiersResult.error,
    )
  }
  const groupPriceTiers = toGroupPriceTiers(tiersResult.data?.group_price_tiers ?? null)

  const policy = avail?.booking_policy ?? {
    min_advance_hours: coach.min_advance_hours,
    max_advance_days: coach.max_advance_days,
    cancellation_window_hours: coach.cancellation_window_hours,
  }

  const data: SlotPickerData = {
    coachId: coach.id,
    coachSlug: coach.slug ?? coach.id,
    coachName: coach.full_name,
    sportName: sport.sport_name,
    sessionDurationMinutes: sport.session_duration_minutes,
    priceIndividualPence: sport.price_individual_pence,
    sessionTypes: sport.session_types,
    maxGroupSize: sport.max_group_size,
    groupPriceTiers,
    commissionRate,
    templates: avail?.availability ?? [],
    blockedDates: avail?.blocked_dates ?? [],
    bookedSlots: avail?.booked_slots ?? [],
    minAdvanceHours: policy.min_advance_hours,
    maxAdvanceDays: policy.max_advance_days,
    cancellationWindowHours: policy.cancellation_window_hours,
    childrenList,
  }

  const firstName = coach.full_name.split(' ')[0]
  const locationLabel = coach.location_city || coach.location_postcode
  const minPrice = getMinIndividualPrice(coach.sports)

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-32 lg:pb-16 pt-5 lg:pt-7">
      {/* Back link */}
      <Link
        href={`/coaches/${data.coachSlug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 mb-5 transition-colors"
        data-testid="back-to-profile"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to {firstName}&apos;s profile
      </Link>

      {/* Coach summary row (guest availability page layout) */}
      <div className="flex items-center gap-4 pb-6 mb-7 border-b border-gray-100">
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-gray-900 leading-tight">
            {coach.full_name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-sm text-gray-600">
            <span className="font-medium text-gray-900">{sport.sport_name}</span>
            {(locationLabel || (coach.rating_avg !== null && coach.rating_count > 0) || coach.dbs_status === 'verified') && (
              <span className="text-gray-300">·</span>
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
            {/* UX-13: "From" signals this is the lowest available rate, not a flat fee */}
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

      <SlotPickerClient data={data} />
    </main>
  )
}
