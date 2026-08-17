// P-10 Phase 2 — POST /api/parent/bookings
//
// Authed (signed-in parent) checkout. Creates a pending_payment booking and a
// Stripe PaymentIntent, then returns the client secret so the browser can
// confirm payment with the Payment Element. The Stripe webhook
// (payment_intent.succeeded) flips the booking to 'confirmed' (BR-06).
//
// A SEPARATE endpoint from POST /api/guest/bookings by design (Lasith
// decision 2, 16 Aug): different auth context (RLS session vs provisional
// profile creation), different validation (child-profile ownership), and no
// guest-details handling. Everything that must not drift between the two —
// slot validation, per-block override pricing, group-tier pricing, player
// validation — lives in shared modules (lib/booking/slot-pricing,
// lib/booking/participants), not in either route.
//
// Security non-negotiables:
//   - Auth + child ownership are checked with the RLS-respecting server
//     client (requireParentContext; child_profiles reads scoped by RLS).
//   - Money writes use the service-role client, mirroring the guest route:
//     payment_intents is service-role-only by RLS design, and bookings rows
//     are written with server-derived money figures only
//     (docs/06_SECURITY_COMPLIANCE.md §Payment Security).
//   - Money is NEVER trusted from the client: pricePence is re-derived from
//     coach_sports (+ group_price_tiers for groups — D4) and REJECTED on
//     mismatch (BR-01, BR-10). All amounts are integer pence.
//   - Child identities arrive in the JSON body (never a URL) and every
//     childProfileId must belong to THIS parent — anything else is a 403.
//   - No card data ever touches this route — Stripe Elements collects it.
//
// Funds flow matches the guest route (P-00c-API MVP, approved): a plain
// PaymentIntent captured by the platform for the full parent_total; the
// coach/commission split is recorded on payment_intents for the payout
// system (BR-03). Confirmation email: the guest webhook path keys off
// guest_email metadata, which authed bookings do not set — the webhook
// resolves the authed recipient via booked_by_user_id → user_profiles →
// auth.users instead (BUG-71).

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import {
  generateBookingReference,
  computeBookingTotals,
  addMinutesToTime,
  isValidDate,
  isValidTime,
} from '@/lib/booking/guest-checkout'
import { isGroupEnabled } from '@/lib/coach/group-pricing'
import {
  parsePlayers,
  maxBookablePlayers,
  groupTierPricePence,
  toAdditionalParticipantsJson,
  type BookingPlayer,
} from '@/lib/booking/participants'
import {
  resolveIndividualCanonicalPrice,
  validateSlotAvailability,
} from '@/lib/booking/slot-pricing'
import { requireParentContext } from '@/lib/auth/require-parent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOG = '[POST /api/parent/bookings]'

interface ParentBookingInput {
  coachId: string
  sportId: string
  date: string
  startTime: string
  pricePence: number
  /** players[0] is the PRIMARY (stored in participant_name/participant_age,
   * and its childProfileId becomes bookings.child_profile_id); players 1..N
   * go to additional_participants (migration 054). */
  players: BookingPlayer[]
  /** Client-stable token so a retried submit reuses the same booking + intent. */
  idempotencyToken: string | null
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Narrow the untrusted JSON body to ParentBookingInput. No `any`. */
function parseBody(raw: unknown): ParentBookingInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>

  if (typeof b.coachId !== 'string' || !UUID_RE.test(b.coachId)) return null
  if (typeof b.sportId !== 'string' || !UUID_RE.test(b.sportId)) return null
  if (!isValidDate(b.date)) return null
  if (!isValidTime(b.startTime)) return null
  if (typeof b.pricePence !== 'number' || !Number.isInteger(b.pricePence) || b.pricePence <= 0) {
    return null
  }

  // The players array is REQUIRED on this route (no legacy field fallback —
  // this API is born multi-player). Child profile links are allowed;
  // ownership is verified against the session after auth.
  const players = parsePlayers(b.players, { allowChildProfiles: true })
  if (!players) return null

  const token =
    typeof b.idempotencyToken === 'string' &&
    b.idempotencyToken.length > 0 &&
    b.idempotencyToken.length <= 100
      ? b.idempotencyToken
      : null

  return {
    coachId: b.coachId,
    sportId: b.sportId,
    date: b.date,
    startTime: b.startTime,
    pricePence: b.pricePence,
    players,
    idempotencyToken: token,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Parse + validate the untrusted body.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('invalid_body')
  }
  const input = parseBody(body)
  if (!input) return badRequest('invalid_body')

  // 2. Auth — parent role + parent_profiles row, via the RLS-respecting
  //    server client (401/403/404 handled by the shared gate).
  const rls = await createClient()
  const { context, error: authError } = await requireParentContext(rls)
  if (authError) return authError

  // Session type is DERIVED, never client-asserted: a group booking is
  // exactly a multi-player booking (D4/D5 coherence).
  const playerCount = input.players.length
  const sessionType: 'individual' | 'group' = playerCount > 1 ? 'group' : 'individual'

  // 3. Child ownership: every linked child profile must belong to THIS
  //    parent and be live. RLS scopes the read; the count check catches both
  //    foreign and deleted ids without leaking which.
  const childIds = input.players
    .map((p) => p.childProfileId)
    .filter((id): id is string => id !== null)
  if (childIds.length > 0) {
    const { data: ownedChildren, error: childError } = await rls
      .from('child_profiles')
      .select('id')
      .eq('parent_profile_id', context.parentProfile.id)
      .is('deleted_at', null)
      .in('id', childIds)
    if (childError) {
      console.error(`${LOG} child_profiles ownership read failed:`, childError)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
    if ((ownedChildren ?? []).length !== childIds.length) {
      return NextResponse.json({ error: 'child_not_found' }, { status: 403 })
    }
  }

  const supabase = createAdminClient()

  // 3b. Idempotency (BUG-13b, mirrored from the guest route): a retried
  //     submit returns the existing booking + PaymentIntent. The token is a
  //     client-chosen bearer, so the replay additionally requires the
  //     existing booking to belong to THIS user — a foreign token can never
  //     fetch someone else's client secret; it just burns to per-booking keys.
  const idempotencyKey = input.idempotencyToken
    ? `parent-booking-${input.idempotencyToken}`
    : null
  let tokenKeyBurned = false
  if (idempotencyKey) {
    const { data: existingPi } = await supabase
      .from('payment_intents')
      .select('stripe_payment_intent_id, booking_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingPi?.booking_id) {
      const bookingId = existingPi.booking_id
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('booking_reference, status, deleted_at, booked_by_user_id')
        .eq('id', bookingId)
        .maybeSingle()

      if (
        existingBooking &&
        existingBooking.booked_by_user_id !== context.userProfile.id
      ) {
        tokenKeyBurned = true
      } else if (existingBooking?.deleted_at) {
        // Prior attempt released (reaper TTL / payment_intent.canceled) —
        // its slot is free again and its intent is dead. Fresh attempt,
        // burned key.
        tokenKeyBurned = true
      } else if (existingBooking) {
        try {
          const pi = await getStripe().paymentIntents.retrieve(existingPi.stripe_payment_intent_id)
          if (pi.status === 'canceled') {
            tokenKeyBurned = true
          } else if (pi.client_secret) {
            return NextResponse.json({
              clientSecret: pi.client_secret,
              bookingReference: existingBooking.booking_reference,
              bookingId,
            })
          }
        } catch (err) {
          console.error(`${LOG} idempotent PI retrieve failed:`, err)
          // Unknown intent state — burn the token key so a fresh intent
          // cannot collide on Stripe's idempotency (BUG-13b).
          tokenKeyBurned = true
        }
      }
    }
  }

  // 4. Coach is real and bookable; snapshot the cancellation window.
  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select(
      'id, cancellation_window_hours, min_advance_hours, max_advance_days, is_profile_live, is_paused, is_suspended, deleted_at',
    )
    .eq('id', input.coachId)
    .is('deleted_at', null)
    .maybeSingle()

  if (coachError) {
    console.error(`${LOG} coach lookup failed:`, coachError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!coach || !coach.is_profile_live || coach.is_paused || coach.is_suspended) {
    return NextResponse.json({ error: 'coach_unavailable' }, { status: 404 })
  }

  // 5. Canonical price (anti-tampering, BR-01) — same derivation as the
  //    guest route, from the same shared modules.
  const { data: coachSport, error: sportError } = await supabase
    .from('coach_sports')
    .select('price_individual_pence, group_price_tiers, session_types, session_duration_minutes, currency, is_active')
    .eq('coach_profile_id', input.coachId)
    .eq('sport_id', input.sportId)
    .maybeSingle()

  if (sportError) {
    console.error(`${LOG} coach_sports lookup failed:`, sportError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!coachSport || !coachSport.is_active) {
    return badRequest('sport_unavailable')
  }

  let canonicalPrice: number
  if (sessionType === 'group') {
    if (!isGroupEnabled(coachSport.session_types ?? [])) {
      return badRequest('session_type_unavailable')
    }
    if (
      playerCount >
      maxBookablePlayers(coachSport.session_types ?? [], coachSport.group_price_tiers)
    ) {
      return badRequest('too_many_players')
    }
    const tierPrice = groupTierPricePence(coachSport.group_price_tiers, playerCount)
    if (tierPrice === null) {
      return badRequest('session_type_unavailable')
    }
    canonicalPrice = tierPrice
  } else {
    const sportDefault = coachSport.price_individual_pence
    if (sportDefault === null || sportDefault <= 0) {
      return badRequest('session_type_unavailable')
    }
    const resolved = await resolveIndividualCanonicalPrice(supabase, {
      coachId: input.coachId,
      sportId: input.sportId,
      date: input.date,
      startTime: input.startTime,
      sportDefaultPence: sportDefault,
      logPrefix: LOG,
    })
    if (resolved.failed) {
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
    canonicalPrice = resolved.price
  }

  // The client-supplied price MUST match the DB. Mismatch = stale page or tamper.
  if (input.pricePence !== canonicalPrice) {
    return NextResponse.json({ error: 'price_mismatch' }, { status: 409 })
  }

  const endTime = addMinutesToTime(input.startTime, coachSport.session_duration_minutes)
  if (!endTime) return badRequest('invalid_session_time')

  // 6. The requested slot must be one the public calendar would render —
  //    shared validation, specific 409s before any money object exists.
  const slotCheck = await validateSlotAvailability(supabase, {
    coachId: input.coachId,
    date: input.date,
    startTime: input.startTime,
    minAdvanceHours: coach.min_advance_hours,
    maxAdvanceDays: coach.max_advance_days,
    bookedSportDurationMinutes: coachSport.session_duration_minutes,
    logPrefix: LOG,
  })
  if (!slotCheck.ok) {
    return NextResponse.json(
      {
        error: slotCheck.error,
        ...('reason' in slotCheck && slotCheck.reason ? { reason: slotCheck.reason } : {}),
      },
      { status: slotCheck.status },
    )
  }

  // 7. Commission + total (BR-01/BR-02) — rate from platform_config, never hardcoded.
  const { data: config, error: configError } = await supabase
    .from('platform_config')
    .select('default_commission_rate')
    .limit(1)
    .single()

  if (configError || !config) {
    console.error(`${LOG} platform_config lookup failed:`, configError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const commissionRate = Number(config.default_commission_rate)
  const { commissionPence, parentTotalPence } = computeBookingTotals(canonicalPrice, commissionRate)
  const currency = coachSport.currency || 'GBP'

  // 8. Create the booking in pending_payment. The migration-034 unique index
  //    + the coach_time_claims exclusion trigger give atomic slot-locking.
  const reference = generateBookingReference(new Date().getUTCFullYear())
  const primary = input.players[0]

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      booking_reference: reference,
      coach_profile_id: input.coachId,
      sport_id: input.sportId,
      booked_by_user_id: context.userProfile.id,
      // Primary child's profile when the parent picked one from ChildSelector;
      // null when the primary is a "someone else" guest player.
      child_profile_id: primary.childProfileId,
      session_type: sessionType,
      session_date: input.date,
      session_start_time: input.startTime,
      session_end_time: endTime,
      coach_price_pence: canonicalPrice,
      commission_rate: commissionRate,
      commission_pence: commissionPence,
      parent_total_pence: parentTotalPence,
      currency,
      status: 'pending_payment',
      messaging_unlocked: false,
      cancellation_window_hours: coach.cancellation_window_hours,
      participant_name: primary.name,
      participant_age: primary.age,
      // P-10 Phase 2 (migration 054): players 2..N, child links preserved.
      additional_participants: toAdditionalParticipantsJson(input.players),
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    // 23505 = migration-034 unique index (same-slot race); 23P01 =
    // coach_time_claims exclusion trigger (any overlap) → slot_taken.
    if (bookingError?.code === '23505' || bookingError?.code === '23P01') {
      return NextResponse.json({ error: 'slot_taken' }, { status: 409 })
    }
    console.error(`${LOG} booking insert failed:`, bookingError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const softDeleteBooking = async (): Promise<void> => {
    const { error } = await supabase
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', booking.id)
    if (error) console.error(`${LOG} rollback booking soft-delete failed:`, error)
  }

  // 9. Stripe PaymentIntent for the full parent total. Key prefers the
  //    client-stable token (retry reuses the intent); falls back to the
  //    booking UUID when absent or burned (BUG-13b).
  const piKey =
    idempotencyKey && !tokenKeyBurned ? idempotencyKey : `parent-booking-${booking.id}`
  let paymentIntent: Stripe.PaymentIntent
  try {
    const stripe = getStripe()
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: parentTotalPence,
        currency: currency.toLowerCase(),
        // Card only — mirrors the guest route (suppresses Link/Klarna etc.;
        // wallets come via the Express Checkout Element separately).
        payment_method_types: ['card'],
        metadata: {
          booking_id: booking.id,
          booking_reference: reference,
          coach_id: input.coachId,
          participant_name: primary.name,
          ...(primary.age !== null ? { participant_age: String(primary.age) } : {}),
          ...(playerCount > 1 ? { player_count: String(playerCount) } : {}),
        },
      },
      { idempotencyKey: piKey },
    )
  } catch (err) {
    console.error(`${LOG} Stripe PaymentIntent creation failed:`, err)
    await softDeleteBooking()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  if (!paymentIntent.client_secret) {
    console.error(`${LOG} PaymentIntent has no client_secret`)
    await softDeleteBooking()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  // 10. Persist the payment_intents audit row (service-role only by RLS design).
  const { error: piError } = await supabase.from('payment_intents').insert({
    booking_id: booking.id,
    stripe_payment_intent_id: paymentIntent.id,
    amount_pence: parentTotalPence,
    currency,
    status: 'pending',
    stripe_status: paymentIntent.status,
    application_fee_pence: commissionPence,
    coach_transfer_amount_pence: canonicalPrice,
    idempotency_key: piKey,
  })

  if (piError) {
    console.error(`${LOG} payment_intents insert failed:`, piError)
    try {
      await getStripe().paymentIntents.cancel(paymentIntent.id)
    } catch (cancelErr) {
      console.error(`${LOG} failed to cancel orphaned PI:`, cancelErr)
    }
    await softDeleteBooking()
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    bookingReference: reference,
    bookingId: booking.id,
  })
}
