// STAGE1-CANCEL-OFFLINE (Decision T-21): notifyProgrammeCancelled — who gets
// told when a programme with paid enrolments is cancelled, and the guarantees
// around it: read-only, never throws, one email per parent, guest addresses
// fetched read-only from Stripe and never logged.

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

jest.mock('@/lib/resend/send-programme-cancellation', () => ({
  sendProgrammeCancelledToParent: jest.fn(),
  sendProgrammeCancelledToCoach: jest.fn(),
  sendProgrammeCancelledToOps: jest.fn(),
}))

import { getStripe } from '@/lib/stripe/client'
import {
  sendProgrammeCancelledToParent,
  sendProgrammeCancelledToCoach,
  sendProgrammeCancelledToOps,
} from '@/lib/resend/send-programme-cancellation'
import { countPaidEnrolments, notifyProgrammeCancelled } from '@/lib/programmes/cancellation-notice'

const mockParent = sendProgrammeCancelledToParent as jest.Mock
const mockCoach = sendProgrammeCancelledToCoach as jest.Mock
const mockOps = sendProgrammeCancelledToOps as jest.Mock
const mockRetrieve = jest.fn()

type Row = Record<string, unknown>
type Result = { data?: unknown; error?: { message: string } | null; count?: number | null }

interface Fixture {
  enrolments?: Row[]
  enrolmentsError?: boolean
  bookers?: Row[]
  payouts?: Row[]
  payoutsError?: boolean
  intents?: Record<string, Row[]>
  authEmails?: Record<string, string | null>
  coachAuthUserId?: string | null
}

const WRITE_METHODS = ['insert', 'update', 'upsert', 'delete'] as const

function makeAdmin(fx: Fixture) {
  const writes: string[] = []
  const from = jest.fn((table: string) => {
    let enrolmentFilter: string | null = null
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'in', 'order', 'limit', 'neq', 'not']) {
      chain[m] = jest.fn(() => chain)
    }
    chain.eq = jest.fn((col: string, value: string) => {
      if (col === 'enrolment_id') enrolmentFilter = value
      return chain
    })
    for (const m of WRITE_METHODS) {
      chain[m] = jest.fn(() => {
        writes.push(`${table}.${m}`)
        return chain
      })
    }
    const list = (): Result => {
      if (table === 'group_programme_enrolments') {
        return fx.enrolmentsError
          ? { data: null, error: { message: 'boom' }, count: null }
          : { data: fx.enrolments ?? [], error: null, count: (fx.enrolments ?? []).length }
      }
      if (table === 'user_profiles') return { data: fx.bookers ?? [], error: null }
      if (table === 'payouts') {
        return fx.payoutsError
          ? { data: null, error: { message: 'boom' } }
          : { data: fx.payouts ?? [], error: null }
      }
      if (table === 'payment_intents') {
        return { data: fx.intents?.[enrolmentFilter ?? ''] ?? [], error: null }
      }
      return { data: [], error: null }
    }
    chain.maybeSingle = jest.fn(async (): Promise<Result> => {
      if (table === 'coach_profiles') {
        return { data: { display_name: 'Coach Sam', user_profile_id: 'coach-profile-user' }, error: null }
      }
      if (table === 'user_profiles') {
        return {
          data: {
            full_name: 'Sam Coach',
            auth_user_id: fx.coachAuthUserId === undefined ? 'auth-coach' : fx.coachAuthUserId,
          },
          error: null,
        }
      }
      return { data: null, error: null }
    })
    chain.then = (resolve: (r: Result) => void) => resolve(list())
    return chain
  })

  const getUserById = jest.fn(async (id: string) => {
    const emails: Record<string, string | null> = { 'auth-coach': 'coach@example.com', ...(fx.authEmails ?? {}) }
    const email = emails[id]
    return email ? { data: { user: { email } }, error: null } : { data: { user: null }, error: { message: 'not found' } }
  })

  const admin = { from, auth: { admin: { getUserById } } }
  return { admin: admin as unknown as Parameters<typeof notifyProgrammeCancelled>[0], writes, getUserById }
}

const input = { programmeId: 'prog-1', programmeTitle: 'Summer Batting Camp', coachProfileId: 'coach-uuid' }

function enrolment(over: Row): Row {
  return {
    id: 'enrol-1',
    enrolment_reference: 'CRK-2026-0001',
    participant_name: 'Yuwin',
    parent_total_pence: 6000,
    currency: 'GBP',
    booked_by_user_id: 'booker-1',
    ...over,
  }
}

let errorSpy: jest.SpyInstance
let infoSpy: jest.SpyInstance
const ORIGINAL_OPS = process.env.OPS_ALERT_EMAIL

beforeEach(() => {
  jest.clearAllMocks()
  ;(getStripe as jest.Mock).mockReturnValue({ paymentIntents: { retrieve: mockRetrieve } })
  mockParent.mockResolvedValue(true)
  mockCoach.mockResolvedValue(true)
  mockOps.mockResolvedValue(true)
  process.env.OPS_ALERT_EMAIL = 'ops@example.com'
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  errorSpy.mockRestore()
  infoSpy.mockRestore()
  if (ORIGINAL_OPS === undefined) delete process.env.OPS_ALERT_EMAIL
  else process.env.OPS_ALERT_EMAIL = ORIGINAL_OPS
})

/** Everything written to the console during the test, flattened to one string. */
function loggedText(): string {
  return [...errorSpy.mock.calls, ...infoSpy.mock.calls].flat().map(String).join(' ')
}

describe('countPaidEnrolments', () => {
  it('returns the count of platform-paid, succeeded, active enrolments', async () => {
    const { admin } = makeAdmin({ enrolments: [enrolment({}), enrolment({ id: 'enrol-2' })] })
    expect(await countPaidEnrolments(admin, 'prog-1')).toBe(2)
  })

  it('returns null (fail closed) when the count query errors', async () => {
    const { admin } = makeAdmin({ enrolmentsError: true })
    expect(await countPaidEnrolments(admin, 'prog-1')).toBeNull()
  })
})

describe('notifyProgrammeCancelled', () => {
  it('sends nothing when nobody has paid', async () => {
    const { admin } = makeAdmin({ enrolments: [] })

    const result = await notifyProgrammeCancelled(admin, input)

    expect(result.paidEnrolments).toBe(0)
    expect(mockParent).not.toHaveBeenCalled()
    expect(mockCoach).not.toHaveBeenCalled()
    expect(mockOps).not.toHaveBeenCalled()
  })

  it('emails an account-holding parent, the coach and ops once each — without calling Stripe', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
      payouts: [{ enrolment_id: 'enrol-1', status: 'paid' }],
    })

    const result = await notifyProgrammeCancelled(admin, input)

    expect(mockRetrieve).not.toHaveBeenCalled()
    expect(mockParent).toHaveBeenCalledTimes(1)
    expect(mockParent).toHaveBeenCalledWith({
      parentEmail: 'priya@example.com',
      parentName: 'Priya Shah',
      coachName: 'Coach Sam',
      programmeTitle: 'Summer Batting Camp',
      places: [
        { participantName: 'Yuwin', enrolmentReference: 'CRK-2026-0001', amountPaidPence: 6000, currency: 'GBP' },
      ],
      replyTo: 'ops@example.com',
    })
    expect(mockCoach).toHaveBeenCalledTimes(1)
    expect(mockCoach.mock.calls[0][0]).toMatchObject({
      coachEmail: 'coach@example.com',
      parentCount: 1,
      rows: [
        { participantName: 'Yuwin', parentName: 'Priya Shah', parentEmail: 'priya@example.com', amountPaidPence: 6000 },
      ],
    })
    expect(mockOps).toHaveBeenCalledTimes(1)
    expect(mockOps.mock.calls[0][0]).toMatchObject({
      opsEmail: 'ops@example.com',
      coachEmailSent: true,
      rows: [{ paidOutToCoach: true, payoutStatus: 'paid', parentEmailOutcome: 'sent' }],
    })
    expect(result).toMatchObject({ paidEnrolments: 1, parentEmailsSent: 1, coachEmailSent: true, opsEmailSent: true })
  })

  it('reads a guest parent address from Stripe metadata (read-only retrieve)', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Guest Parent', auth_user_id: null }],
      intents: { 'enrol-1': [{ stripe_payment_intent_id: 'pi_123', status: 'succeeded' }] },
    })
    mockRetrieve.mockResolvedValue({ metadata: { guest_email: 'guest@example.com', guest_name: 'G Parent' } })

    await notifyProgrammeCancelled(admin, input)

    expect(mockRetrieve).toHaveBeenCalledTimes(1)
    expect(mockRetrieve).toHaveBeenCalledWith('pi_123')
    expect(mockParent.mock.calls[0][0]).toMatchObject({ parentEmail: 'guest@example.com', parentName: 'Guest Parent' })
  })

  it('sends one email to a parent with two children, listing both places', async () => {
    const { admin } = makeAdmin({
      enrolments: [
        enrolment({}),
        enrolment({ id: 'enrol-2', enrolment_reference: 'CRK-2026-0002', participant_name: 'Anya' }),
      ],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
    })

    await notifyProgrammeCancelled(admin, input)

    expect(mockParent).toHaveBeenCalledTimes(1)
    expect(mockParent.mock.calls[0][0].places).toHaveLength(2)
    expect(mockCoach.mock.calls[0][0].parentCount).toBe(1)
    expect(mockCoach.mock.calls[0][0].rows).toHaveLength(2)
  })

  it('reports a failed parent send to ops and still emails everyone else', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({}), enrolment({ id: 'enrol-2', booked_by_user_id: 'booker-2' })],
      bookers: [
        { id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' },
        { id: 'booker-2', full_name: 'Tom Reed', auth_user_id: 'auth-tom' },
      ],
      authEmails: { 'auth-priya': 'priya@example.com', 'auth-tom': 'tom@example.com' },
    })
    mockParent.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const result = await notifyProgrammeCancelled(admin, input)

    expect(mockParent).toHaveBeenCalledTimes(2)
    expect(mockCoach).toHaveBeenCalledTimes(1)
    expect(mockOps.mock.calls[0][0].rows.map((r: Row) => r.parentEmailOutcome)).toEqual(['failed', 'sent'])
    expect(result).toMatchObject({ parentEmailsSent: 1, parentEmailsFailed: 1 })
  })

  it('flags fees Crikly still holds: no payout row, or a payout not yet paid', async () => {
    const { admin } = makeAdmin({
      enrolments: [
        enrolment({}),
        enrolment({ id: 'enrol-2', booked_by_user_id: 'booker-1' }),
        enrolment({ id: 'enrol-3', booked_by_user_id: 'booker-1' }),
      ],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
      payouts: [
        { enrolment_id: 'enrol-1', status: 'paid' },
        { enrolment_id: 'enrol-2', status: 'held' },
      ],
    })

    await notifyProgrammeCancelled(admin, input)

    expect(
      mockOps.mock.calls[0][0].rows.map((r: Row) => [r.paidOutToCoach, r.payoutStatus]),
    ).toEqual([[true, 'paid'], [false, 'held'], [false, null]])
  })

  it('treats a failed payout lookup as not paid out (conservative)', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
      payoutsError: true,
    })

    await notifyProgrammeCancelled(admin, input)

    expect(mockOps.mock.calls[0][0].rows[0]).toMatchObject({ paidOutToCoach: false, payoutStatus: 'lookup failed' })
  })

  it('lists a parent with no findable address for ops and the coach instead of emailing them', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Guest Parent', auth_user_id: null }],
      intents: {},
    })

    const result = await notifyProgrammeCancelled(admin, input)

    expect(mockParent).not.toHaveBeenCalled()
    expect(mockCoach.mock.calls[0][0].rows[0].parentEmail).toBeNull()
    expect(mockCoach.mock.calls[0][0].parentCount).toBe(1)
    expect(mockOps.mock.calls[0][0].rows[0].parentEmailOutcome).toBe('no_address')
    expect(result.parentsWithoutAddress).toBe(1)
  })

  it('survives a Stripe failure: no address for that parent, others unaffected', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Guest Parent', auth_user_id: null }],
      intents: { 'enrol-1': [{ stripe_payment_intent_id: 'pi_123', status: 'succeeded' }] },
    })
    mockRetrieve.mockRejectedValue(new Error('stripe down'))

    const result = await notifyProgrammeCancelled(admin, input)

    expect(result.parentsWithoutAddress).toBe(1)
    expect(mockCoach).toHaveBeenCalledTimes(1)
    expect(mockOps).toHaveBeenCalledTimes(1)
  })

  it('skips the ops copy and Reply-To when OPS_ALERT_EMAIL is unset, and logs loudly', async () => {
    delete process.env.OPS_ALERT_EMAIL
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
    })

    const result = await notifyProgrammeCancelled(admin, input)

    expect(mockOps).not.toHaveBeenCalled()
    expect(mockParent.mock.calls[0][0].replyTo).toBeUndefined()
    expect(result.opsEmailSent).toBe(false)
    expect(loggedText()).toContain('NEEDS ATTENTION')
  })

  it('still sends parent and ops emails when the coach has no address', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
      coachAuthUserId: null,
    })

    await notifyProgrammeCancelled(admin, input)

    expect(mockCoach).not.toHaveBeenCalled()
    expect(mockParent).toHaveBeenCalledTimes(1)
    expect(mockOps.mock.calls[0][0].coachEmailSent).toBe(false)
  })

  it('sends nothing and does not throw when the enrolments cannot be read', async () => {
    const { admin } = makeAdmin({ enrolmentsError: true })

    await expect(notifyProgrammeCancelled(admin, input)).resolves.toMatchObject({ paidEnrolments: 0 })
    expect(mockParent).not.toHaveBeenCalled()
  })

  it('never throws, even when a sender throws', async () => {
    const { admin } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Priya Shah', auth_user_id: 'auth-priya' }],
      authEmails: { 'auth-priya': 'priya@example.com' },
    })
    mockParent.mockRejectedValue(new Error('unexpected: priya@example.com'))

    await expect(notifyProgrammeCancelled(admin, input)).resolves.toMatchObject({ paidEnrolments: 0 })
  })

  it('never writes to any table', async () => {
    const { admin, writes } = makeAdmin({
      enrolments: [enrolment({})],
      bookers: [{ id: 'booker-1', full_name: 'Guest Parent', auth_user_id: null }],
      intents: { 'enrol-1': [{ stripe_payment_intent_id: 'pi_123', status: 'succeeded' }] },
      payouts: [{ enrolment_id: 'enrol-1', status: 'paid' }],
    })
    mockRetrieve.mockResolvedValue({ metadata: { guest_email: 'guest@example.com' } })

    await notifyProgrammeCancelled(admin, input)

    expect(writes).toEqual([])
  })

  it('never writes an email address to the logs', async () => {
    delete process.env.OPS_ALERT_EMAIL
    const { admin } = makeAdmin({
      enrolments: [enrolment({}), enrolment({ id: 'enrol-2', booked_by_user_id: 'booker-2' })],
      bookers: [
        { id: 'booker-1', full_name: 'Guest Parent', auth_user_id: null },
        { id: 'booker-2', full_name: 'Tom Reed', auth_user_id: 'auth-tom' },
      ],
      authEmails: { 'auth-tom': 'tom@example.com' },
      intents: { 'enrol-1': [{ stripe_payment_intent_id: 'pi_123', status: 'succeeded' }] },
      coachAuthUserId: null,
    })
    mockRetrieve.mockResolvedValue({ metadata: { guest_email: 'guest@example.com' } })
    mockParent.mockResolvedValue(false)

    await notifyProgrammeCancelled(admin, input)

    const logs = loggedText()
    expect(logs).not.toContain('@')
    expect(logs).toContain('NEEDS ATTENTION')
  })
})
