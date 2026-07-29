// Coach lifecycle email senders — envelope (from/to/subject), the parts of
// the body the specs pin down (CTA URLs, the plain approve link in Email B,
// the booking-confirmation template's hosted logo), and the never-throw
// contract every caller relies on (senders are fire-and-forget side effects
// of auth/profile/approve responses).

jest.mock('@/lib/resend/client', () => ({
  getResend: jest.fn(),
}))

import { getResend } from '@/lib/resend/client'
import {
  sendCoachWelcomeEmail,
  sendCoachUnderReviewEmail,
  sendCoachReviewNotification,
  sendCoachApprovedEmail,
} from '@/lib/resend/coach-lifecycle-emails'

type MockFn = jest.Mock

interface SentEmail {
  from: string
  to: string
  subject: string
  html: string
}

function mockResend(opts: { error?: { message: string }; throws?: boolean } = {}) {
  const sent: SentEmail[] = []
  const send = jest.fn(async (payload: SentEmail) => {
    if (opts.throws) throw new Error('network down')
    sent.push(payload)
    return { data: { id: 'email-id' }, error: opts.error ?? null }
  })
  ;(getResend as MockFn).mockReturnValue({ emails: { send } })
  return { sent, send }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('sendCoachWelcomeEmail (permanent)', () => {
  it('sends from hello@ with the spec subject and dashboard CTA', async () => {
    const { sent } = mockResend()

    const ok = await sendCoachWelcomeEmail({
      coachEmail: 'coach@example.com',
      coachName: 'Sam Coach',
      dashboardUrl: 'https://crikly.app/coach/dashboard',
    })

    expect(ok).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].from).toBe('Crikly <hello@crikly.app>')
    expect(sent[0].to).toBe('coach@example.com')
    expect(sent[0].subject).toBe('Welcome to Crikly — let’s get your profile ready')
    expect(sent[0].html).toContain('https://crikly.app/coach/dashboard')
    expect(sent[0].html).toContain('Go to your dashboard')
    // Booking-confirmation template: hosted logo with alt fallback.
    expect(sent[0].html).toContain('https://crikly.app/logo.png')
  })

  it('escapes HTML in the coach name', async () => {
    const { sent } = mockResend()

    await sendCoachWelcomeEmail({
      coachEmail: 'coach@example.com',
      coachName: '<script>alert(1)</script>',
      dashboardUrl: 'https://crikly.app/coach/dashboard',
    })

    expect(sent[0].html).not.toContain('<script>')
    expect(sent[0].html).toContain('&lt;script&gt;')
  })

  it('returns false (never throws) when Resend reports an error', async () => {
    mockResend({ error: { message: 'invalid recipient' } })
    await expect(
      sendCoachWelcomeEmail({
        coachEmail: 'coach@example.com',
        coachName: 'Sam',
        dashboardUrl: 'https://crikly.app/coach/dashboard',
      }),
    ).resolves.toBe(false)
  })

  it('returns false (never throws) when the send itself throws', async () => {
    mockResend({ throws: true })
    await expect(
      sendCoachWelcomeEmail({
        coachEmail: 'coach@example.com',
        coachName: 'Sam',
        dashboardUrl: 'https://crikly.app/coach/dashboard',
      }),
    ).resolves.toBe(false)
  })
})

describe('sendCoachUnderReviewEmail (PILOT Email A)', () => {
  it('sends to the coach with the spec subject and profile CTA', async () => {
    const { sent } = mockResend()

    const ok = await sendCoachUnderReviewEmail({
      coachEmail: 'coach@example.com',
      coachName: 'Sam Coach',
      profileUrl: 'https://crikly.app/coaches/sam-coach',
    })

    expect(ok).toBe(true)
    expect(sent[0].from).toBe('Crikly <hello@crikly.app>')
    expect(sent[0].to).toBe('coach@example.com')
    expect(sent[0].subject).toBe('Your Crikly profile is under review')
    expect(sent[0].html).toContain('https://crikly.app/coaches/sam-coach')
    expect(sent[0].html).toContain('View your profile')
    expect(sent[0].html).toContain('a few days')
  })

  it('returns false when the send throws', async () => {
    mockResend({ throws: true })
    await expect(
      sendCoachUnderReviewEmail({
        coachEmail: 'coach@example.com',
        coachName: 'Sam',
        profileUrl: 'https://crikly.app/coaches/sam',
      }),
    ).resolves.toBe(false)
  })
})

describe('sendCoachReviewNotification (PILOT Email B)', () => {
  const params = {
    coachName: 'Sam Coach',
    sports: ['Cricket', 'Tennis'],
    location: 'Leeds',
    profileUrl: 'https://crikly.app/coaches/sam-coach',
    approveUrl: 'https://crikly.app/api/admin/coaches/abc/approve?secret=s3cret',
  }

  it('sends to the review inbox with the coach name in the subject', async () => {
    const { sent } = mockResend()

    const ok = await sendCoachReviewNotification(params)

    expect(ok).toBe(true)
    expect(sent[0].to).toBe('hello@crikly.app')
    expect(sent[0].subject).toBe('New coach profile for review: Sam Coach')
    expect(sent[0].html).toContain('Cricket, Tennis')
    expect(sent[0].html).toContain('Leeds')
  })

  it('includes the Review profile CTA and the plain approve link below it', async () => {
    const { sent } = mockResend()

    await sendCoachReviewNotification(params)

    expect(sent[0].html).toContain('Review profile')
    expect(sent[0].html).toContain(params.profileUrl)
    // The approve URL appears as a visible plain link (href AND text).
    const approveOccurrences = sent[0].html.split(params.approveUrl).length - 1
    expect(approveOccurrences).toBeGreaterThanOrEqual(2)
  })

  it('falls back to "Not specified" for empty sports and null location', async () => {
    const { sent } = mockResend()

    await sendCoachReviewNotification({ ...params, sports: [], location: null })

    expect(sent[0].html).toContain('Not specified')
  })

  it('returns false when the send throws', async () => {
    mockResend({ throws: true })
    await expect(sendCoachReviewNotification(params)).resolves.toBe(false)
  })
})

describe('sendCoachApprovedEmail (PILOT Email C)', () => {
  it('sends to the coach with the 🎉 subject and the profile URL prominent', async () => {
    const { sent } = mockResend()

    const ok = await sendCoachApprovedEmail({
      coachEmail: 'coach@example.com',
      coachName: 'Sam Coach',
      profileUrl: 'https://crikly.app/coaches/sam-coach',
    })

    expect(ok).toBe(true)
    expect(sent[0].to).toBe('coach@example.com')
    expect(sent[0].subject).toBe('Your Crikly profile is live! 🎉')
    expect(sent[0].html).toContain('https://crikly.app/coaches/sam-coach')
    expect(sent[0].html).toContain('View your live profile')
    expect(sent[0].html).toContain('WhatsApp')
  })

  it('returns false when the send throws', async () => {
    mockResend({ throws: true })
    await expect(
      sendCoachApprovedEmail({
        coachEmail: 'coach@example.com',
        coachName: 'Sam',
        profileUrl: 'https://crikly.app/coaches/sam',
      }),
    ).resolves.toBe(false)
  })
})
