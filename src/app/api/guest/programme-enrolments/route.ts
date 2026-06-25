// P-00c-ENROL — POST /api/guest/programme-enrolments
//
// Guest (logged-out) programme enrolment checkout. Mirrors POST /api/guest/bookings
// exactly: creates a provisional user, a pending_payment enrolment, and a Stripe
// PaymentIntent, then returns the client secret for the Payment Element. The Stripe
// webhook (payment_intent.succeeded) flips the enrolment to payment_status='succeeded'
// and atomically claims a programme spot (BR-06 instant confirmation).
//
// Security non-negotiables (identical to the 1-to-1 guest route):
//   - Service-role client ONLY. Provisional users have no auth credentials.
//   - Money is NEVER trusted from the client. We re-derive the canonical price from
//     group_programmes / group_programme_sessions and add commission ON TOP (BR-01).
//   - All amounts are integer pence. Stripe is charged parent_total_pence.
//   - No card data ever touches this route — Stripe Elements collects it.
//
// Funds flow (same MVP shape as /api/guest/bookings, approved P-00c-ENROL S0):
// a plain PaymentIntent for the full parent_total; the coach/commission split is
// recorded on payment_intents for the payout system to action later.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import {
  generateBookingReference,
  computeBookingTotals,
  isValidEmail,
} from '@/lib/booking/guest-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROVISIONAL_MONTHS = 6

type PaymentType = 'per_session' | 'block_upfront'

interface GuestDetails {
  fullName: string
  email: string
  phone: string
  address: string
  townCity: string
  postcode: string
}

interface EnrolmentInput {
  coachId: string
  programmeId: string
  paymentType: PaymentType
  selectedSessionIds: string[]
  idempotencyToken: string | null
  guest: GuestDetails
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 })
}

/** Narrow the untrusted JSON body to EnrolmentInput. No `any`. */
function parseBody(raw: unknown): EnrolmentInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>
  const g = b.guest as Record<string, unknown> | undefined

  if (typeof b.coachId !== 'string' || b.coachId.length === 0) return null
  if (typeof b.programmeId !== 'string' || b.programmeId.length === 0) return null
  if (b.paymentType !== 'per_session' && b.paymentType !== 'block_upfront') return null

  // selectedSessionIds: required + non-empty for per_session; ignored for block.
  let selectedSessionIds: string[] = []
  if (b.paymentType === 'per_session') {
    if (!Array.isArray(b.selectedSessionIds) || b.selectedSessionIds.length === 0) return null
    if (!b.selectedSessionIds.every((s) => typeof s === 'string' && s.length > 0)) return null
    // De-dupe so a tampered body can't pay once but list a session twice.
    selectedSessionIds = [...new Set(b.selectedSessionIds as string[])]
  }

  if (typeof g !== 'object' || g === null) return null
  if (typeof g.fullName !== 'string' || g.fullName.trim().length === 0) return null
  if (!isValidEmail(g.email)) return null

  const token =
    typeof b.idempotencyToken === 'string' &&
    b.idempotencyToken.length > 0 &&
    b.idempotencyToken.length <= 100
      ? b.idempotencyToken
      : null

  return {
    coachId: b.coachId,
    programmeId: b.programmeId,
    paymentType: b.paymentType,
    selectedSessionIds,
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

/** Today's local date as 'YYYY-MM-DD' for past-session filtering (server runs UTC). */
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

  // 1b. Idempotency: a client retry with the same token returns the existing
  //     enrolment + PaymentIntent instead of creating orphans.
  const idempotencyKey = input.idempotencyToken ? `guest-enrolment-${input.idempotencyToken}` : null
  if (idempotencyKey) {
    const { data: existingPi } = await supabase
      .from('payment_intents')
      .select('stripe_payment_intent_id, enrolment_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingPi?.enrolment_id) {
      const { data: existingEnrolment } = await supabase
        .from('group_programme_enrolments')
        .select('enrolment_reference')
        .eq('id', existingPi.enrolment_id)
        .maybeSingle()

      try {
        const pi = await getStripe().paymentIntents.retrieve(existingPi.stripe_payment_intent_id)
        if (pi.client_secret && existingEnrolment) {
          return NextResponse.json({
            clientSecret: pi.client_secret,
            enrolmentReference: existingEnrolment.enrolment_reference,
            enrolmentId: existingPi.enrolment_id,
          })
        }
      } catch (err) {
        console.error('[POST /api/guest/programme-enrolments] idempotent PI retrieve failed:', err)
        // Fall through and let a fresh attempt proceed.
      }
    }
  }

  // 2. Confirm the coach is real and bookable.
  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select('id, is_profile_live, is_paused, is_suspended, deleted_at')
    .eq('id', input.coachId)
    .is('deleted_at', null)
    .maybeSingle()

  if (coachError) {
    console.error('[POST /api/guest/programme-enrolments] coach lookup failed:', coachError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!coach || !coach.is_profile_live || coach.is_paused || coach.is_suspended) {
    return NextResponse.json({ error: 'coach_unavailable' }, { status: 404 })
  }

  // 3. Fetch the programme; it must be active and belong to this coach.
  const { data: programme, error: programmeError } = await supabase
    .from('group_programmes')
    .select(
      'id, coach_profile_id, payment_type, price_per_session_pence, block_price_pence, block_session_count, max_spots, current_spots, currency, status, deleted_at',
    )
    .eq('id', input.programmeId)
    .is('deleted_at', null)
    .maybeSingle()

  if (programmeError) {
    console.error('[POST /api/guest/programme-enrolments] programme lookup failed:', programmeError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!programme || programme.status !== 'active' || programme.coach_profile_id !== input.coachId) {
    return NextResponse.json({ error: 'programme_unavailable' }, { status: 404 })
  }
  // The client's payment type must match how the coach configured the programme.
  if (programme.payment_type !== input.paymentType) {
    return badRequest('payment_type_mismatch')
  }

  // 4. Re-derive the canonical COACH price server-side (never trust the client).
  //    Commission is added ON TOP (BR-01) in step 5.
  let coachAmountPence: number
  let sessionsPaidFor: number | null = null
  let validSessions: { id: string; price_pence: number }[] = []

  if (input.paymentType === 'per_session') {
    const pricePer = programme.price_per_session_pence
    if (pricePer === null || pricePer <= 0) return badRequest('session_price_unavailable')

    // Only sessions that belong to this programme, are still scheduled, and are
    // not in the past can be paid for.
    const { data: sessionRows, error: sessionError } = await supabase
      .from('group_programme_sessions')
      .select('id, session_date, status')
      .eq('group_programme_id', programme.id)
      .in('id', input.selectedSessionIds)

    if (sessionError) {
      console.error('[POST /api/guest/programme-enrolments] session lookup failed:', sessionError)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    const today = todayISO()
    const usable = (sessionRows ?? []).filter(
      (s) => s.status === 'scheduled' && s.session_date >= today,
    )
    // Every requested id must resolve to a usable session — otherwise the page is
    // stale or the body was tampered with.
    if (usable.length !== input.selectedSessionIds.length) {
      return NextResponse.json({ error: 'invalid_sessions' }, { status: 409 })
    }

    validSessions = usable.map((s) => ({ id: s.id, price_pence: pricePer }))
    sessionsPaidFor = validSessions.length
    coachAmountPence = pricePer * validSessions.length
  } else {
    const blockPrice = programme.block_price_pence
    if (blockPrice === null || blockPrice <= 0) return badRequest('block_price_unavailable')
    coachAmountPence = blockPrice
    sessionsPaidFor = programme.block_session_count ?? null
  }

  // 5. Commission + total (BR-01/BR-02) — rate from platform_config, never hardcoded.
  const { data: config, error: configError } = await supabase
    .from('platform_config')
    .select('default_commission_rate')
    .limit(1)
    .single()

  if (configError || !config) {
    console.error('[POST /api/guest/programme-enrolments] platform_config lookup failed:', configError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const commissionRate = Number(config.default_commission_rate)
  // Guard against a non-numeric rate — NaN would propagate into the Stripe amount.
  if (!Number.isFinite(commissionRate) || commissionRate < 0) {
    console.error('[POST /api/guest/programme-enrolments] invalid commission rate:', config.default_commission_rate)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  const { commissionPence, parentTotalPence } = computeBookingTotals(coachAmountPence, commissionRate)
  const currency = programme.currency || 'GBP'

  // 6. Capacity: soft check now (avoids obvious oversell); the authoritative
  //    atomic guard runs at confirm via increment_programme_spots() (S0 decision 3).
  if (programme.current_spots >= programme.max_spots) {
    return NextResponse.json({ error: 'spots_taken' }, { status: 409 })
  }

  // 7. Create the provisional user (mirrors /api/guest/bookings).
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
    console.error('[POST /api/guest/programme-enrolments] provisional user insert failed:', profileError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const softDeleteProfile = async (): Promise<void> => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', profile.id)
    if (error) console.error('[POST /api/guest/programme-enrolments] rollback profile soft-delete failed:', error)
  }

  // 8. Create the enrolment in payment_status='pending'. The enrolment table has
  //    no deleted_at — rollback marks it failed/cancelled (soft, never hard DELETE).
  const reference = generateBookingReference(new Date().getUTCFullYear())

  const { data: enrolment, error: enrolmentError } = await supabase
    .from('group_programme_enrolments')
    .insert({
      programme_id: programme.id,
      booked_by_user_id: profile.id,
      child_profile_id: null,
      player_profile_id: null,
      payment_type: 'platform',
      payment_model: input.paymentType === 'block_upfront' ? 'block' : 'per_session',
      block_amount_pence: input.paymentType === 'block_upfront' ? coachAmountPence : null,
      sessions_paid_for: sessionsPaidFor,
      status: 'active',
      payment_status: 'pending',
      enrolment_reference: reference,
      coach_amount_pence: coachAmountPence,
      commission_pence: commissionPence,
      parent_total_pence: parentTotalPence,
      commission_rate: commissionRate,
      currency,
    })
    .select('id')
    .single()

  if (enrolmentError || !enrolment) {
    console.error('[POST /api/guest/programme-enrolments] enrolment insert failed:', enrolmentError)
    await softDeleteProfile()
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  const softFailEnrolment = async (): Promise<void> => {
    const { error } = await supabase
      .from('group_programme_enrolments')
      .update({ payment_status: 'failed', status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', enrolment.id)
    if (error) console.error('[POST /api/guest/programme-enrolments] rollback enrolment soft-fail failed:', error)
  }

  // 9. Per-session: record exactly which sessions were paid for (session-row level).
  if (input.paymentType === 'per_session') {
    const { error: sessionsInsertError } = await supabase
      .from('group_programme_enrolment_sessions')
      .insert(
        validSessions.map((s) => ({
          enrolment_id: enrolment.id,
          group_programme_session_id: s.id,
          price_pence: s.price_pence,
        })),
      )

    if (sessionsInsertError) {
      console.error('[POST /api/guest/programme-enrolments] enrolment sessions insert failed:', sessionsInsertError)
      await softFailEnrolment()
      await softDeleteProfile()
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
  }

  // 10. Create the Stripe PaymentIntent for the full parent total.
  const piKey = idempotencyKey ?? `guest-enrolment-${enrolment.id}`
  let paymentIntent: Stripe.PaymentIntent
  try {
    const stripe = getStripe()
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: parentTotalPence,
        currency: currency.toLowerCase(),
        // Card only — same wallet/Link suppression rationale as /api/guest/bookings.
        payment_method_types: ['card'],
        metadata: {
          enrolment_id: enrolment.id,
          enrolment_reference: reference,
          programme_id: programme.id,
          coach_id: input.coachId,
          // The guest email/name live nowhere else — stash them so the
          // payment_intent.succeeded webhook can send the confirmation.
          guest_email: input.guest.email,
          guest_name: input.guest.fullName,
        },
      },
      { idempotencyKey: piKey },
    )
  } catch (err) {
    console.error('[POST /api/guest/programme-enrolments] Stripe PaymentIntent creation failed:', err)
    await softFailEnrolment()
    await softDeleteProfile()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  if (!paymentIntent.client_secret) {
    console.error('[POST /api/guest/programme-enrolments] PaymentIntent has no client_secret')
    await softFailEnrolment()
    await softDeleteProfile()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  // 11. Persist the payment_intents audit row keyed on enrolment_id (booking_id
  //     stays null — the XOR CHECK from migration 033 enforces exactly one).
  const { error: piError } = await supabase.from('payment_intents').insert({
    enrolment_id: enrolment.id,
    stripe_payment_intent_id: paymentIntent.id,
    amount_pence: parentTotalPence,
    currency,
    status: 'pending',
    stripe_status: paymentIntent.status,
    application_fee_pence: commissionPence,
    coach_transfer_amount_pence: coachAmountPence,
    idempotency_key: piKey,
  })

  if (piError) {
    console.error('[POST /api/guest/programme-enrolments] payment_intents insert failed:', piError)
    try {
      await getStripe().paymentIntents.cancel(paymentIntent.id)
    } catch (cancelErr) {
      console.error('[POST /api/guest/programme-enrolments] failed to cancel orphaned PI:', cancelErr)
    }
    await softFailEnrolment()
    await softDeleteProfile()
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    enrolmentReference: reference,
    enrolmentId: enrolment.id,
  })
}
