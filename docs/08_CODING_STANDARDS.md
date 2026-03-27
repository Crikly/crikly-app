# Crikly — Coding Standards

**Version:** 1.0
**Last Updated:** March 2026

These standards apply to every line of code in this project.
No exceptions. No "I'll clean it up later."

---

## TypeScript — Non-Negotiable

Strict mode is ON. These rules apply everywhere:

```typescript
// NEVER — no any types
const data: any = response

// ALWAYS — explicit types
const data: BookingResponse = response

// NEVER — non-null assertion without good reason
const user = session!.user

// ALWAYS — null checks
if (!session?.user) return null

// NEVER — implicit return types on complex functions
async function createBooking(data) {

// ALWAYS — explicit return types
async function createBooking(data: CreateBookingInput): Promise<Booking> {
```

---

## Naming Conventions

```
Files:            kebab-case.ts        (coach-profile.tsx)
Components:       PascalCase           (CoachProfileCard)
Functions:        camelCase            (createBooking)
Constants:        UPPER_SNAKE_CASE     (MAX_GROUP_SIZE)
Types/Interfaces: PascalCase           (BookingStatus)
DB tables:        snake_case           (coach_profiles)
DB columns:       snake_case           (created_at)
Env vars:         UPPER_SNAKE_CASE     (STRIPE_SECRET_KEY)
API routes:       /api/kebab-case      (/api/coach-profiles)
Test files:       [name].test.ts       (calculate-commission.test.ts)
```

---

## Money — Always Integers

```typescript
// NEVER store as decimal
const price = 9.99

// ALWAYS store as pence (integer)
const price_pence = 999  // £9.99

// ALWAYS format for display via utility
import { formatCurrency } from '@/lib/utils/currency'
const display = formatCurrency(price_pence)  // → "£9.99"

// NEVER raw math in components
<span>£{price / 100}</span>  // ❌

// ALWAYS via utility
<span>{formatCurrency(price_pence)}</span>  // ✅
```

---

## React / Next.js Patterns

```typescript
// Server components are the default
// Only add 'use client' when needed:
// → useState or useEffect
// → Event handlers (onClick, onChange)
// → Browser APIs (localStorage, geolocation)

// ✅ Server component — default
export default async function CoachPage({ params }) {
  const coach = await getCoach(params.id)
  return <CoachProfile coach={coach} />
}

// ✅ Client component — only when needed
'use client'
export function BookingCalendar({ coachId }: { coachId: string }) {
  const [slot, setSlot] = useState<Slot | null>(null)
  // ...
}
```

---

## Styling

```typescript
// ALWAYS Tailwind utility classes
<div className="flex flex-col gap-4 p-6 bg-white rounded-xl">

// NEVER inline styles
<div style={{ display: 'flex', padding: '24px' }}>  // ❌

// NEVER custom CSS files for component styling
```

---

## Error Handling

```typescript
// NEVER silent errors
} catch (error) {
  console.log(error)  // ❌
}

// ALWAYS specific with context
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
```

---

## Database Rules

```
→ Every table has: id (uuid), created_at, updated_at
→ Every table has RLS enabled
→ Soft deletes: deleted_at timestamp — never hard DELETE
→ All prices in pence — never decimal
→ Currency stored as ISO code alongside every price
→ All timestamps in UTC
→ UUIDs for all primary keys — never sequential integers
→ Foreign keys always explicitly defined
→ Never edit existing migration files — always create new ones
```

---

## API Route Standards

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth check — ALWAYS first
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    // 2. Validate input with Zod
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // 3. Business logic
    const result = await doTheThing(parsed.data)

    // 4. Return typed response
    return NextResponse.json({ result }, { status: 201 })

  } catch (error) {
    console.error('[POST /api/route]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

---

## Git Commit Format

```
type(scope): short description

Types: feat | fix | chore | docs | refactor | test | style

Examples:
feat(coach): add availability template setup
fix(payments): prevent double commission on group bookings
chore(deps): update Stripe SDK to v15
docs(schema): add coach_photos table v1.2
test(bookings): add cancellation refund tests
```

---

## Quality Gate — Before Any Commit

```
□ TypeScript: zero errors (npx tsc --noEmit)
□ No any types introduced
□ No console.log in production code
□ Tests written and passing (npm test)
□ Relevant docs updated
□ .env.local not staged
□ Committing to correct branch (not main or staging)
□ Commit message follows convention
□ RLS policies in place for new DB tables
□ No secrets or API keys in code
□ Money stored as pence integers — never decimals
□ Business rules referenced in comments (BR-XX)
```

---

## data-testid Convention

Every interactive element needs a testid for E2E tests:

```typescript
// ✅ Always add on interactive elements
<button data-testid="book-button">Book Session</button>
<input data-testid="email-input" type="email" />
<div data-testid="booking-status">{status}</div>
<select data-testid="sport-filter">...</select>
```

---

## What Never Goes In Code

```
❌ Commission rates hardcoded (always read from DB)
❌ Feature flags hardcoded (always check feature_flags table)
❌ Sport names hardcoded (always reference sports table)
❌ Currency hardcoded as 'GBP' (always read from config)
❌ Tier limits hardcoded (always read from tier_features table)
❌ Card data touched or logged anywhere
❌ Sequential IDs (always UUIDs)
❌ console.log in production code
❌ Prices stored as decimals (always pence integers)
```

---

*Crikly Coding Standards v1.0 — March 2026*
*These apply to every line of code. No exceptions.*
