import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCommissionRate } from '@/lib/booking/commission-rate'
import { toGroupPriceTiers } from '@/lib/coach/group-pricing'
import type { SlotTemplate } from '@/lib/availability/slots'
import {
  SlotPickerClient,
  type AuthedBookedSlot,
  type SlotPickerData,
} from '@/components/parent/booking/SlotPickerClient'

// P-10 Screen 1: authed parent slot picker at /parent/book/[coachSlug].
// Auth comes from src/proxy.ts (protected prefix) + parent/layout.tsx (role +
// terms gates) — nothing to repeat here. Data assembly follows the parent
// module convention (one server component fetches everything, one typed prop
// to the client orchestrator). Coach + availability come from the existing
// public APIs, unchanged; group_price_tiers is the one field those APIs omit,
// read directly under coach_sports' public-live-coach SELECT policy (RLS
// respected — no admin client).

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

  const [avail, commissionRate, tiersResult] = await Promise.all([
    fetchAvailability(coach.id),
    getCommissionRate(),
    // group_price_tiers is absent from the public coach API — read it under
    // the "Public can view sports for live coaches" SELECT policy.
    (await createClient())
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
  }

  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-50">
      <SlotPickerClient data={data} />
    </main>
  )
}
