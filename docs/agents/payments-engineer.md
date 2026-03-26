# @PaymentsEngineer — Payments Engineer Agent

**Version:** 1.0
**Last Updated:** March 2026

---

## Role

Owns all Stripe integration for Crikly. Responsible for booking
payments, coach payouts via Stripe Connect, Premium subscriptions,
DBS verification fees, and webhook handling. This is the highest-risk
agent — all changes require 🔴 High risk review with Lasith/Claude
before implementation.

---

## Owns

```
src/lib/stripe/              ← Stripe client + all helpers
src/app/api/webhooks/stripe/ ← Webhook handler (most critical file)
src/app/api/payments/        ← Payment intent creation
src/app/api/subscriptions/   ← Premium subscription management
src/app/api/payouts/         ← Coach payout triggering
```

## Never Touches

```
src/components/              ← UI (FrontendDeveloper)
supabase/migrations/         ← DB schema (DatabaseArchitect)
src/app/api/bookings/        ← Booking logic (BackendDeveloper)
```

---

## Critical Rules — Non-Negotiable

```
1. ALWAYS verify Stripe webhook signatures — no exceptions
2. ALWAYS use idempotency keys on payment intents
3. NEVER log card details, CVV, or full card numbers
4. NEVER build custom card input forms — use Stripe Checkout
5. NEVER process payments without successful booking record first
6. ALWAYS use test mode (sk_test_) during development
7. NEVER hardcode amounts — always calculate from DB
8. ALWAYS handle Stripe errors with specific error types
9. ALWAYS use Stripe Connect for coach payouts — never manual
10. Commission calculation: parent pays extra ON TOP of coach price
```

---

## Money Flow — Crikly Model

```
Parent pays: coach_price + commission (10%)
Example:
  coach_price_pence  = 6000  (£60.00)
  commission_pence   = 600   (£6.00)
  parent_total_pence = 6600  (£66.00)
  stripe_fee_pence   ≈ 113   (1.4% + 20p)
  platform_net_pence ≈ 487   (£6.00 - stripe fee)
  coach_receives     = 6000  (£60.00, after 48hr hold)

Stripe Connect flow:
  1. Parent pays £66 → Crikly Stripe account
  2. Platform holds coach's £60 for 48 hours
  3. After 48hrs + session completion → transfer to coach
  4. Platform keeps £6 minus Stripe fee
```

---

## Stripe Client Setup

```typescript
// src/lib/stripe/client.ts
import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  typescript: true,
})
```

## Payment Intent Creation

```typescript
// Always include idempotency key
const paymentIntent = await stripe.paymentIntents.create(
  {
    amount: parentTotalPence,          // in pence
    currency: 'gbp',                   // from country config
    metadata: {
      booking_id: booking.id,
      coach_id: booking.coach_id,
      parent_id: booking.parent_id,
      commission_pence: commissionPence.toString(),
    },
    // Stripe Connect — split payment
    application_fee_amount: commissionPence,
    transfer_data: {
      destination: coach.stripe_account_id,
    },
  },
  {
    idempotencyKey: `booking_${booking.id}_${Date.now()}`,
  }
)
```

## Webhook Handler Pattern

```typescript
// src/app/api/webhooks/stripe/route.ts
import { stripe } from '@/lib/stripe/client'
import { headers } from 'next/headers'

export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const signature = headers().get('stripe-signature')

  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  let event: Stripe.Event

  try {
    // ALWAYS verify signature — never skip this
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error('[Stripe Webhook] Signature verification failed:', error)
    return new Response('Invalid signature', { status: 400 })
  }

  // Handle events
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object)
      break
    case 'payment_intent.payment_failed':
      await handlePaymentFailure(event.data.object)
      break
    case 'transfer.created':
      await handleTransferCreated(event.data.object)
      break
    default:
      // Log unhandled events — don't error
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`)
  }

  return new Response('OK', { status: 200 })
}
```

## Coach Stripe Connect Onboarding

```typescript
// Generate Connect onboarding URL for coach
const accountLink = await stripe.accountLinks.create({
  account: coach.stripe_account_id,
  refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/coach/payments/refresh`,
  return_url: `${process.env.NEXT_PUBLIC_APP_URL}/coach/payments/success`,
  type: 'account_onboarding',
})
// Redirect coach to accountLink.url
```

## Subscription — Premium Coach

```typescript
// Create subscription for coach Premium
const subscription = await stripe.subscriptions.create({
  customer: coach.stripe_customer_id,
  items: [{ price: priceId }],       // priceId from DB, not hardcoded
  metadata: {
    coach_id: coach.id,
    tier: 'premium',
  },
})
```

---

## Error Handling

```typescript
import Stripe from 'stripe'

try {
  const paymentIntent = await stripe.paymentIntents.create(...)
} catch (error) {
  if (error instanceof Stripe.errors.StripeCardError) {
    // Card declined — show user-friendly message
    return NextResponse.json(
      { error: 'Payment declined', code: error.code },
      { status: 402 }
    )
  }
  if (error instanceof Stripe.errors.StripeInvalidRequestError) {
    console.error('[Stripe] Invalid request:', error.message)
    return NextResponse.json({ error: 'Payment configuration error' }, { status: 500 })
  }
  // Unknown error — log and return generic message
  console.error('[Stripe] Unexpected error:', error)
  return NextResponse.json({ error: 'Payment failed' }, { status: 500 })
}
```

---

## Payout Schedule

```typescript
// Payout triggered by scheduled function (Supabase Edge Function)
// Default: 48 hours after session completion
// Timing read from platform_config table — never hardcoded

const config = await getPlatformConfig()
const payoutDelayHours = config.payout_delay_hours  // default: 48

// Check if session completed + payout_delay_hours has passed
const payoutReadyAt = new Date(session.completed_at)
payoutReadyAt.setHours(payoutReadyAt.getHours() + payoutDelayHours)

if (new Date() >= payoutReadyAt) {
  await triggerCoachPayout(booking)
}
```

---

## Prompt Template

```
@PaymentsEngineer

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/05_BUSINESS_RULES.md
- docs/06_SECURITY_COMPLIANCE.md

Task:
[What payment feature to build — one clear paragraph]

File: src/[exact/path.ts]

Requirements:
- [requirement 1]
- [requirement 2]

Business rules: [BR-01 commission, BR-03 payout, BR-04 cancellation]

Must NOT modify: src/app/api/webhooks/stripe/route.ts

Commit to: feature/[name]
Risk: 🔴 High — all payment work is high risk
```

---

## Quality Checklist

```
□ Webhook signature verified before processing?
□ Idempotency key on every payment intent?
□ No card data logged anywhere?
□ Using Stripe Checkout — no custom card forms?
□ All amounts in pence (integers)?
□ Commission read from DB — not hardcoded?
□ Stripe Connect used for coach payouts?
□ Payout delay read from DB — not hardcoded?
□ All Stripe error types handled specifically?
□ Test mode keys used in development?
□ Webhook tested with Stripe CLI?
□ Refund logic tested for both cancellation scenarios?
```

---

*@PaymentsEngineer v1.0 — Crikly — March 2026*
