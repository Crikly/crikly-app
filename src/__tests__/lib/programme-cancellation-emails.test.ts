// STAGE1-CANCEL-OFFLINE (Decision T-21): the three programme-cancellation
// emails — envelope, the wording the decision pins down, money formatting,
// HTML escaping, and the never-throw / never-log-an-address contract.

jest.mock('@/lib/resend/client', () => ({
  getResend: jest.fn(),
}))

import { getResend } from '@/lib/resend/client'
import {
  sendProgrammeCancelledToParent,
  sendProgrammeCancelledToCoach,
  sendProgrammeCancelledToOps,
} from '@/lib/resend/send-programme-cancellation'

interface SentEmail {
  from: string
  to: string
  subject: string
  html: string
  replyTo?: string
}

type SendResult = { data: { id: string } | null; error: { name: string; message: string } | null }

function mockResend(results: Array<SendResult | 'throw'> = []) {
  const sent: SentEmail[] = []
  const queue = [...results]
  const send = jest.fn(async (payload: SentEmail): Promise<SendResult> => {
    sent.push(payload)
    const next = queue.shift()
    if (next === 'throw') throw new Error('network down for parent@example.com')
    return next ?? { data: { id: 'email-id' }, error: null }
  })
  ;(getResend as jest.Mock).mockReturnValue({ emails: { send } })
  return { sent, send }
}

let errorSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  errorSpy.mockRestore()
  jest.useRealTimers()
})

const parentParams = {
  parentEmail: 'parent@example.com',
  parentName: 'Priya',
  coachName: 'Coach Sam',
  programmeTitle: 'Summer Batting Camp',
  places: [
    { participantName: 'Yuwin', enrolmentReference: 'CRK-2026-0001', amountPaidPence: 6000, currency: 'GBP' },
  ],
}

describe('sendProgrammeCancelledToParent', () => {
  it('tells the parent the programme is cancelled and the coach arranges the refund', async () => {
    const { sent } = mockResend()

    const ok = await sendProgrammeCancelledToParent({ ...parentParams, replyTo: 'ops@example.com' })

    expect(ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].from).toBe('Crikly <hello@crikly.app>')
    expect(sent[0].to).toBe('parent@example.com')
    expect(sent[0].subject).toBe('Summer Batting Camp has been cancelled')
    expect(sent[0].replyTo).toBe('ops@example.com')
    expect(sent[0].html).toContain('Coach Sam has cancelled Summer Batting Camp')
    expect(sent[0].html).toContain('Coach Sam will arrange your refund with you directly')
    expect(sent[0].html).toContain('Crikly does not refund programme fees.')
    expect(sent[0].html).toContain('within 5 days')
    expect(sent[0].html).toContain('Yuwin (reference CRK-2026-0001): you paid £60.00')
  })

  it('omits Reply-To when no ops address is given', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToParent(parentParams)

    expect('replyTo' in sent[0]).toBe(false)
  })

  it('lists every place and copes with a missing name, reference or amount', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToParent({
      ...parentParams,
      places: [
        ...parentParams.places,
        { participantName: null, enrolmentReference: null, amountPaidPence: null, currency: 'GBP' },
      ],
    })

    expect(sent[0].html).toContain('Yuwin (reference CRK-2026-0001): you paid £60.00')
    expect(sent[0].html).toContain('>Your place</li>')
  })

  it('escapes user-supplied text', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToParent({
      ...parentParams,
      parentName: '<script>x</script>',
      programmeTitle: 'Bats & "Balls"',
    })

    expect(sent[0].html).not.toContain('<script>')
    expect(sent[0].html).toContain('&lt;script&gt;')
    expect(sent[0].html).toContain('Bats &amp; &quot;Balls&quot;')
    // The subject is plain text — not HTML-escaped.
    expect(sent[0].subject).toBe('Bats & "Balls" has been cancelled')
  })

  it('returns false and logs the error code only — never the message or address', async () => {
    mockResend([{ data: null, error: { name: 'validation_error', message: 'Invalid to: parent@example.com' } }])

    const ok = await sendProgrammeCancelledToParent(parentParams)

    expect(ok).toBe(false)
    const logged = errorSpy.mock.calls.flat().map(String).join(' ')
    expect(logged).toContain('validation_error')
    expect(logged).not.toContain('@')
  })

  it('never throws, and does not log the thrown message', async () => {
    mockResend(['throw'])

    await expect(sendProgrammeCancelledToParent(parentParams)).resolves.toBe(false)
    expect(errorSpy.mock.calls.flat().map(String).join(' ')).not.toContain('@')
  })

  it('retries exactly once when Resend rate-limits', async () => {
    jest.useFakeTimers()
    const { send } = mockResend([
      { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } },
      { data: { id: 'email-id' }, error: null },
    ])

    const pending = sendProgrammeCancelledToParent(parentParams)
    await jest.advanceTimersByTimeAsync(1200)

    await expect(pending).resolves.toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('gives up after one rate-limit retry', async () => {
    jest.useFakeTimers()
    const limited: SendResult = { data: null, error: { name: 'rate_limit_exceeded', message: 'Too many requests' } }
    const { send } = mockResend([limited, limited])

    const pending = sendProgrammeCancelledToParent(parentParams)
    await jest.advanceTimersByTimeAsync(1200)

    await expect(pending).resolves.toBe(false)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('sendProgrammeCancelledToCoach', () => {
  const coachParams = {
    coachEmail: 'coach@example.com',
    coachName: 'Sam',
    programmeTitle: 'Summer Batting Camp',
    parentCount: 2,
    rows: [
      { participantName: 'Yuwin', parentName: 'Priya Shah', parentEmail: 'priya@example.com', amountPaidPence: 6000, currency: 'GBP' },
      { participantName: 'Leo', parentName: 'Tom Reed', parentEmail: 'tom@example.com', amountPaidPence: 4550, currency: 'GBP' },
    ],
  }

  it('reminds the coach to refund directly and lists who, where and how much', async () => {
    const { sent } = mockResend()

    const ok = await sendProgrammeCancelledToCoach(coachParams)

    expect(ok).toBe(true)
    expect(sent[0].to).toBe('coach@example.com')
    expect(sent[0].subject).toBe('You cancelled Summer Batting Camp — please refund 2 parents')
    expect(sent[0].html).toContain('2 parents had already paid')
    expect(sent[0].html).toContain('Please refund each parent directly.')
    expect(sent[0].html).toContain('Crikly does not refund them.')
    expect(sent[0].html).toContain('priya@example.com')
    expect(sent[0].html).toContain('£60.00')
    expect(sent[0].html).toContain('£45.50')
    expect(sent[0].html).not.toContain('Not available')
  })

  it('uses the singular for one parent', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToCoach({ ...coachParams, parentCount: 1, rows: [coachParams.rows[0]] })

    expect(sent[0].subject).toBe('You cancelled Summer Batting Camp — please refund 1 parent')
    expect(sent[0].html).toContain('1 parent had already paid')
  })

  it('points the coach to support when a parent address is not available', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToCoach({
      ...coachParams,
      rows: [{ ...coachParams.rows[0], parentEmail: null }],
    })

    expect(sent[0].html).toContain('Not available')
    expect(sent[0].html).toContain('mailto:hello@crikly.app')
  })

  it('never throws', async () => {
    mockResend(['throw'])
    await expect(sendProgrammeCancelledToCoach(coachParams)).resolves.toBe(false)
  })
})

describe('sendProgrammeCancelledToOps', () => {
  const opsParams = {
    opsEmail: 'ops@example.com',
    coachName: 'Coach Sam',
    programmeTitle: 'Summer Batting Camp',
    programmeId: 'prog-1',
    cancelledOn: '14 Nov 2026',
    coachEmailSent: true,
    rows: [
      { enrolmentReference: 'CRK-2026-0001', parentName: 'Priya Shah', amountPaidPence: 6000, currency: 'GBP', paidOutToCoach: true, payoutStatus: 'paid', parentEmailOutcome: 'sent' as const },
      { enrolmentReference: 'CRK-2026-0002', parentName: 'Tom Reed', amountPaidPence: 4550, currency: 'GBP', paidOutToCoach: false, payoutStatus: null, parentEmailOutcome: 'failed' as const },
    ],
  }

  it('summarises the cancellation and flags the money Crikly still holds', async () => {
    const { sent } = mockResend()

    const ok = await sendProgrammeCancelledToOps(opsParams)

    expect(ok).toBe(true)
    expect(sent[0].from).toBe('Crikly Alerts <alerts@crikly.app>')
    expect(sent[0].to).toBe('ops@example.com')
    expect(sent[0].subject).toBe('[Crikly] Programme cancelled with paid enrolments — Summer Batting Camp')
    expect(sent[0].html).toContain('2 paid enrolments, £105.50 in total')
    expect(sent[0].html).toContain('Crikly still holds £45.50')
    expect(sent[0].html).toContain('NOT PAID OUT (no payout row)')
    expect(sent[0].html).toContain('FAILED')
    expect(sent[0].html).toContain('Coach reminder email: sent')
  })

  it('says Crikly holds nothing when every fee was paid out', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToOps({ ...opsParams, rows: [opsParams.rows[0]] })

    expect(sent[0].html).toContain('Crikly holds none of this money.')
    expect(sent[0].html).not.toContain('Action needed')
    expect(sent[0].html).toContain('1 paid enrolment, £60.00 in total')
  })

  it('flags a failed coach reminder', async () => {
    const { sent } = mockResend()

    await sendProgrammeCancelledToOps({ ...opsParams, coachEmailSent: false })

    expect(sent[0].html).toContain('contact the coach')
  })

  it('never throws', async () => {
    mockResend(['throw'])
    await expect(sendProgrammeCancelledToOps(opsParams)).resolves.toBe(false)
  })
})
