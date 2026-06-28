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
  const idempotencyKey = input.idempotencyToken ? `guest-booking-${input.idempotencyToken}` : null
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
        .select('booking_reference')
        .eq('id', bookingId)
        .maybeSingle()

      try {
        const pi = await getStripe().paymentIntents.retrieve(existingPi.stripe_payment_intent_id)
        if (pi.client_secret && existingBooking) {
          return NextResponse.json({
            clientSecret: pi.client_secret,
            bookingReference: existingBooking.booking_reference,
            bookingId,
          })
        }
      } catch (err) {
        console.error('[POST /api/guest/bookings] idempotent PI retrieve failed:', err)
        // Fall through and let a fresh attempt proceed.
      }
    }
  }

  // 2. Confirm the coach is real and bookable, and snapshot the cancellation window.
  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select('id, cancellation_window_hours, is_profile_live, is_paused, is_suspended, deleted_at')
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
    .select('price_individual_pence, price_group_pence, session_duration_minutes, currency, is_active')
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

  const sportDefault =
    input.sessionType === 'individual'
      ? coachSport.price_individual_pence
      : coachSport.price_group_pence

  if (sportDefault === null || sportDefault <= 0) {
    return badRequest('session_type_unavailable')
  }

  // 3b. BUG-09: a coach can set a per-block price override on an availability
  //     template (e.g. £75 for Sunday mornings vs a £60 sport default). The guest
  //     was shown — and the anti-tamper check below must accept — that overridden
  //     figure, so the canonical price must honour it too. Overrides are only
  //     surfaced on the 1-on-1 slot picker, so they apply to individual sessions
  //     only; group bookings flow through the programme/enrolment path and always
  //     use the sport default.
  //
  //     We mirror the public availability query exactly (GET
  //     /api/coaches/[id]/availability): active templates for this coach, matching
  //     the sport or sport-agnostic (sport_id IS NULL), on the booking's weekday.
  //     Separate query, no nested joins (Fix-16d safe). The matching block is the
  //     one whose window CONTAINS the start time (start_time <= startTime <
  //     end_time) — one block spans several stride-length start slots, so an exact
  //     start_time match would miss every slot but the first.
  let canonicalPrice = sportDefault

  if (input.sessionType === 'individual') {
    // Weekday from the YYYY-MM-DD string, computed in UTC so BST/GMT never shifts
    // it — matches the client, which derives the same weekday from the same string.
    const [year, month, day] = input.date.split('-').map(Number)
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

    const { data: templates, error: templateError } = await supabase
      .from('availability_templates')
      .select('start_time, end_time, price_override_pence')
      .eq('coach_profile_id', input.coachId)
      .eq('is_active', true)
      .eq('day_of_week', dayOfWeek)
      .or(`sport_id.eq.${input.sportId},sport_id.is.null`)

    if (templateError) {
      console.error('[POST /api/guest/bookings] availability_templates lookup failed:', templateError)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    // Compare on HH:MM (DB time is HH:MM:SS, client sends HH:MM). The no-overlap
    // business rule means at most one block matches; if a misconfiguration yields
    // several, the first with a usable override wins (deterministic, conservative).
    // No matching block, or a null/zero override, falls through to the sport
    // default — never a 500 (BUG-09 graceful fallback).
    const startHHMM = input.startTime.slice(0, 5)
    const match = (templates ?? []).find((t) => {
      const blockStart = t.start_time.slice(0, 5)
      const blockEnd = t.end_time.slice(0, 5)
      return blockStart <= startHHMM && startHHMM < blockEnd
    })

    if (match?.price_override_pence != null && match.price_override_pence > 0) {
      canonicalPrice = match.price_override_pence
    }
  }

  // The client-supplied price MUST match the DB. Mismatch = stale page or tamper.
  if (input.pricePence !== canonicalPrice) {
    return NextResponse.json({ error: 'price_mismatch' }, { status: 409 })
  }

  const endTime = addMinutesToTime(input.startTime, coachSport.session_duration_minutes)
  if (!endTime) return badRequest('invalid_session_time')

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
    })
    .select('id')
    .single()

  if (bookingError || !booking) {
    // 23505 = unique_violation. On this table the only user-reachable unique key
    // is the slot constraint → surface as slot_taken.
    if (bookingError?.code === '23505') {
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
  //    the same intent); it falls back to the booking UUID when no token is sent.
  const piKey = idempotencyKey ?? `guest-booking-${booking.id}`
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
