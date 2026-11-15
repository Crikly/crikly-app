// STAGE1-CANCEL-OFFLINE (Decision T-21, 14 Nov 2026): what happens around a
// coach cancelling a programme that parents have already paid for.
//
// READ-ONLY by design. This module never writes to any table and never moves
// money: enrolments, payouts, payment_status and Stripe objects are left
// exactly as they are, so the payout job, Earnings and the account-deletion
// guard behave as before. It only reads who paid and sends three emails.
//
// A "paid enrolment" is a platform-paid, payment-succeeded, still-active
// enrolment. Coach-added offline roster entries are excluded — Crikly took no
// money for them and holds no contact details.
//
// GUEST EMAILS: a guest's address exists nowhere in the database by design
// (P-00c-EMAIL) — it lives only in Stripe PaymentIntent metadata. For bookers
// with no account, one READ-ONLY paymentIntents.retrieve per enrolment fetches
// it at cancel time (approved, T-21 D1). The address is used to send and is
// then discarded: it is never stored and never logged.

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import {
  sendProgrammeCancelledToParent,
  sendProgrammeCancelledToCoach,
  sendProgrammeCancelledToOps,
  type CancelledPlace,
  type CoachRefundRow,
  type OpsEnrolmentRow,
} from '@/lib/resend/send-programme-cancellation'

type AdminClient = ReturnType<typeof createAdminClient>

const LOG = '[ProgrammeCancellation]'

/**
 * Counts the paid enrolments on a programme. Returns null when the count
 * could not be read — callers must fail closed (refuse the cancel) rather than
 * skip the coach's warning.
 */
export async function countPaidEnrolments(
  admin: AdminClient,
  programmeId: string,
): Promise<number | null> {
  const { count, error } = await admin
    .from('group_programme_enrolments')
    .select('id', { count: 'exact', head: true })
    .eq('programme_id', programmeId)
    .eq('payment_type', 'platform')
    .eq('payment_status', 'succeeded')
    .eq('status', 'active')

  if (error) {
    console.error(`${LOG} paid enrolment count failed for programme ${programmeId}:`, error.message)
    return null
  }
  return count ?? 0
}

interface PaidEnrolment {
  id: string
  enrolment_reference: string | null
  participant_name: string | null
  parent_total_pence: number | null
  currency: string
  booked_by_user_id: string
}

interface ResolvedParent {
  name: string | null
  email: string | null
}

function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Auth-account email for a profile, or null. Never logs the address. */
async function authEmail(admin: AdminClient, authUserId: string | null): Promise<string | null> {
  if (!authUserId) return null
  const { data, error } = await admin.auth.admin.getUserById(authUserId)
  if (error || !data?.user?.email) return null
  return data.user.email
}

/**
 * Guest fallback: reads guest_email / guest_name from the enrolment's
 * succeeded PaymentIntent. Read-only. Returns nulls on any failure.
 */
async function stripeGuestContact(
  admin: AdminClient,
  enrolmentId: string,
): Promise<ResolvedParent> {
  const { data: intents, error } = await admin
    .from('payment_intents')
    .select('stripe_payment_intent_id, status')
    .eq('enrolment_id', enrolmentId)
    .eq('status', 'succeeded')
    .limit(1)

  const intentId = intents?.[0]?.stripe_payment_intent_id
  if (error || !intentId) {
    console.error(`${LOG} no succeeded payment intent found for enrolment ${enrolmentId}`)
    return { name: null, email: null }
  }

  try {
    const intent = await getStripe().paymentIntents.retrieve(intentId)
    const email = intent.metadata?.guest_email
    const name = intent.metadata?.guest_name
    return {
      email: looksLikeEmail(email) ? email.trim() : null,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
    }
  } catch (err) {
    console.error(
      `${LOG} Stripe lookup failed for enrolment ${enrolmentId}: ${err instanceof Error ? err.name : 'unknown error'}`,
    )
    return { name: null, email: null }
  }
}

export interface ProgrammeCancelledNoticeInput {
  programmeId: string
  programmeTitle: string
  coachProfileId: string
}

export interface ProgrammeCancelledNoticeResult {
  paidEnrolments: number
  parentEmailsSent: number
  parentEmailsFailed: number
  parentsWithoutAddress: number
  coachEmailSent: boolean
  opsEmailSent: boolean
}

const NOTHING_SENT: ProgrammeCancelledNoticeResult = {
  paidEnrolments: 0,
  parentEmailsSent: 0,
  parentEmailsFailed: 0,
  parentsWithoutAddress: 0,
  coachEmailSent: false,
  opsEmailSent: false,
}

/**
 * Emails every paid parent, the coach and ops after a programme has been
 * cancelled. Call ONLY from the request that won the cancel (the route's
 * guarded status update) — that is what makes the emails send once.
 *
 * Never throws: the programme is already cancelled, and no email failure may
 * turn that into an error response. No-op when there are no paid enrolments.
 */
export async function notifyProgrammeCancelled(
  admin: AdminClient,
  input: ProgrammeCancelledNoticeInput,
): Promise<ProgrammeCancelledNoticeResult> {
  try {
    return await runNotice(admin, input)
  } catch (err) {
    console.error(
      `${LOG} notice failed for programme ${input.programmeId}: ${err instanceof Error ? err.name : 'unknown error'}`,
    )
    return NOTHING_SENT
  }
}

async function runNotice(
  admin: AdminClient,
  { programmeId, programmeTitle, coachProfileId }: ProgrammeCancelledNoticeInput,
): Promise<ProgrammeCancelledNoticeResult> {
  // 1. Paid enrolments — re-read AFTER the cancel so a parent who paid in the
  //    moments before it is still told.
  const { data: enrolmentRows, error: enrolmentsError } = await admin
    .from('group_programme_enrolments')
    .select('id, enrolment_reference, participant_name, parent_total_pence, currency, booked_by_user_id')
    .eq('programme_id', programmeId)
    .eq('payment_type', 'platform')
    .eq('payment_status', 'succeeded')
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (enrolmentsError) {
    console.error(
      `${LOG} programme ${programmeId} cancelled but paid enrolments could not be read — NO emails sent:`,
      enrolmentsError.message,
    )
    return NOTHING_SENT
  }
  const enrolments = (enrolmentRows ?? []) as PaidEnrolment[]
  if (enrolments.length === 0) return NOTHING_SENT

  const enrolmentIds = enrolments.map((e) => e.id)
  const bookerIds = [...new Set(enrolments.map((e) => e.booked_by_user_id))]

  // 2. Bookers, payout state and the coach — independent reads.
  const [bookersRes, payoutsRes, coachRes] = await Promise.all([
    admin.from('user_profiles').select('id, full_name, auth_user_id').in('id', bookerIds),
    admin.from('payouts').select('enrolment_id, status').in('enrolment_id', enrolmentIds),
    admin.from('coach_profiles').select('display_name, user_profile_id').eq('id', coachProfileId).maybeSingle(),
  ])

  if (bookersRes.error) console.error(`${LOG} booker lookup failed:`, bookersRes.error.message)
  if (payoutsRes.error) console.error(`${LOG} payout lookup failed:`, payoutsRes.error.message)

  const bookers = new Map((bookersRes.data ?? []).map((b) => [b.id, b]))

  // Payout state per enrolment. A failed lookup reads as "not paid out" — the
  // conservative side: ops is asked to check rather than told all is well.
  const payoutStatuses = new Map<string, string[]>()
  for (const p of payoutsRes.data ?? []) {
    if (!p.enrolment_id) continue
    payoutStatuses.set(p.enrolment_id, [...(payoutStatuses.get(p.enrolment_id) ?? []), p.status])
  }

  // 3. Coach name + address.
  let coachName = coachRes.data?.display_name ?? ''
  let coachEmail: string | null = null
  if (coachRes.data?.user_profile_id) {
    const { data: coachUser } = await admin
      .from('user_profiles')
      .select('full_name, auth_user_id')
      .eq('id', coachRes.data.user_profile_id)
      .maybeSingle()
    if (!coachName && coachUser?.full_name) coachName = coachUser.full_name
    coachEmail = await authEmail(admin, coachUser?.auth_user_id ?? null)
  }
  if (!coachName) coachName = 'your coach'

  // 4. Resolve each booker's contact: account email first, Stripe metadata
  //    (guests) second. One auth lookup per distinct booker.
  const accountEmails = new Map<string, string | null>()
  for (const bookerId of bookerIds) {
    accountEmails.set(bookerId, await authEmail(admin, bookers.get(bookerId)?.auth_user_id ?? null))
  }

  const contacts = new Map<string, ResolvedParent>()
  for (const enrolment of enrolments) {
    const profileName = bookers.get(enrolment.booked_by_user_id)?.full_name?.trim() || null
    const accountEmail = accountEmails.get(enrolment.booked_by_user_id) ?? null
    if (accountEmail) {
      contacts.set(enrolment.id, { name: profileName, email: accountEmail })
      continue
    }
    const guest = await stripeGuestContact(admin, enrolment.id)
    contacts.set(enrolment.id, { name: profileName ?? guest.name, email: guest.email })
  }

  // 5. One email per parent address, listing every place they paid for.
  const byAddress = new Map<string, { email: string; name: string | null; enrolmentIds: string[]; places: CancelledPlace[] }>()
  for (const enrolment of enrolments) {
    const contact = contacts.get(enrolment.id)
    if (!contact?.email) continue
    const key = contact.email.toLowerCase()
    const group = byAddress.get(key) ?? { email: contact.email, name: contact.name, enrolmentIds: [], places: [] }
    group.enrolmentIds.push(enrolment.id)
    group.places.push({
      participantName: enrolment.participant_name,
      enrolmentReference: enrolment.enrolment_reference,
      amountPaidPence: enrolment.parent_total_pence,
      currency: enrolment.currency,
    })
    byAddress.set(key, group)
  }

  const parentOutcome = new Map<string, OpsEnrolmentRow['parentEmailOutcome']>()
  let parentEmailsSent = 0
  let parentEmailsFailed = 0

  for (const group of byAddress.values()) {
    const sent = await sendProgrammeCancelledToParent({
      parentEmail: group.email,
      parentName: group.name ?? 'there',
      coachName,
      programmeTitle,
      places: group.places,
    })
    if (sent) parentEmailsSent += 1
    else parentEmailsFailed += 1
    for (const id of group.enrolmentIds) parentOutcome.set(id, sent ? 'sent' : 'failed')
  }

  const withoutAddress = enrolments.filter((e) => !contacts.get(e.id)?.email)
  const parentsWithoutAddress = withoutAddress.length

  // 6. Coach reminder — parent contact details for THIS programme only.
  const coachRows: CoachRefundRow[] = enrolments.map((e) => ({
    participantName: e.participant_name,
    parentName: contacts.get(e.id)?.name ?? 'Name not available',
    parentEmail: contacts.get(e.id)?.email ?? null,
    amountPaidPence: e.parent_total_pence,
    currency: e.currency,
  }))

  let coachEmailSent = false
  if (coachEmail) {
    coachEmailSent = await sendProgrammeCancelledToCoach({
      coachEmail,
      coachName,
      programmeTitle,
      parentCount: byAddress.size + parentsWithoutAddress,
      rows: coachRows,
    })
  } else {
    console.error(`${LOG} no email address for coach ${coachProfileId} — coach reminder not sent`)
  }

  // 7. Ops copy — last, so it can report what the other sends did.
  const opsRows: OpsEnrolmentRow[] = enrolments.map((e) => {
    const statuses = payoutStatuses.get(e.id) ?? []
    return {
      enrolmentReference: e.enrolment_reference,
      parentName: contacts.get(e.id)?.name ?? 'Name not available',
      amountPaidPence: e.parent_total_pence,
      currency: e.currency,
      paidOutToCoach: statuses.includes('paid'),
      payoutStatus: payoutsRes.error ? 'lookup failed' : (statuses[0] ?? null),
      parentEmailOutcome: parentOutcome.get(e.id) ?? 'no_address',
    }
  })
  const notPaidOut = opsRows.filter((r) => !r.paidOutToCoach).length

  // OPS_ALERT_EMAIL is the ops copy's recipient ONLY — never a Reply-To.
  const opsEmail = process.env.OPS_ALERT_EMAIL || undefined
  let opsEmailSent = false
  if (opsEmail) {
    opsEmailSent = await sendProgrammeCancelledToOps({
      opsEmail,
      coachName,
      programmeTitle,
      programmeId,
      cancelledOn: new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/London',
      }).format(new Date()),
      coachEmailSent,
      rows: opsRows,
    })
  }

  // The durable trace when the ops copy is unset or failed — ids and counts
  // only, never an address.
  const summary =
    `programme ${programmeId} cancelled with ${enrolments.length} paid enrolment(s): ` +
    `parent emails sent=${parentEmailsSent} failed=${parentEmailsFailed} no_address=${parentsWithoutAddress}; ` +
    `coach email ${coachEmailSent ? 'sent' : 'NOT sent'}; ops copy ${opsEmailSent ? 'sent' : 'NOT sent'}; ` +
    `not paid out to coach=${notPaidOut}`
  const needsAttention =
    !opsEmailSent || !coachEmailSent || parentEmailsFailed > 0 || parentsWithoutAddress > 0
  if (needsAttention) console.error(`${LOG} NEEDS ATTENTION — ${summary}`)
  else console.info(`${LOG} ${summary}`)

  return {
    paidEnrolments: enrolments.length,
    parentEmailsSent,
    parentEmailsFailed,
    parentsWithoutAddress,
    coachEmailSent,
    opsEmailSent,
  }
}
