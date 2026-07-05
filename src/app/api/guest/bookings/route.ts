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
import {
  bookableSlots,
  isDateWithinBookingWindow,
  clearsMinAdvance,
  type SlotTemplate,
} from '@/lib/availability/slots'
import { getCoachCommitments, findFirstConflict } from '@/lib/availability/commitments'
import { hhmmToMinutes } from '@/lib/availability/overlap'

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
  /** Who the session is for — a parent's child or the player themselves (UX-16). */
  participantName: string
  /** Age in years. Optional — children have it, adult players may not. */
  participantAge: number | null
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

  // UX-16: participant name is REQUIRED for every guest booking — it is what
  // the coach sees ("who am I coaching?"). Length-bounded like other free text.
  if (
    typeof b.participantName !== 'string' ||
    b.participantName.trim().length === 0 ||
    b.participantName.trim().length > 100
  ) {
    return null
  }

  // UX-16: age is optional (adult players may omit it) but must be a sane
  // integer when present — mirrors the DB CHECK (1–99).
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
    participantName: b.participantName.trim(),
    participantAge,
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

  // 3c. BUG-19 Phase 1 (closes BUG-21): validate the requested slot against the
  //     coach's REAL availability before any money object exists. Until now this
  //     route accepted ANY date/time. The slot must be one that bookableSlots()
  //     — the exact function the public calendar renders from
  //     (src/lib/availability/slots.ts) — would emit for this date: inside an
  //     active availability block (recurring or ad-hoc), not on a blocked date,
  //     inside the coach's min/max advance window, and not overlapping a
  //     committed programme session (persisted or legacy recurring pattern) or a
  //     live 1-on-1 booking — including overlapping-but-UNEQUAL start times,
  //     which the migration-034 unique index (23505 → slot_taken at insert,
  //     kept below as the same-slot race backstop) cannot catch.
  //
  //     Template membership deliberately ignores sport, matching the calendar
  //     (its availability fetch passes no sport filter) — approved in BUG-19
  //     Phase 1 Step 0. Do not tighten to sport-matched templates here.
  const { data: allTemplates, error: allTemplatesError } = await supabase
    .from('availability_templates')
    .select('day_of_week, start_time, end_time, is_recurring, specific_date')
    .eq('coach_profile_id', input.coachId)
    .eq('is_active', true)

  if (allTemplatesError) {
    console.error('[POST /api/guest/bookings] slot-validation template lookup failed:', allTemplatesError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const { data: blockedRows, error: blockedError } = await supabase
    .from('blocked_dates')
    .select('blocked_date, blocked_date_end')
    .eq('coach_profile_id', input.coachId)

  if (blockedError) {
    console.error('[POST /api/guest/bookings] blocked_dates lookup failed:', blockedError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // A date is blocked when it falls inside any blocked range (single-day rows
  // have no end). ISO-string comparison is safe for YYYY-MM-DD.
  const isBlocked = ((blockedRows ?? []) as { blocked_date: string; blocked_date_end: string | null }[]).some(
    (r) => {
      const rangeStart = r.blocked_date.slice(0, 10)
      const rangeEnd = (r.blocked_date_end ?? r.blocked_date).slice(0, 10)
      return rangeStart <= input.date && input.date <= rangeEnd
    },
  )

  // Busy intervals from the shared aggregator (BUG-16/17/18 guards): programme
  // sessions + live bookings ONLY — for a 1-on-1 booking, availability templates
  // are the valid zone, not a conflict.
  const busy = await getCoachCommitments(supabase, input.coachId, input.date, {
    sources: ['programme', 'booking'],
  })

  interface TemplateMembershipRow {
    day_of_week: number
    start_time: string
    end_time: string
    is_recurring: boolean | null
    specific_date: string | null
  }

  const slotTemplates: SlotTemplate[] = ((allTemplates ?? []) as TemplateMembershipRow[]).map((t) => ({
    day_of_week: t.day_of_week,
    start_time: t.start_time,
    end_time: t.end_time,
    is_recurring: t.is_recurring ?? true,
    specific_date: t.specific_date ? t.specific_date.slice(0, 10) : null,
  }))

  // Server-local midnight for the session date; bookableSlots does all its
  // boundary maths off this + `now` exactly as the calendar client does.
  const [bookYear, bookMonth, bookDay] = input.date.split('-').map(Number)
  const sessionDate = new Date(bookYear, bookMonth - 1, bookDay)
  const now = new Date()

  const daySlots = bookableSlots(
    sessionDate,
    slotTemplates,
    isBlocked ? new Set([input.date]) : new Set<string>(),
    coach.min_advance_hours,
    coach.max_advance_days,
    now,
    coachSport.session_duration_minutes,
    busy,
  )

  const requestedHHMM = input.startTime.slice(0, 5)
  if (!daySlots.some((s) => s.time === requestedHHMM)) {
    // Diagnose WHY for a specific, friendly 409 — all before the provisional
    // user, the booking row, and the Stripe PaymentIntent are created.
    if (isBlocked) {
      return NextResponse.json({ error: 'date_blocked' }, { status: 409 })
    }

    const startMinutes = hhmmToMinutes(input.startTime)
    if (
      !isDateWithinBookingWindow(sessionDate, now, coach.max_advance_days) ||
      !clearsMinAdvance(sessionDate, startMinutes, coach.min_advance_hours, now)
    ) {
      return NextResponse.json({ error: 'outside_booking_window' }, { status: 409 })
    }

    // slot_taken is only the honest reason when the slot WOULD exist absent
    // the busy intervals — i.e. a commitment consumed a genuinely offered
    // slot. A time that overlaps, say, an evening programme but was never
    // inside any availability block must report slot_not_available, not a
    // phantom conflict.
    const slotsIgnoringBusy = bookableSlots(
      sessionDate,
      slotTemplates,
      new Set<string>(),
      coach.min_advance_hours,
      coach.max_advance_days,
      now,
      coachSport.session_duration_minutes,
      [],
    )
    if (slotsIgnoringBusy.some((s) => s.time === requestedHHMM)) {
      const conflict = findFirstConflict(
        startMinutes,
        startMinutes + coachSport.session_duration_minutes,
        busy,
      )
      return NextResponse.json(
        {
          error: 'slot_taken',
          ...(conflict ? { reason: `This time overlaps ${conflict.label}.` } : {}),
        },
        { status: 409 },
      )
    }

    // Not inside any active availability block for this date.
    return NextResponse.json({ error: 'slot_not_available' }, { status: 409 })
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
      participant_name: input.participantName,
      participant_age: input.participantAge,
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
          participant_name: input.participantName,
          ...(input.participantAge !== null
            ? { participant_age: String(input.participantAge) }
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
