// BUG-79 — POST /api/parent/programme-enrolments
//
// Authed (signed-in parent) programme-enrolment checkout. Mirrors
// POST /api/parent/bookings in the same way POST /api/guest/programme-enrolments
// mirrors POST /api/guest/bookings: creates a payment_status='pending'
// enrolment attached to the parent's REAL user_profiles row and a Stripe
// PaymentIntent, then returns the client secret for the Payment Element. The
// Stripe webhook (payment_intent.succeeded) flips the enrolment to
// payment_status='succeeded' and claims the spot (BR-06).
//
// A SEPARATE endpoint from the guest route by design (same Lasith decision as
// /api/parent/bookings, 16 Aug): different auth context (RLS session vs
// provisional profile creation) and no guest-details handling. Price
// derivation, capacity and slot reservation are copied 1:1 from the guest
// route so the two cannot disagree on money.
//
// Security non-negotiables:
//   - Auth is checked with the RLS-respecting server client
//     (requireParentContext). No provisional user_profiles row is EVER
//     created here, and no rollback path touches user_profiles.
//   - Money writes use the service-role client (payment_intents is
//     service-role-only by RLS design); amounts are re-derived from
//     group_programmes / group_programme_sessions and commission is added
//     ON TOP (BR-01). Integer pence only (BR-10).
//   - No card data ever touches this route — Stripe Elements collects it.
//
// Confirmation email: the enrolment webhook path sends to
// intent.metadata.guest_email. For an authed enrolment those metadata values
// are filled from the SESSION (auth user email + profile full_name) — never
// from the client body — so the webhook/email system is untouched.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { parseSelectionList, type SlotSelection } from '@/lib/booking/slot-selection'
import { expandSessionBlocks } from '@/lib/availability/campSlots'
import { generateBookingReference, computeBookingTotals } from '@/lib/booking/guest-checkout'
import { requireParentContext } from '@/lib/auth/require-parent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOG = '[POST /api/parent/programme-enrolments]'

type PaymentType = 'per_session' | 'block_upfront'

interface ParentEnrolmentInput {
  coachId: string
  programmeId: string
  paymentType: PaymentType
  /** Deduped (sessionId, slotIndex) pairs — identity only, never price. */
  selections: SlotSelection[]
  /** Who the programme is for — REQUIRED (BUG-20 parity with the guest route). */
  participantName: string
  participantAge: number | null
  idempotencyToken: string | null
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 })
}

/** Narrow the untrusted JSON body to ParentEnrolmentInput. No `any`. */
function parseBody(raw: unknown): ParentEnrolmentInput | null {
  if (typeof raw !== 'object' || raw === null) return null
  const b = raw as Record<string, unknown>

  if (typeof b.coachId !== 'string' || b.coachId.length === 0) return null
  if (typeof b.programmeId !== 'string' || b.programmeId.length === 0) return null
  if (b.paymentType !== 'per_session' && b.paymentType !== 'block_upfront') return null

  let selections: SlotSelection[] = []
  if (b.paymentType === 'per_session') {
    if (!Array.isArray(b.selectedSessionIds) || b.selectedSessionIds.length === 0) return null
    if (!b.selectedSessionIds.every((s) => typeof s === 'string' && s.length > 0)) return null
    const parsed = parseSelectionList(b.selectedSessionIds as string[])
    if (!parsed || parsed.length === 0) return null
    selections = parsed
  }

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
    selections,
    participantName: b.participantName.trim(),
    participantAge,
    idempotencyToken: token,
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

  // 2. Auth — parent role + parent_profiles row, via the RLS-respecting
  //    server client (401/403/404 handled by the shared gate).
  const rls = await createClient()
  const { context, error: authError } = await requireParentContext(rls)
  if (authError) return authError

  const supabase = createAdminClient()

  // 2b. Idempotency: a retried submit returns the existing enrolment +
  //     PaymentIntent. The token is a client-chosen bearer, so the replay
  //     additionally requires the existing enrolment to belong to THIS user —
  //     a foreign token never fetches someone else's client secret; it just
  //     burns to a per-enrolment key.
  const idempotencyKey = input.idempotencyToken
    ? `parent-enrolment-${input.idempotencyToken}`
    : null
  let tokenKeyBurned = false
  if (idempotencyKey) {
    const { data: existingPi } = await supabase
      .from('payment_intents')
      .select('stripe_payment_intent_id, enrolment_id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingPi?.enrolment_id) {
      const { data: existingEnrolment } = await supabase
        .from('group_programme_enrolments')
        .select('enrolment_reference, booked_by_user_id')
        .eq('id', existingPi.enrolment_id)
        .maybeSingle()

      if (existingEnrolment && existingEnrolment.booked_by_user_id !== context.userProfile.id) {
        tokenKeyBurned = true
      } else if (existingEnrolment) {
        try {
          const pi = await getStripe().paymentIntents.retrieve(existingPi.stripe_payment_intent_id)
          if (pi.status === 'canceled') {
            tokenKeyBurned = true
          } else if (pi.client_secret) {
            return NextResponse.json({
              clientSecret: pi.client_secret,
              enrolmentReference: existingEnrolment.enrolment_reference,
              enrolmentId: existingPi.enrolment_id,
            })
          }
        } catch (err) {
          console.error(`${LOG} idempotent PI retrieve failed:`, err)
          tokenKeyBurned = true
        }
      }
    }
  }

  // 3. Confirm the coach is real and bookable.
  const { data: coach, error: coachError } = await supabase
    .from('coach_profiles')
    .select('id, is_profile_live, is_paused, is_suspended, deleted_at')
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

  // 4. Fetch the programme; it must be active and belong to this coach.
  const { data: programme, error: programmeError } = await supabase
    .from('group_programmes')
    .select(
      'id, coach_profile_id, payment_type, price_per_session_pence, block_price_pence, block_session_count, max_spots, current_spots, currency, status, deleted_at, camp_mode',
    )
    .eq('id', input.programmeId)
    .is('deleted_at', null)
    .maybeSingle()

  if (programmeError) {
    console.error(`${LOG} programme lookup failed:`, programmeError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  if (!programme || programme.status !== 'active' || programme.coach_profile_id !== input.coachId) {
    return NextResponse.json({ error: 'programme_unavailable' }, { status: 404 })
  }
  if (programme.payment_type !== input.paymentType) {
    return badRequest('payment_type_mismatch')
  }

  // 5. Re-derive the canonical COACH price server-side (never trust the
  //    client). Identical to the guest route — BUG-23 per-(session, slot)
  //    pricing; commission is added ON TOP in step 6.
  let coachAmountPence: number
  let sessionsPaidFor: number | null = null
  let validSelections: { sessionId: string; slotIndex: number; price_pence: number }[] = []

  if (input.paymentType === 'per_session') {
    const pricePer = programme.price_per_session_pence
    if (pricePer === null || pricePer <= 0) return badRequest('session_price_unavailable')

    const sessionIds = [...new Set(input.selections.map((s) => s.sessionId))]
    const { data: sessionRows, error: sessionError } = await supabase
      .from('group_programme_sessions')
      .select('id, session_date, status, start_time, end_time, slots')
      .eq('group_programme_id', programme.id)
      .in('id', sessionIds)

    if (sessionError) {
      console.error(`${LOG} session lookup failed:`, sessionError)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    const today = todayISO()
    const usableById = new Map(
      (sessionRows ?? [])
        .filter((s) => s.status === 'scheduled' && s.session_date >= today)
        .map((s) => [s.id, s]),
    )

    for (const sel of input.selections) {
      const session = usableById.get(sel.sessionId)
      if (!session) {
        return NextResponse.json({ error: 'invalid_sessions' }, { status: 409 })
      }
      const blockCount = programme.camp_mode
        ? Math.max(1, expandSessionBlocks(session).length)
        : 1
      if (sel.slotIndex >= blockCount) {
        return NextResponse.json({ error: 'invalid_sessions' }, { status: 409 })
      }
    }

    validSelections = input.selections.map((s) => ({
      sessionId: s.sessionId,
      slotIndex: s.slotIndex,
      price_pence: pricePer,
    }))
    sessionsPaidFor = validSelections.length
    coachAmountPence = pricePer * validSelections.length
  } else {
    if (programme.camp_mode) {
      return badRequest('camp_block_unsupported')
    }
    const blockPrice = programme.block_price_pence
    if (blockPrice === null || blockPrice <= 0) return badRequest('block_price_unavailable')
    coachAmountPence = blockPrice
    sessionsPaidFor = programme.block_session_count ?? null
  }

  // 6. Commission + total (BR-01/BR-02) — rate from platform_config, never hardcoded.
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
  if (!Number.isFinite(commissionRate) || commissionRate < 0) {
    console.error(`${LOG} invalid commission rate:`, config.default_commission_rate)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
  const { commissionPence, parentTotalPence } = computeBookingTotals(coachAmountPence, commissionRate)
  const currency = programme.currency || 'GBP'

  // 7. Capacity — same semantics as the guest route (camp = per-slot via
  //    reserve_camp_slot_sessions in step 9; non-camp = programme-level check).
  if (!programme.camp_mode && programme.current_spots >= programme.max_spots) {
    return NextResponse.json({ error: 'spots_taken' }, { status: 409 })
  }

  // 8. Create the enrolment in payment_status='pending', attached to the
  //    parent's REAL profile. No provisional user is created (BUG-79).
  //    child_profile_id stays null — child linking is P-12 scope.
  const reference = generateBookingReference(new Date().getUTCFullYear())

  const { data: enrolment, error: enrolmentError } = await supabase
    .from('group_programme_enrolments')
    .insert({
      programme_id: programme.id,
      booked_by_user_id: context.userProfile.id,
      child_profile_id: null,
      player_profile_id: null,
      payment_type: 'platform',
      payment_model: input.paymentType === 'block_upfront' ? 'block' : 'per_session',
      block_amount_pence: input.paymentType === 'block_upfront' ? coachAmountPence : null,
      sessions_paid_for: sessionsPaidFor,
      participant_name: input.participantName,
      participant_age: input.participantAge,
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
    console.error(`${LOG} enrolment insert failed:`, enrolmentError)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  // Rollback marks the enrolment failed/cancelled (soft, never hard DELETE).
  // user_profiles is NEVER touched — this is a real account.
  const softFailEnrolment = async (): Promise<void> => {
    const { error } = await supabase
      .from('group_programme_enrolments')
      .update({ payment_status: 'failed', status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', enrolment.id)
    if (error) console.error(`${LOG} rollback enrolment soft-fail failed:`, error)
  }

  // 9. Per-session: record exactly which (session, slot) pairs were paid for.
  if (input.paymentType === 'per_session') {
    if (programme.camp_mode) {
      const { data: reserveResult, error: reserveError } = await supabase.rpc(
        'reserve_camp_slot_sessions',
        {
          p_enrolment_id: enrolment.id,
          p_price_pence: validSelections[0]?.price_pence ?? 0,
          p_selections: validSelections.map((s) => ({
            sessionId: s.sessionId,
            slotIndex: s.slotIndex,
          })),
        },
      )

      if (reserveError) {
        console.error(`${LOG} slot reservation failed:`, reserveError)
        await softFailEnrolment()
        return NextResponse.json({ error: 'internal_error' }, { status: 500 })
      }

      const reserve = reserveResult as { ok: boolean; full?: { sessionId: string; slotIndex: number }[] }
      if (!reserve.ok) {
        await softFailEnrolment()
        return NextResponse.json(
          { error: 'slot_full', full: reserve.full ?? [] },
          { status: 409 },
        )
      }
    } else {
      const { error: sessionsInsertError } = await supabase
        .from('group_programme_enrolment_sessions')
        .insert(
          validSelections.map((s) => ({
            enrolment_id: enrolment.id,
            group_programme_session_id: s.sessionId,
            price_pence: s.price_pence,
          })),
        )

      if (sessionsInsertError) {
        console.error(`${LOG} enrolment sessions insert failed:`, sessionsInsertError)
        await softFailEnrolment()
        return NextResponse.json({ error: 'internal_error' }, { status: 500 })
      }
    }
  }

  // 10. Stripe PaymentIntent for the full parent total. Key prefers the
  //     client-stable token (retry reuses the intent); falls back to the
  //     enrolment UUID when absent or burned.
  const piKey =
    idempotencyKey && !tokenKeyBurned ? idempotencyKey : `parent-enrolment-${enrolment.id}`

  // Confirmation recipient — from the SESSION, never the client body. The
  // enrolment webhook reads guest_email/guest_name; filling them here keeps
  // the webhook + email system untouched.
  const { data: bookerProfile } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', context.userProfile.id)
    .maybeSingle()
  const recipientEmail = context.user.email ?? ''
  const recipientName = bookerProfile?.full_name ?? ''
  if (!recipientEmail) {
    // The enrolment webhook skips the email when guest_email is absent —
    // surface it here so a charged-but-unnotified parent is never silent.
    console.error(`${LOG} no session email for user profile ${context.userProfile.id}; confirmation email will not send`)
  }

  let paymentIntent: Stripe.PaymentIntent
  try {
    const stripe = getStripe()
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: parentTotalPence,
        currency: currency.toLowerCase(),
        payment_method_types: ['card'],
        metadata: {
          enrolment_id: enrolment.id,
          enrolment_reference: reference,
          programme_id: programme.id,
          coach_id: input.coachId,
          ...(recipientEmail ? { guest_email: recipientEmail } : {}),
          ...(recipientName ? { guest_name: recipientName } : {}),
          participant_name: input.participantName,
          ...(input.participantAge !== null
            ? { participant_age: String(input.participantAge) }
            : {}),
        },
      },
      { idempotencyKey: piKey },
    )
  } catch (err) {
    console.error(`${LOG} Stripe PaymentIntent creation failed:`, err)
    await softFailEnrolment()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  if (!paymentIntent.client_secret) {
    console.error(`${LOG} PaymentIntent has no client_secret`)
    await softFailEnrolment()
    return NextResponse.json({ error: 'payment_init_failed' }, { status: 502 })
  }

  // 11. Persist the payment_intents audit row keyed on enrolment_id.
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
    console.error(`${LOG} payment_intents insert failed:`, piError)
    try {
      await getStripe().paymentIntents.cancel(paymentIntent.id)
    } catch (cancelErr) {
      console.error(`${LOG} failed to cancel orphaned PI:`, cancelErr)
    }
    await softFailEnrolment()
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    enrolmentReference: reference,
    enrolmentId: enrolment.id,
  })
}
