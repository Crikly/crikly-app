// P-00c-API — POST /api/guest/bookings
//
// Guest (logged-out) checkout. Creates a provisional user, a pending_payment
// booking, and a Stripe PaymentIntent, then returns the client secret so the
// browser can confirm payment with the Payment Element. The Stripe webhook
// (payment_intent.succeeded) flips the booking to 'confirmed' (BR-06).
//
// Security non-negotiables:
//   - Service-role client ONLY. Provisional users have no auth credentials, so
//     RLS-respecting clients cannot insert their rows. Every write here bypasses
//     RLS deliberately (docs/06_SECURITY_COMPLIANCE.md §Payment Security).
//   - Money is NEVER trusted from the client. The browser sends pricePence (the
//     figure it displayed) but we re-derive the canonical price from coach_sports
//     and REJECT on mismatch — anti-tampering (BR-01, BR-10).
//   - All amounts are integer pence. Stripe is charged parent_total_pence.
//   - No card data ever touches this route — Stripe Elements collects it.
//
// Funds flow (P-00c-API MVP, approved by Lasith): a plain PaymentIntent captured
// by the platform for the full parent_total. The coach/commission split is
// recorded on payment_intents for the payout system (BR-03) to action later;
// there is no Connect destination charge here, so coaches need not have completed
// Stripe onboarding to receive guest bookings.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import {
  generateBookingReference,
  computeBookingTotals,
  addMinutesToTime,
  isValidDate,
  isValidTime,
  isValidEmail,
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVISIONAL_MONTHS = 6

type SessionType = 'individual' | 'group'

interface GuestDetails {
  fullName: string
  email: string
  phone: string
  address: string
  townCity: string
  postcode: string
}

interface GuestBookingInput {
  coachId: string
  sportId: string
  sessionType: SessionType
  date: string
  startTime: string
  pricePence: number
  /**
   * Who the session is for (UX-16 / P-10 Phase 2). players[0] is the PRIMARY
   * (stored in participant_name/participant_age — back-compat); players 1..N
   * are stored in additional_participants (migration 054). Guests never carry
   * childProfileId. Normalised at parse time: new clients send a `players`
   * array, legacy clients send participantName/participantAge (= one player).
   */
  players: BookingPlayer[]
  /** Client-stable token so a retried submit reuses the same booking + intent. */
  idempotencyToken: string | null
  guest: GuestDetails
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 })
}

// IDs must be UUIDs. Beyond correctness this is a security boundary: sportId is
// interpolated into a PostgREST `.or()` filter string at the BUG-09 template
// lookup, and supabase-js does NOT escape `.or()` arguments. A UUID cannot
// contain a comma or whitespace, so validating here makes filter injection
// (e.g. pulling another sport's cheaper override to undercut the charge)
// impossible. coachId is validated for the same hygiene though its uses are
// all parameterised `.eq()`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Narrow the untrusted JSON body to GuestBookingInput. No `any`. */
function parseBody(raw: unknown): GuestBookingInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  const g = b.guest as Record<string, unknown> | undefined

  if (typeof b.coachId !== 'string' || !UUID_RE.test(b.coachId)) return null
  if (typeof b.sportId !== 'string' || !UUID_RE.test(b.sportId)) return null
  if (b.sessionType !== 'individual' && b.sessionType !== 'group') return null
  if (!isValidDate(b.date)) return null
  if (!isValidTime(b.startTime)) return null
  if (typeof b.pricePence !== 'number' || !Number.isInteger(b.pricePence) || b.pricePence <= 0) {
    return null
  }
  if (typeof g !== 'object' || g === null) return null
  if (typeof g.fullName !== 'string' || g.fullName.trim().length === 0) return null
  if (!isValidEmail(g.email)) return null

  // UX-16 / P-10 Phase 2: who the session is for. New clients send a
  // `players` array (validated by the shared participants module — guests
  // may never link child profiles); legacy clients send
  // participantName/participantAge, normalised to a one-player array. Name
  // rules are identical in both paths (required, trimmed, ≤100; age optional
  // 1..99, mirroring the DB CHECK).
  let players: BookingPlayer[] | null = null
  if (b.players !== undefined) {
    players = parsePlayers(b.players, { allowChildProfiles: false })
    if (!players) return null
  } else {
    if (
      typeof b.participantName !== 'string' ||
      b.participantName.trim().length === 0 ||
      b.participantName.trim().length > 100
    ) {
      return null
    }
    let participantAge: number | null = null
    if (b.participantAge !== undefined && b.participantAge !== null) {
      if (
        typeof b.participantAge !== 'number' ||
        !Number.isInteger(b.participantAge) ||
        b.participantAge < 1 ||
        b.participantAge > 99
      ) {
        return null
      }
      participantAge = b.participantAge
    }
    players = [{ name: b.participantName.trim(), age: participantAge, childProfileId: null }]
  }

  // D4/D5 coherence: a group booking is exactly a multi-player booking. A
  // count/sessionType mismatch is a malformed client, not a pricing case.
  if ((players.length > 1) !== (b.sessionType === 'group')) return null

  // Optional but length-bounded so it can't be abused as an unbounded key.
  const token =
    typeof b.idempotencyToken === 'string' &&
    b.idempotencyToken.length > 0 &&
    b.idempotencyToken.length <= 100
      ? b.idempotencyToken
      : null

  return {
    coachId: b.coachId,
    sportId: b.sportId,
    sessionType: b.sessionType,
    date: b.date,
    startTime: b.startTime,
    pricePence: b.pricePence,
    players,
    idempotencyToken: token,
    guest: {
      fullName: g.fullName.trim(),
      email: (g.email as string).trim().toLowerCase(),
      phone: typeof g.phone === 'string' ? g.phone.trim() : '',
      address: typeof g.address === 'string' ? g.address.trim() : '',
      townCity: typeof g.townCity === 'string' ? g.townCity.trim() : '',
      postcode: typeof g.postcode === 'string' ? g.postcode.trim() : '',
    },
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

  const supabase = createAdminClient()

  // 1b. Idempotency: if this exact submit was already processed (client retry),
  //     return the existing booking + PaymentIntent instead of creating orphans.
  //
  //     BUG-13b: the prior attempt may since have been RELEASED (reaper TTL or
  //     payment_intent.canceled) — soft-deleted booking, cancelled intent. A
  //     cancelled intent can never be confirmed, so replaying it would
  //     dead-end the guest. In that case fall through to a fresh attempt, and
  //     BURN the token-based key: reusing it would make Stripe replay the
  //     cancelled intent and collide with payment_intents.unique_idempotency_key.
  //     The fresh attempt uses per-booking keys instead (see step 7).
  const idempotencyKey = input.idempotencyToken ? `guest-booking-${input.idempotencyToken}` : null
  let tokenKeyBurned = false
  if (idempotencyKey) {
    const { data: existingPi } = await supabase
      .from('payment_intents')
      .select('stripe_payment_intent_id, booking_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    // booking_id became nullable in migration 033 (enrolment intents set it null).
    // A booking idempotency key only ever matches a booking intent, so guard the
    // narrowing here.
    if (existingPi?.booking_id) {
      const bookingId = existingPi.booking_id
      const { data: existingBooking } = await supabase
        .from('bookings')
        .select('booking_reference, status, deleted_at')
        .eq('id', bookingId)
        .maybeSingle()

      if (existingBooking?.deleted_at) {
        // Prior attempt released or rolled back — its slot is free again and
        // its intent is dead. Start fresh with burned keys.
        tokenKeyBurned = true
      } else {
        try {
          const pi = await getStripe().paymentIntents.retrieve(existingPi.stripe_payment_intent_id)
          if (pi.status === 'canceled') {
            // Intent cancelled (e.g. Dashboard) but the release webhook hasn't
            // landed yet — replaying its secret would dead-end the guest.
            tokenKeyBurned = true
          } else if (pi.client_secret && existingBooking) {
            return NextResponse.json({
              clientSecret: pi.client_secret,
              bookingReference: existingBooking.booking_reference,
              bookingId,
            })
          }
        } catch (err) {
          console.error('[POST /api/guest/bookings] idempotent PI retrieve failed:', err)
          // Fall through to a fresh attempt — with the token key BURNED: the
          // old intent's status is unknown, and reusing its key with the new
          // booking's metadata would raise a Stripe idempotency mismatch
          // (different params, same key) and 502 the whole attempt (BUG-13b
          // review fix). If the old booking still holds this slot, the 034
          // unique index turns the fresh insert into a clean slot_taken 409.
          tokenKeyBurned = true
        }
      }
    }
  }

  // 2. Confirm the coach is real and bookable, and snapshot the cancellation window.
  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select(
      'id, cancellation_window_hours, min_advance_hours, max_advance_days, is_profile_live, is_paused, is_suspended, deleted_at',
    )
    .eq('id', input.coachId)
    .is('deleted_at', null)
    .maybeSingle()

  if (coachError) {
    console.error('[POST /api/guest/bookings] coach lookup failed:', coachError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!coach || !coach.is_profile_live || coach.is_paused || coach.is_suspended) {
    return NextResponse.json({ error: 'coach_unavailable' }, { status: 404 })
  }

  // 3. Re-derive the canonical price from coach_sports — the sport default — and,
  //    for individual sessions, the matching availability block's override (3b).
  //    Anti-tampering, BR-01.
  const { data: coachSport, error: sportError } = await supabase
    .from('coach_sports')
    .select('price_individual_pence, group_price_tiers, session_types, session_duration_minutes, currency, is_active')
    .eq('coach_profile_id', input.coachId)
    .eq('sport_id', input.sportId)
    .maybeSingle()

  if (sportError) {
    console.error('[POST /api/guest/bookings] coach_sports lookup failed:', sportError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!coachSport || !coachSport.is_active) {
    return badRequest('sport_unavailable')
  }

  // P-10 Phase 2 (D4/D5): canonical coach fee.
  //   - group → group_price_tiers[player_count], the TOTAL for that size.
  //     price_group_pence is DEPRECATED for price derivation; per-block
  //     overrides never apply to groups (BUG-09 is 1-on-1 scope). Count is
  //     capped at the highest tier key, primary player included.
  //   - individual → sport default + BUG-09 per-block override via the
  //     shared slot-pricing module (logic unchanged, now shared with
  //     POST /api/parent/bookings).
  const playerCount = input.players.length
  let canonicalPrice: number

  if (input.sessionType === 'group') {
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
      logPrefix: '[POST /api/guest/bookings]',
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

  // 3c. BUG-19 Phase 1 (closes BUG-21): the requested slot must be one the
  // public calendar would render — validated by the shared slot-pricing
  // module (logic extracted verbatim; now also used by
  // POST /api/parent/bookings so the write sides cannot drift). Specific,
  // friendly 409s BEFORE the provisional user, the booking row, and the
  // Stripe PaymentIntent are created.
  const slotCheck = await validateSlotAvailability(supabase, {
    coachId: input.coachId,
    date: input.date,
    startTime: input.startTime,
    minAdvanceHours: coach.min_advance_hours,
    maxAdvanceDays: coach.max_advance_days,
    bookedSportDurationMinutes: coachSport.session_duration_minutes,
    logPrefix: '[POST /api/guest/bookings]',
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

  // 4. Commission + total (BR-01/BR-02) — rate from platform_config, never hardcoded.
  const { data: config, error: configError } = await supabase
    .from('platform_config')
    .select('default_commission_rate')
    .limit(1)
    .single()

  if (configError || !config) {
    console.error('[POST /api/guest/bookings] platform_config lookup failed:', configError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const commissionRate = Number(config.default_commission_rate)
  const { commissionPence, parentTotalPence } = computeBookingTotals(canonicalPrice, commissionRate)
  const currency = coachSport.currency || 'GBP'

  // 5. Create the provisional user. is_provisional flags it for the cleanup cron;
  //    provisional_until = now + 6 months. auth_user_id stays null (no credentials).
  const provisionalUntil = new Date()
  provisionalUntil.setMonth(provisionalUntil.getMonth() + PROVISIONAL_MONTHS)

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .insert({
      auth_user_id: null,
      full_name: input.guest.fullName,
      phone: input.guest.phone || null,
      location_city: input.guest.townCity || null,
      location_postcode: input.guest.postcode || null,
      is_provisional: true,
      provisional_until: provisionalUntil.toISOString(),
      active_role: 'parent',
    })
    .select('id')
    .single()

  if (profileError || !profile) {
    console.error('[POST /api/guest/bookings] provisional user insert failed:', profileError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // From here on, any failure must clean up the provisional user (soft delete —
  // never hard DELETE per security rules; the cron also reaps it via provisional_until).
  const softDeleteProfile = async (): Promise<void> => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', profile.id)
    if (error) console.error('[POST /api/guest/bookings] rollback profile soft-delete failed:', error)
  }

  // 6. Create the booking in pending_payment. The unique slot constraint
  //    (coach_profile_id, session_date, session_start_time) gives us atomic
  //    slot-locking: a duplicate insert means the slot was just taken.
  const reference = generateBookingReference(new Date().getUTCFullYear())

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      booking_reference: reference,
      coach_profile_id: input.coachId,
      sport_id: input.sportId,
      booked_by_user_id: profile.id,
      session_type: input.sessionType,
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
      // UX-16: snapshot of who the session is for — guests have no
      // child_profiles row, so this is the coach's only source of the name.
      participant_name: input.players[0].name,
      participant_age: input.players[0].age,
      // P-10 Phase 2 (migration 054): players 2..N — always with
      // child_profile_id null on the guest route.
      additional_participants: toAdditionalParticipantsJson(input.players),
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    // 23505 = unique_violation: the migration-034 partial unique index (exact
    // same-slot race). 23P01 = exclusion_violation: the coach_time_claims
    // trigger (BUG-19 Phase 2) rejecting ANY overlap — including
    // overlapping-but-unequal start times and camp-mode blocks. Both mean the
    // requested time is committed → slot_taken.
    if (bookingError?.code === '23505' || bookingError?.code === '23P01') {
      await softDeleteProfile()
      return NextResponse.json({ error: 'slot_taken' }, { status: 409 })
    }
    console.error('[POST /api/guest/bookings] booking insert failed:', bookingError)
    await softDeleteProfile()
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const softDeleteBooking = async (): Promise<void> => {
    const { error } = await supabase
      .from('bookings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', booking.id)
    if (error) console.error('[POST /api/guest/bookings] rollback booking soft-delete failed:', error)
  }

  // 7. Create the Stripe PaymentIntent for the full parent total.
  //    The idempotency key prefers the client-stable token (so a retry reuses
  //    the same intent); it falls back to the booking UUID when no token is
  //    sent — or when the token's key is burned because a prior attempt was
  //    released/cancelled (BUG-13b, step 1b above).
  const piKey = idempotencyKey && !tokenKeyBurned ? idempotencyKey : `guest-booking-${booking.id}`
  let paymentIntent: Stripe.PaymentIntent
  try {
    const stripe = getStripe()
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: parentTotalPence,
        currency: currency.toLowerCase(),
        // Card only. Pinning payment_method_types server-side is the reliable
        // way to suppress Stripe Link / Klarna / Amazon Pay etc. — the client
        // paymentMethodTypes hint alone does not fully exclude Link. (Cannot be
        // combined with automatic_payment_methods.) Wallets are handled by the
        // Express Checkout Element separately.
        payment_method_types: ['card'],
        metadata: {
          booking_id: booking.id,
          booking_reference: reference,
          coach_id: input.coachId,
          // P-00c-EMAIL: the guest email/name live nowhere else (no email column
          // on user_profiles, no auth user for a guest). Stash them on the intent
          // so the payment_intent.succeeded webhook can send the confirmation.
          guest_email: input.guest.email,
          guest_name: input.guest.fullName,
          // UX-16: the confirmation email must say who the session is for.
          // Stripe metadata values are strings; age omitted when not given.
          participant_name: input.players[0].name,
          ...(input.players[0].age !== null
            ? { participant_age: String(input.players[0].age) }
            : {}),
          // P-10 Phase 2: group size for the confirmation email copy.
          ...(input.players.length > 1
            ? { player_count: String(input.players.length) }
            : {}),
        },
      },
      { idempotencyKey: piKey },
    )
  } catch (err) {
    console.error('[POST /api/guest/bookings] Stripe PaymentIntent creation failed:', err)
    await softDeleteBooking()
    await softDeleteProfile()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  if (!paymentIntent.client_secret) {
    console.error('[POST /api/guest/bookings] PaymentIntent has no client_secret')
    await softDeleteBooking()
    await softDeleteProfile()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  // 8. Persist the payment_intents audit row (service-role only by RLS design).
  //    application_fee_pence = commission; coach_transfer_amount_pence = coach price.
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
    console.error('[POST /api/guest/bookings] payment_intents insert failed:', piError)
    // Cancel the orphaned intent so it can never be confirmed, then roll back.
    try {
      await getStripe().paymentIntents.cancel(paymentIntent.id)
    } catch (cancelErr) {
      console.error('[POST /api/guest/bookings] failed to cancel orphaned PI:', cancelErr)
    }
    await softDeleteBooking()
    await softDeleteProfile()
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    bookingReference: reference,
    bookingId: booking.id,
  })
}
