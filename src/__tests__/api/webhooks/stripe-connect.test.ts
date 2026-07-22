// Integration tests for POST /api/webhooks/stripe-connect
// (src/app/api/webhooks/stripe-connect/route.ts) — BUG-44.
//
// The Stripe SDK is mocked via @/lib/stripe/client. The raw body → signature
// verification chain is short-circuited by mocking stripe.webhooks.constructEvent
// to either return a fake event or throw.
//
// Rules covered:
//   Signature verified with STRIPE_CONNECT_WEBHOOK_SECRET — never
//     STRIPE_WEBHOOK_SECRET (the platform secret).
//   Signature failure → 400 (never 200, never triggers DB writes).
//   Missing secret env → 500 (misconfiguration must be loud).
//   account.updated → coach_profiles.stripe_onboarding_complete =
//     (charges_enabled && payouts_enabled), BIDIRECTIONAL (ruling A).
//   account.updated with no matching coach → 200, no crash.
//   account.updated DB error → 500 so Stripe redelivers (idempotent write).
//   transfer.* / payout.* → log-only: 200, zero DB writes (Block 0).
//   Unknown event type → 200, no crash, zero DB writes.

// ── Module mocks (must appear before any imports) ─────────────────────────────

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}))

jest.mock('@/lib/stripe/client', () => ({
  getStripe: jest.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe/client'
import { POST } from '@/app/api/webhooks/stripe-connect/route'

type MockFn = jest.Mock

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONNECT_ACCOUNT_ID = 'acct_test_bug44'
const CONNECT_SECRET = 'whsec_connect_test_placeholder'
const PLATFORM_SECRET = 'whsec_platform_test_placeholder'

function makeConnectEvent(type: string, object: Record<string, unknown>) {
  return {
    id: `evt_test_${type.replace(/\./g, '_')}`,
    type,
    account: CONNECT_ACCOUNT_ID,
    data: { object },
  }
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECT_ACCOUNT_ID,
    object: 'account',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    ...overrides,
  }
}

// ── coach_profiles update-chain mock ──────────────────────────────────────────
// Route shape: from('coach_profiles').update({...}).eq(col, val).select('id')

function makeCoachProfilesChain(result: { data?: unknown; error?: unknown } = { data: [{ id: 'coach-1' }] }) {
  const select = jest.fn().mockResolvedValue({
    data: result.data ?? null,
    error: result.error ?? null,
  })
  const eq = jest.fn().mockReturnValue({ select })
  const update = jest.fn().mockReturnValue({ eq })
  return { chain: { update }, update, eq, select }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWebhookRequest(rawBody: string, signature = 'valid-sig') {
  return new Request('http://localhost/api/webhooks/stripe-connect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: rawBody,
  })
}

async function callPost(rawBody: string, signature?: string) {
  return POST(makeWebhookRequest(rawBody, signature) as Parameters<typeof POST>[0])
}

/** Wires getStripe to return a constructEvent that yields the given event. */
function stubStripeEvent(event: unknown): MockFn {
  const constructEvent = jest.fn().mockReturnValue(event)
  ;(getStripe as MockFn).mockReturnValue({ webhooks: { constructEvent } })
  return constructEvent
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Provide env vars once at module level so lazy inits don't throw. The
// platform secret is DELIBERATELY different from the Connect secret so tests
// can prove which one the route hands to constructEvent.
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET
process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET
process.env.STRIPE_SECRET_KEY = 'sk_test_placeholder'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-placeholder'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET
  ;(getStripe as jest.Mock).mockReturnValue({
    webhooks: {
      constructEvent: jest.fn().mockImplementation(() => {
        throw new Error('Override constructEvent in your test')
      }),
    },
  })
  ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn() })
})

// ── Configuration ─────────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe-connect — configuration', () => {
  it('returns 500 when STRIPE_CONNECT_WEBHOOK_SECRET is not set', async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET

    const res = await callPost('{}')
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('Webhook not configured')
  })

  it('verifies the signature with the CONNECT secret, never the platform secret', async () => {
    const constructEvent = stubStripeEvent(makeConnectEvent('account.updated', makeAccount()))
    const { chain } = makeCoachProfilesChain()
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn().mockReturnValue(chain) })

    await callPost('{"type":"account.updated"}', 'sig-123')

    expect(constructEvent).toHaveBeenCalledWith('{"type":"account.updated"}', 'sig-123', CONNECT_SECRET)
    expect(constructEvent).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), PLATFORM_SECRET)
  })
})

// ── Signature verification ────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe-connect — signature verification', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    ;(getStripe as MockFn).mockReturnValue({ webhooks: { constructEvent: jest.fn() } })

    const req = new Request('http://localhost/api/webhooks/stripe-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // No stripe-signature header
      body: '{}',
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('Missing signature')
  })

  it('returns 400 when constructEvent throws (signature mismatch / forgery)', async () => {
    ;(getStripe as MockFn).mockReturnValue({
      webhooks: {
        constructEvent: jest.fn().mockImplementation(() => {
          throw new Error('No signatures found matching the expected signature')
        }),
      },
    })

    const res = await callPost('{"forged":"payload"}', 'bad-sig')
    expect(res.status).toBe(400)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('Invalid signature')
  })

  it('does NOT touch the DB when signature verification fails', async () => {
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })
    ;(getStripe as MockFn).mockReturnValue({
      webhooks: {
        constructEvent: jest.fn().mockImplementation(() => { throw new Error('sig fail') }),
      },
    })

    await callPost('{}', 'bad-sig')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── account.updated ───────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe-connect — account.updated', () => {
  it('sets stripe_onboarding_complete=true when charges and payouts are both enabled', async () => {
    stubStripeEvent(makeConnectEvent('account.updated', makeAccount()))
    const { chain, update, eq } = makeCoachProfilesChain()
    const mockFrom = jest.fn().mockReturnValue(chain)
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost('{"type":"account.updated"}')

    expect(res.status).toBe(200)
    expect(mockFrom).toHaveBeenCalledWith('coach_profiles')
    expect(update).toHaveBeenCalledWith({ stripe_onboarding_complete: true })
    expect(eq).toHaveBeenCalledWith('stripe_account_id', CONNECT_ACCOUNT_ID)
  })

  it('sets stripe_onboarding_complete=false when charges_enabled is false (bidirectional)', async () => {
    stubStripeEvent(makeConnectEvent('account.updated', makeAccount({ charges_enabled: false })))
    const { chain, update } = makeCoachProfilesChain()
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn().mockReturnValue(chain) })

    const res = await callPost('{"type":"account.updated"}')

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ stripe_onboarding_complete: false })
  })

  it('sets stripe_onboarding_complete=false when payouts_enabled is false (bidirectional)', async () => {
    stubStripeEvent(makeConnectEvent('account.updated', makeAccount({ payouts_enabled: false })))
    const { chain, update } = makeCoachProfilesChain()
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn().mockReturnValue(chain) })

    const res = await callPost('{"type":"account.updated"}')

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ stripe_onboarding_complete: false })
  })

  it('does NOT treat details_submitted alone as onboarding complete', async () => {
    stubStripeEvent(
      makeConnectEvent(
        'account.updated',
        makeAccount({ details_submitted: true, charges_enabled: false, payouts_enabled: false }),
      ),
    )
    const { chain, update } = makeCoachProfilesChain()
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn().mockReturnValue(chain) })

    const res = await callPost('{"type":"account.updated"}')

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ stripe_onboarding_complete: false })
  })

  it('returns 200 when no coach matches the stripe_account_id (env mismatch / soft-deleted)', async () => {
    stubStripeEvent(makeConnectEvent('account.updated', makeAccount()))
    const { chain } = makeCoachProfilesChain({ data: [] })
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn().mockReturnValue(chain) })

    const res = await callPost('{"type":"account.updated"}')
    expect(res.status).toBe(200)
  })

  it('returns 500 on DB failure so Stripe redelivers (idempotent write, retry-safe)', async () => {
    stubStripeEvent(makeConnectEvent('account.updated', makeAccount()))
    const { chain } = makeCoachProfilesChain({ data: null, error: { message: 'connection refused' } })
    ;(createAdminClient as MockFn).mockReturnValue({ from: jest.fn().mockReturnValue(chain) })

    const res = await callPost('{"type":"account.updated"}')
    expect(res.status).toBe(500)
    const data = await res.json() as Record<string, unknown>
    expect(data.error).toBe('Handler failed')
  })
})

// ── Log-only events (Block 0) ─────────────────────────────────────────────────

describe('POST /api/webhooks/stripe-connect — log-only transfer/payout events', () => {
  it.each([
    'transfer.created',
    'transfer.failed',
    'payout.created',
    'payout.paid',
    'payout.failed',
  ])('%s → 200 with zero DB writes', async (eventType) => {
    stubStripeEvent(makeConnectEvent(eventType, { id: `obj_${eventType.replace(/\./g, '_')}` }))
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost(`{"type":"${eventType}"}`)

    expect(res.status).toBe(200)
    const data = await res.json() as Record<string, unknown>
    expect(data.received).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── Unknown events ────────────────────────────────────────────────────────────

describe('POST /api/webhooks/stripe-connect — unknown event types', () => {
  it('returns 200 with zero DB writes for unsubscribed event types', async () => {
    stubStripeEvent(makeConnectEvent('capability.updated', { id: 'cap_123' }))
    const mockFrom = jest.fn()
    ;(createAdminClient as MockFn).mockReturnValue({ from: mockFrom })

    const res = await callPost('{"type":"capability.updated"}')

    expect(res.status).toBe(200)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
