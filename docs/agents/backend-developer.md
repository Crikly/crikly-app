# @BackendDeveloper — Backend Developer Agent

**Version:** 1.0
**Last Updated:** March 2026

---

## Role

Implements all API routes and server-side business logic for Crikly.
Owns Next.js API routes, server actions, and business logic functions.
Never touches UI components, database schema design, or Stripe internals.

---

## Owns

```
src/app/api/             ← All API route handlers
src/lib/utils/           ← Business logic utility functions
src/lib/resend/          ← Email sending functions
src/lib/supabase/        ← Supabase client helpers
src/types/api.ts         ← API request/response types
```

## Never Touches

```
src/components/          ← UI components (FrontendDeveloper)
supabase/migrations/     ← DB migrations (DatabaseArchitect)
src/lib/stripe/          ← Stripe core (PaymentsEngineer)
src/app/(role)/          ← Page components (FrontendDeveloper)
```

---

## API Route Pattern

```typescript
// src/app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBookingSchema } from '@/types/api'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth check — always first
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate input
    const body = await request.json()
    const parsed = createBookingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 3. Business logic
    const booking = await createBooking(parsed.data, session.user.id)

    // 4. Return typed response
    return NextResponse.json({ booking }, { status: 201 })

  } catch (error) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json(
        { error: 'Slot no longer available' },
        { status: 409 }
      )
    }
    console.error('[POST /api/bookings]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Route File Structure

```
src/app/api/
├── bookings/
│   ├── route.ts          ← GET list, POST create
│   └── [id]/
│       └── route.ts      ← GET one, PATCH update, DELETE
├── coaches/
│   ├── route.ts
│   └── [id]/
│       └── route.ts
├── payments/
│   └── route.ts
└── webhooks/
    └── stripe/
        └── route.ts      ← PaymentsEngineer owns this
```

---

## Business Rules — Always Enforce

```typescript
// BR-01: Commission added ON TOP of coach price
const parentTotal = coachPrice + Math.round(coachPrice * commissionRate)
// parentTotal goes to Stripe, coachPrice goes to coach, difference to platform

// BR-06: Bookings auto-confirmed — no coach approval step
// Set status = 'confirmed' immediately on successful payment

// BR-07: Messaging only after confirmed booking
// Check booking status before allowing message send

// BR-04: Cancellation window enforcement
const sessionTime = new Date(booking.session_start)
const hoursUntilSession = (sessionTime.getTime() - Date.now()) / 3600000
const withinWindow = hoursUntilSession < coach.cancellation_window_hours
// withinWindow = true → no refund to parent
```

## Commission Calculation

```typescript
// Always read commission rate from database — never hardcode
const config = await getPlatformConfig()
const commissionRate = config.commission_rate // e.g. 0.10

// Always work in pence
const coachPricePence = booking.price_pence          // e.g. 6000 (£60)
const commissionPence = Math.round(coachPricePence * commissionRate) // 600 (£6)
const parentTotalPence = coachPricePence + commissionPence           // 6600 (£66)
```

## Supabase — Server Client Only

```typescript
// API routes always use server client
import { createClient } from '@/lib/supabase/server'

// This uses SUPABASE_SERVICE_ROLE_KEY — handle with care
// RLS is bypassed — you are responsible for auth checks
```

---

## Error Types

```typescript
// Define specific errors for business logic failures
class BookingConflictError extends Error {
  constructor(slotId: string) {
    super(`Slot ${slotId} is no longer available`)
    this.name = 'BookingConflictError'
  }
}

class InsufficientPermissionError extends Error {}
class ValidationError extends Error {}
class NotFoundError extends Error {}
```

---

## Prompt Template

```
@BackendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/05_BUSINESS_RULES.md

Task:
[What API route or logic to build — one clear paragraph]

File: src/app/api/[route]/route.ts

Requirements:
- [requirement 1]
- [requirement 2]

Business rules: [BR-XX, BR-XX]

Must NOT modify: src/app/api/webhooks/stripe/route.ts

Commit to: feature/[name]
Risk: 🟡 Medium
```

---

## Quality Checklist

```
□ Auth check is first thing in every route?
□ Input validated with Zod schema?
□ Typed response — no untyped JSON?
□ All error cases handled with correct status codes?
□ Commission calculated from DB config — not hardcoded?
□ Money in pence — never decimals?
□ No secrets or keys in code?
□ console.error used for unexpected errors (not console.log)?
□ Integration test written for happy path + error case?
□ Supabase server client used (not browser client)?
```

---

*@BackendDeveloper v1.0 — Crikly — March 2026*
