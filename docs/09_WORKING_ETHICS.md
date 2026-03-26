# Crikly — Working Ethics & Collaboration Standards

**Version:** 1.0
**Last Updated:** March 2026
**Maintainer:** Lasith Jayarathne
**Review:** After each phase completion

This file lives in the project root and is referenced at the
start of every Windsurf session. Read it before every prompt.

---

## Collaboration Model

```
LASITH (Product Lead)
  → Owns vision, priorities, and final decisions
  → Brings domain knowledge and business requirements
  → Reviews and approves all outputs before merge
  → Makes product trade-off decisions

CLAUDE (Strategic Partner — this chat)
  → Architecture decisions and design thinking
  → Generating and maintaining project documentation
  → Reviewing approach and trade-off analysis
  → Debugging complex cross-cutting problems
  → Brainstorming solutions before implementation
  → Red flag escalation — stop Windsurf, bring here first

WINDSURF (Coding Environment — Agent Team)
  → Writing all actual code files
  → Following agent role instructions precisely
  → Referencing docs/ folder for context
  → Committing and managing git workflow
  → One agent, one task, one commit
```

**Rule:** Claude thinks and designs. Windsurf builds.
Never ask Windsurf to make architectural decisions.
Never ask Claude to write production code files.

---

## Session Flow

### Starting Every Windsurf Session

```
Step 1 → Open docs/09_BUILD_PLAN.md
         Find the first ⚪ or 🟡 task
         That is what you work on — no skipping

Step 2 → Identify which agent owns that task

Step 3 → Read the agent file: docs/agents/[agent].md

Step 4 → Send the prompt using the standard template below

Step 5 → Review output before accepting

Step 6 → Commit with correct message format

Step 7 → Mark task ✅ in BUILD_PLAN.md

Step 8 → Move to next task
```

### Standard Windsurf Prompt Template

```
@[AgentName]

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/[relevant doc 1]
- docs/[relevant doc 2]

Task:
[One clear paragraph describing exactly what to build]

File(s) to create or modify:
- src/[exact/file/path.ts]

Requirements:
- [requirement 1]
- [requirement 2]

Must NOT modify:
- [locked file if any]

Business rules to enforce:
- [BR-XX from docs/05_BUSINESS_RULES.md]

Commit to: feature/[name] branch
Risk: 🟢 Low | 🟡 Medium | 🔴 High
```

---

## Context Optimisation — Golden Rules

These rules exist to minimise context window consumption
and maximise the quality of every Windsurf prompt.

### Rule 1 — Always Load Context Files First
Never assume Windsurf remembers previous sessions.
Every prompt must explicitly reference relevant docs.
A prompt without context files will produce generic output.

### Rule 2 — One Agent, One Task
Do not ask multiple agents to work simultaneously.
Complete one task, commit, then move to the next.
Never combine frontend + backend in one prompt.

### Rule 3 — Be Explicit About File Paths
Always specify exact file paths.
```
❌ "update the coach file"
✅ "update src/app/(coach)/profile/page.tsx"
```

### Rule 4 — Specify the Branch Always
Every prompt must name the target branch.
Default is `feature/[feature-name]`. Never `main`.

### Rule 5 — State What NOT to Touch
Locked files must be explicitly named.
Windsurf must not infer what is safe to modify.

### Rule 6 — One Commit Per Logical Unit
Never bundle unrelated changes in one commit.
Commit message must reference agent and module.

### Rule 7 — Small Scope, High Quality
Break large tasks into small, testable units.
A task that touches more than 3 files needs splitting.
"Build the entire booking flow" → bad prompt.
"Build the BookingConfirmation component" → good prompt.

---

## Context File Loading Strategy

Load only what is relevant to the task.
Loading everything wastes context window.

```
Task type                    → Load these docs
─────────────────────────────────────────────────────────
Any task (always)            → CLAUDE.md + 09_WORKING_ETHICS.md
DB table or migration        → 03_DATABASE_SCHEMA.md
API route or business logic  → 03_DATABASE_SCHEMA.md + 05_BUSINESS_RULES.md
UI component or page         → 02_TECH_ARCHITECTURE.md (file structure section)
Payment or Stripe work       → 05_BUSINESS_RULES.md + 06_SECURITY_COMPLIANCE.md
Security-sensitive feature   → 06_SECURITY_COMPLIANCE.md
New feature (any layer)      → PRD.md (relevant section only)
Architecture decision        → 02_TECH_ARCHITECTURE.md
Testing                      → relevant agent file + implementation file
Multi-country expansion      → 07_FUTURE_EXPANSION.md
```

---

## Prompt Quality Checklist

Before sending any Windsurf prompt, verify:

```
□ Agent role specified (@AgentName)?
□ CLAUDE.md listed in context files?
□ 09_WORKING_ETHICS.md listed in context files?
□ Only relevant docs included (not everything)?
□ Task described in one clear paragraph?
□ Exact file paths specified?
□ Branch specified?
□ Locked files named if relevant?
□ Expected deliverable clear?
□ Risk level assigned?
□ Business rules referenced if payment/booking logic?
□ Security rules referenced if child data or payments?
```

---

## Risk Classification

Every task must have a risk level assigned.

```
🟢 Low Risk
   → Single file change
   → UI components, styling, copy
   → New utility functions
   → Adding tests
   → Documentation updates
   → Auto-proceed: implement directly

🟡 Medium Risk
   → API route changes
   → New database columns (additive only)
   → New business logic
   → Third-party integration changes
   → Review approach first, then implement

🔴 High Risk
   → Database schema restructuring
   → Payment flow changes
   → Authentication changes
   → Cancellation/refund logic
   → Child data handling changes
   → Multi-role account logic
   → STOP → Bring to Claude first → Get explicit approval → Then implement
```

---

## Red Flags — Stop Windsurf, Come to Claude First

Stop Windsurf immediately and bring to Claude if:

```
→ Any change to payment processing logic
→ Any change to cancellation or refund flow
→ Any change to child data access patterns
→ Any change to RLS (Row Level Security) policies
→ Any change to authentication or session handling
→ Stripe webhook handler changes
→ Database migration that modifies existing columns
→ Any change affecting multi-role account switching
→ Business rule changes (commission rates, payout timing)
→ Adding new external dependencies (npm packages)
→ Anything that feels architecturally significant
```

When in doubt — bring to Claude. It costs nothing.
Fixing a bad architectural decision costs weeks.

---

## Agent Responsibilities — Quick Reference

| Agent | Tag | Use For |
|---|---|---|
| Frontend Developer | `@FrontendDeveloper` | React components, pages, hooks, Tailwind UI |
| Backend Developer | `@BackendDeveloper` | API routes, business logic, server actions |
| Database Architect | `@DatabaseArchitect` | Supabase tables, migrations, RLS policies |
| Payments Engineer | `@PaymentsEngineer` | Stripe integration, webhooks, payouts |
| DevOps Engineer | `@DevOpsEngineer` | Vercel config, env vars, CI/CD, deployment |
| QA Engineer | `@QAEngineer` | Unit tests, integration tests, E2E tests |

---

## Standard Prompt Examples

### Database Task
```
@DatabaseArchitect

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/03_DATABASE_SCHEMA.md

Task:
Create the coach_profiles table migration. Coaches need a profile
separate from their user account that stores professional information,
sport offerings, location, and availability settings.

File: supabase/migrations/[timestamp]_create_coach_profiles.sql

Requirements:
- UUID primary key
- References auth.users
- Fields: bio, location, years_experience, stripe_account_id
- RLS: coaches can only read/write their own profile
- Soft delete using deleted_at

Must NOT modify: any existing migration files

Update docs/03_DATABASE_SCHEMA.md with the new table definition.

Commit to: feature/coach-onboarding
Risk: 🟡 Medium
```

### API Route Task
```
@BackendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/05_BUSINESS_RULES.md

Task:
Create the POST /api/bookings endpoint. When a parent selects a coach,
date, time and completes payment, this endpoint creates the booking
record and triggers the confirmation notification.

File: src/app/api/bookings/route.ts

Requirements:
- Validate parent is authenticated
- Validate coach slot is still available (prevent double booking)
- Create payment intent with Stripe before confirming booking
- Apply 10% commission using BR-01
- Return booking confirmation with reference number

Must NOT modify: src/app/api/payments/webhooks/stripe/route.ts

Business rules: BR-01 (commission), BR-06 (auto-confirm), BR-07 (messaging)

Commit to: feature/booking-flow
Risk: 🔴 High — payment logic involved
```

### Frontend Task
```
@FrontendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md

Task:
Build the CoachCard component for search results. Each card shows the
coach's photo, name, sport, location, price, rating, and a Book button.
Featured coaches should have a visual badge.

File: src/components/shared/CoachCard.tsx

Requirements:
- Props: coach (CoachProfile type), featured (boolean)
- Show DBS verified badge if coach.dbs_verified is true
- Show featured badge if featured prop is true
- Price displayed as formatted GBP (e.g. £60/hr)
- Rating shows star count + review count
- Book button links to /coach/[id]/book
- Tailwind only — no inline styles
- Mobile first — works on 320px+

Commit to: feature/coach-search
Risk: 🟢 Low
```

### Bug Fix
```
@BackendDeveloper

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md

Bug:
Parents are being charged the commission twice on group bookings.
The commission calculation is running once in the API route and
once in the Stripe webhook handler.

File: src/app/api/bookings/route.ts

Expected: Commission calculated once, at booking creation
Actual: Commission applied again when webhook confirms payment

Fix: Remove commission calculation from webhook handler.
     Commission must only be calculated in the booking API route.

Test to add: tests/integration/bookings/commission-calculation.test.ts

Commit to: fix/double-commission-charge
Risk: 🔴 High — payment logic
```

---

## Coding Standards

### TypeScript — Non-Negotiable
```typescript
// Strict mode is ON. These apply everywhere:

// ❌ Never
const data: any = response
const user = session!.user

// ✅ Always
const data: BookingResponse = response
if (!session?.user) return null

// ❌ Never — implicit return type
async function createBooking(data) {

// ✅ Always — explicit return type
async function createBooking(data: CreateBookingInput): Promise<Booking> {
```

### Money — Always Integers
```typescript
// ❌ Never store as decimal
const price = 9.99

// ✅ Always store as pence (integer)
const price_pence = 999  // £9.99

// Display formatting
const display = formatCurrency(price_pence) // → "£9.99"
```

### Supabase — Two Clients, Never Mixed
```typescript
// Browser (client components) — respects RLS
import { createClient } from '@/lib/supabase/client'

// Server (API routes, server components) — bypasses RLS
// Use with extreme care — only for admin operations
import { createClient } from '@/lib/supabase/server'
```

### Error Handling
```typescript
// ❌ Never silent
} catch (error) {
  console.log(error)
}

// ✅ Always specific with context
} catch (error) {
  if (error instanceof StripeError) {
    return NextResponse.json(
      { error: 'Payment failed', code: error.code },
      { status: 402 }
    )
  }
  throw new BookingError('Failed to create booking', { cause: error })
}
```

---

## Git Commit Format

```
type(scope): description

Types: feat | fix | chore | docs | refactor | test | style

feat(coach): add availability template setup
fix(payments): prevent double commission on group bookings
chore(deps): update Stripe SDK to v15
docs(schema): add training_passport table v1.2
test(bookings): add cancellation refund flow tests
refactor(auth): simplify multi-role context switcher
```

---

## Quality Gate — Before Any Commit

```
□ TypeScript: zero errors (npx tsc --noEmit)
□ No `any` types introduced
□ No console.log in production code
□ Tests written and passing (npm test)
□ Relevant docs updated (schema, API ref, business rules)
□ .env.local not staged (git status check)
□ Committing to correct branch (not main, not staging)
□ Commit message follows convention
□ RLS policies in place for any new DB tables
□ No secrets or keys in code
```

## Security Gate — Payments & Child Data

```
□ Read docs/06_SECURITY_COMPLIANCE.md fully
□ Stripe webhook signature verified
□ Idempotency keys on all payment intents
□ No card data touched or logged anywhere
□ Child data access limited to confirmed coaches only
□ RLS policies explicitly tested
□ No SUPABASE_SERVICE_ROLE_KEY in client-side code
□ All user inputs validated server-side
```

---

## Document Maintenance

When completing any task, update relevant docs in same commit:

| Task type | Update this doc |
|---|---|
| New DB table or column | `docs/03_DATABASE_SCHEMA.md` |
| New API route | `docs/04_API_REFERENCE.md` |
| New/changed business rule | `docs/05_BUSINESS_RULES.md` |
| New env variable | `docs/02_TECH_ARCHITECTURE.md` + `.env.example` |
| Feature completed | `docs/09_BUILD_PLAN.md` → mark ✅ |
| Architecture decision | `docs/02_TECH_ARCHITECTURE.md` |
| Security change | `docs/06_SECURITY_COMPLIANCE.md` |
| Future expansion impact | `docs/07_FUTURE_EXPANSION.md` |

Doc version format:
```markdown
**Version:** 1.2
**Last Updated:** March 2026
**Changed:** Added training_passport table in Section 4
```

---

*Crikly Working Ethics v1.0 — March 2026*
*Review after each phase completion.*
*Any process change must be agreed with Lasith first.*
