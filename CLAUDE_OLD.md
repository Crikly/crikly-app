# Crikly — AI Development Context

**Version:** 1.1
**Last Updated:** March 2026
**Changed:** Fixed file locations, added coach requirements ref, added branch lifecycle rule
**Maintainer:** Lasith Jayarathne
**Read this file before every prompt. It is your briefing.**

---

## What Is Crikly?

Crikly is a three-sided sports coaching marketplace at **crikly.app**.
It connects parents and adult players with verified coaches for
instant booking and secure payment. Starting with cricket in the UK,
expanding to all sports and activities globally.

> "The Airbnb of sports coaching."

---

## The Three Users

| Role | Who | Books |
|---|---|---|
| Parent | Any parent with a child under 16 | Coach sessions for their child |
| Player | Adult 16+, self-managing | Coach sessions for themselves |
| Coach | Verified sports coach | Delivers sessions, gets paid |

Plus a **Super Admin** web panel for platform operators.

**Multi-role accounts:** One account can hold multiple roles.
A parent can also be a player. A coach can also be a parent.
Role switching is handled via a context switcher — Airbnb host/guest model.

---

## Tech Stack — Exact Versions

| Layer | Technology | Notes |
|---|---|---|
| Web App | Next.js 15 (App Router) | PWA — Phase 1 |
| Language | TypeScript — STRICT MODE | No `any`. Ever. |
| Styling | Tailwind CSS | Utility classes only |
| Database | Supabase (PostgreSQL) | Single source of truth |
| Auth | Supabase Auth | Email + social login |
| Storage | Supabase Storage | Coach photos, documents |
| Payments | Stripe Connect | Bookings + subscriptions + payouts |
| Email | Resend | Transactional email |
| Push | OneSignal | Real-time notifications |
| Hosting | Vercel | Auto-deploy on push to main |
| Mobile | Flutter (iOS + Android) | Phase 2 only |

**Supabase Project URL:** `https://gzehxfnlfogkhadejowo.supabase.co`
**Production Domain:** `https://crikly.app`
**GitHub Org:** `github.com/Crikly`
**Repo:** `github.com/Crikly/crikly-app`

---

## Repository Structure

```
crikly-app/
├── CLAUDE.md                    ← This file. Always keep updated.
├── AGENTS.md                    ← Agentic task orchestration guide
├── PRD.md                       ← Full product requirements
│
├── docs/
│   ├── 01_PROJECT_OVERVIEW.md
│   ├── 02_TECH_ARCHITECTURE.md
│   ├── 03_DATABASE_SCHEMA.md    ← Single source of truth for DB
│   ├── 04_API_REFERENCE.md
│   ├── 05_BUSINESS_RULES.md
│   ├── 06_SECURITY_COMPLIANCE.md
│   ├── 07_FUTURE_EXPANSION.md
│   ├── 08_CODING_STANDARDS.md
│   ├── 09_WORKING_ETHICS.md   ← moved to docs/
│   ├── 10_BUILD_PLAN.md
│   ├── 11_UX_PRINCIPLES.md
│   ├── 12_DESIGN_SYSTEM.md
│   ├── 13_SCREEN_FLOWS.md
│   ├── 14_COACH_REQUIREMENTS.md ← 78 coach requirements
│   └── agents/
│       ├── frontend-developer.md
│       ├── backend-developer.md
│       ├── database-architect.md
│       ├── payments-engineer.md
│       ├── devops-engineer.md
│       └── qa-engineer.md
│
├── src/
│   ├── app/                     ← Next.js App Router pages
│   │   ├── (auth)/              ← Auth routes (login, register)
│   │   ├── (parent)/            ← Parent-facing pages
│   │   ├── (player)/            ← Player-facing pages
│   │   ├── (coach)/             ← Coach-facing pages
│   │   ├── (admin)/             ← Super Admin panel
│   │   └── api/                 ← Next.js API routes
│   │       ├── auth/
│   │       ├── bookings/
│   │       ├── coaches/
│   │       ├── payments/
│   │       └── webhooks/
│   │           └── stripe/
│   │
│   ├── components/
│   │   ├── ui/                  ← Primitive UI components
│   │   ├── shared/              ← Shared across roles
│   │   ├── parent/              ← Parent-specific components
│   │   ├── player/              ← Player-specific components
│   │   ├── coach/               ← Coach-specific components
│   │   └── admin/               ← Admin-specific components
│   │
│   ├── lib/
│   │   ├── supabase/            ← Supabase client + server instances
│   │   ├── stripe/              ← Stripe client + helpers
│   │   ├── resend/              ← Email sending functions
│   │   └── utils/               ← Shared utility functions
│   │
│   ├── hooks/                   ← Custom React hooks
│   ├── types/                   ← TypeScript type definitions
│   │   ├── database.ts          ← Generated from Supabase schema
│   │   ├── api.ts               ← API request/response types
│   │   └── domain.ts            ← Domain model types
│   │
│   └── constants/               ← App-wide constants
│       ├── roles.ts
│       ├── routes.ts
│       └── config.ts
│
├── supabase/
│   ├── migrations/              ← Database migrations (never edit manually)
│   └── seed.sql                 ← Dev seed data
│
├── tests/
│   ├── unit/                    ← Unit tests
│   ├── integration/             ← API + DB integration tests
│   └── e2e/                     ← Playwright end-to-end tests
│
└── .env.local                   ← Never commit. See .env.example.
```

---

## Architecture Decisions

### Next.js App Router
Always use the App Router pattern — not Pages Router.

```
Server Components  → Default. Data fetching, no interactivity.
Client Components  → Only when needed ('use client' at top).
                     Interactivity, hooks, browser APIs only.
API Routes         → Business logic, Stripe, Supabase admin ops.
Server Actions     → Form submissions, mutations.
```

### Supabase Client Pattern
Two separate clients — never mix them up:

```typescript
// src/lib/supabase/client.ts — Browser (client components)
// Uses NEXT_PUBLIC_SUPABASE_ANON_KEY
// Respects Row Level Security (RLS)

// src/lib/supabase/server.ts — Server (API routes, server components)
// Uses SUPABASE_SERVICE_ROLE_KEY
// Bypasses RLS — use with extreme care
```

### API Routes Pattern
All business logic lives in API routes — never in client components.

```
src/app/api/bookings/route.ts      → GET list, POST create
src/app/api/bookings/[id]/route.ts → GET one, PATCH update, DELETE
```

### Row Level Security (RLS)
**Every Supabase table has RLS enabled. No exceptions.**
Security is enforced at the database level, not just the application level.

---

## TypeScript Rules — Non-Negotiable

```typescript
// tsconfig.json strict mode is ON. These rules apply:

// ❌ NEVER — no any types
const data: any = response

// ✅ ALWAYS — explicit types
const data: BookingResponse = response

// ❌ NEVER — non-null assertion without good reason
const user = session!.user

// ✅ ALWAYS — null checks
if (!session?.user) return null

// ❌ NEVER — implicit return types on complex functions
async function createBooking(data) {

// ✅ ALWAYS — explicit return types
async function createBooking(data: CreateBookingInput): Promise<Booking> {
```

---

## Naming Conventions

```
Files:          kebab-case.ts        (e.g. coach-profile.tsx)
Components:     PascalCase           (e.g. CoachProfileCard)
Functions:      camelCase            (e.g. createBooking)
Constants:      UPPER_SNAKE_CASE     (e.g. MAX_GROUP_SIZE)
Types/Interfaces: PascalCase         (e.g. BookingStatus)
DB tables:      snake_case           (e.g. coach_profiles)
DB columns:     snake_case           (e.g. created_at)
Env vars:       UPPER_SNAKE_CASE     (e.g. STRIPE_SECRET_KEY)
API routes:     /api/kebab-case      (e.g. /api/coach-profiles)
```

---

## Git Workflow

### Branch Strategy
```
main      → Production. Auto-deploys to crikly.app. Never commit directly.
staging   → Pre-production. Mirrors production for testing.
develop   → Integration branch. All features merge here first.
feature/* → One branch per feature (e.g. feature/coach-onboarding)
fix/*     → Bug fixes (e.g. fix/booking-double-charge)
chore/*   → Non-feature work (e.g. chore/update-deps)
```

### Commit Message Format
```
type(scope): short description

Types: feat | fix | chore | docs | refactor | test | style

Examples:
feat(coach): add availability template setup
fix(payments): prevent double charge on retry
chore(deps): update Stripe SDK to v15
docs(schema): add Training Passport tables
test(bookings): add cancellation refund tests
```

### PR Rules
```
feature/* → develop    (always — never directly to main)
develop   → staging    (for pre-release testing)
staging   → main       (for production release)

Every PR requires:
→ At least one reviewer (yourself on solo — review carefully)
→ All tests passing
→ No TypeScript errors
→ No console.logs left in code
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=          # Public — safe in browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Public — safe in browser
SUPABASE_SERVICE_ROLE_KEY=         # SECRET — server only, never expose

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # Public — safe in browser
STRIPE_SECRET_KEY=                  # SECRET — server only
STRIPE_WEBHOOK_SECRET=              # SECRET — server only

# App
NEXT_PUBLIC_APP_URL=https://crikly.app
```

**NEXT_PUBLIC_ prefix** → Available in browser (client components)
**No prefix** → Server only (API routes, server components)

---

## Business Rules — Always Apply

These rules must be enforced in code, not just documented:

```
BR-01: Commission is added ON TOP of coach price (not deducted from it)
       Parent pays: coach_price + (coach_price * commission_rate)
       Coach receives: coach_price (full amount)
       Platform earns: coach_price * commission_rate

BR-02: Default commission rate = 10% (admin configurable)

BR-03: Payout to coach = 48 hours after session completion
       (admin configurable — stored in platform_config table)

BR-04: Parent cancels BEFORE cancellation window → full refund
       Parent cancels WITHIN cancellation window → no refund
       Coach cancels ANY time → full refund to parent, coach earns nothing

BR-05: Default cancellation window = 24 hours before session
       (coach configurable per their profile)

BR-06: Bookings are AUTO-CONFIRMED — no coach approval needed
       Like booking a hotel — instant confirmation on payment

BR-07: Coach messaging parent → only after confirmed booking
       Parent messaging coach → only after confirmed booking

BR-08: Child medical notes → always visible to confirmed coach
       Training Passport → privacy controlled by parent/player

BR-09: Child turns 16 → automated transition flow to Player account
       30-day window → parent notified → child invited → passport migrated

BR-10: All prices stored with ISO currency code (GBP, LKR, USD)
       Phase 1 = GBP only. Multi-currency architecture from day one.
```

---

## Security & Compliance — Non-Negotiable

```
GDPR:     UK data protection law applies to all users
COPPA:    Enhanced protection for all child profiles (under 16)
PCI DSS:  Stripe handles ALL card data — never touch card numbers
RLS:      Every database table has Row Level Security enabled

Child data rules:
→ Child profiles only accessible by their parent account
→ Medical notes only visible to coaches with confirmed bookings
→ Child data never exposed in public API responses
→ Age verification enforced at registration for Player role (16+)

Payment rules:
→ Never log card details, CVV, or full card numbers
→ Always use Stripe's hosted checkout — never build card forms
→ Webhook signature verification on every Stripe webhook
→ Idempotency keys on all Stripe payment intents
```

---

## Supabase Database Rules

```
→ Every table has: id, created_at, updated_at
→ Every table has RLS enabled
→ Soft deletes preferred: deleted_at timestamp (not hard DELETE)
→ All prices stored as integers in pence (£9.99 = 999)
→ Currency stored as ISO code alongside every price
→ All timestamps in UTC
→ UUIDs for all primary keys (not sequential integers)
→ Foreign keys always explicitly defined
→ No orphaned records — referential integrity enforced
```

**Prices as integers:** Always store money as pence/cents (integer).
Never store as decimal/float. £9.99 → stored as `999`.
Display layer handles formatting.

---

## Multi-Sport & Multi-Country Design

Everything must be generic from day one:

```
✅ sports table → any sport is just a row (cricket, football, tennis)
✅ countries table → any country is configuration, not code
✅ currencies table → ISO codes, exchange rates configurable
✅ commission_rates → per country, per sport if needed
✅ subscription_tiers → fully configurable via admin panel
✅ feature_flags → every feature can be toggled without deployment

❌ Never hardcode sport names in business logic
❌ Never hardcode GBP — always reference currency from config
❌ Never hardcode commission rate — always read from platform_config
❌ Never hardcode feature availability — always check feature flags
```

---

## Feature Flags

All features are controlled via the `feature_flags` table in Supabase.
Check feature flags from the database — never hardcode feature availability.

```typescript
// Pattern for checking feature flags
const flag = await getFeatureFlag('training_passport')
if (!flag.enabled) return notFound()
```

---

## Subscription Tier Engine

Coach subscription tiers are fully configurable via the admin panel.
Never hardcode tier limits or features in application code.
Always read from `subscription_tiers` and `tier_features` tables.

```
Free tier limits → read from database, not hardcoded
Premium features → read from database, not hardcoded
New tiers        → created in admin panel, zero code changes
```

---

## Testing Standards

```
Unit tests:        Every utility function and business logic function
Integration tests: Every API route — happy path + error cases
E2E tests:         Critical user journeys only
                   → Parent books coach (happy path)
                   → Payment success and failure
                   → Coach cancellation + refund
                   → Child to player transition

Test files live next to the code they test:
src/lib/utils/calculate-commission.ts
src/lib/utils/calculate-commission.test.ts

E2E tests live in:
tests/e2e/parent-books-coach.spec.ts
```

---

## What To Always Do

```
✅ Read docs/03_DATABASE_SCHEMA.md before touching any database table
✅ Read docs/05_BUSINESS_RULES.md before implementing any payment logic
✅ Read docs/06_SECURITY_COMPLIANCE.md before handling any user data
✅ Check feature flags before implementing feature-gated functionality
✅ Add TypeScript types before writing implementation
✅ Write the test file alongside the implementation file
✅ Use server components by default — client components only when needed
✅ Store all money as integers (pence) never decimals
✅ Always verify Stripe webhook signatures
✅ Always use RLS-respecting Supabase client in browser contexts
```

## What To Never Do

```
❌ Never use `any` TypeScript type
❌ Never commit .env.local or any secrets
❌ Never bypass Row Level Security without documented justification
❌ Never store card details, even temporarily
❌ Never hardcode commission rates, feature limits, or sport names
❌ Never commit directly to main or staging branches
❌ Never delete database records — use soft deletes (deleted_at)
❌ Never store prices as decimals — always integers (pence)
❌ Never skip webhook signature verification
❌ Never expose SUPABASE_SERVICE_ROLE_KEY to browser code
❌ Never leave console.log in production code
❌ Never use sequential IDs — always UUIDs
❌ Never start a new feature branch without merging the 
   previous one to develop first
```

---

## Collaboration Model

```
LASITH (Product Lead)
  → Owns vision, priorities, and final decisions
  → Reviews and approves all outputs

CLAUDE (Strategic Partner — claude.ai chat)
  → Architecture decisions and design thinking
  → Generating and maintaining documentation
  → Debugging complex problems
  → Red flag escalation point

WINDSURF (Coding Environment)
  → Writing all actual code files
  → Following agent role instructions
  → Referencing docs/ for context
  → Committing and managing git workflow
```

Claude thinks and designs. Windsurf builds.

---

## Context Optimisation — How To Load Context

Load ONLY what is relevant. Never load everything.

```
Any task (always)            → CLAUDE.md + docs/09_WORKING_ETHICS.md
DB table or migration        → docs/03_DATABASE_SCHEMA.md
API route or business logic  → docs/03_DATABASE_SCHEMA.md + docs/05_BUSINESS_RULES.md
UI component or page         → docs/02_TECH_ARCHITECTURE.md (file structure only)
Payment or Stripe work       → docs/05_BUSINESS_RULES.md + docs/06_SECURITY_COMPLIANCE.md
Security-sensitive work      → docs/06_SECURITY_COMPLIANCE.md
New feature (any layer)      → PRD.md (relevant section only)
Multi-country expansion      → docs/07_FUTURE_EXPANSION.md
```

---

## Risk Classification

```
🟢 Low    → UI components, utilities, tests, docs
           → Auto-proceed

🟡 Medium → API routes, new DB columns, business logic
           → Review approach first

🔴 High   → Payments, auth, RLS, child data, DB restructure
           → STOP → Bring to Claude → Get approval → Then build
```

---

## Red Flags — Stop Windsurf, Come to Claude First

```
→ Any payment processing logic change
→ Any cancellation or refund flow change
→ Any child data access pattern change
→ Any RLS policy change
→ Any authentication change
→ Stripe webhook handler changes
→ DB migration modifying existing columns
→ Multi-role account switching logic
→ Commission rate or payout timing changes
→ Adding new npm dependencies
→ Anything architecturally significant
```

---

## Agent Files — Who Does What

When working on a specific layer, read the relevant agent file first:

| Working on | Read this agent file |
|---|---|
| UI components, pages | `docs/agents/frontend-developer.md` |
| API routes, business logic | `docs/agents/backend-developer.md` |
| Database tables, migrations | `docs/agents/database-architect.md` |
| Stripe, payments, payouts | `docs/agents/payments-engineer.md` |
| CI/CD, deployment, infra | `docs/agents/devops-engineer.md` |
| Tests, quality, coverage | `docs/agents/qa-engineer.md` |

---

## Documentation Versioning

Every doc file has a version header. When you update a doc, increment the version:

```markdown
**Version:** 1.2
**Last Updated:** March 2026
**Changed:** Added Training Passport privacy rules to Section 4
```

Changes to docs must be committed with:
```
docs(schema): add coach_availability_blocks table v1.2
```

---

## Current Build Status

See `docs/10_BUILD_PLAN.md` for the current task and phase.
Always check this file at the start of every session.

---

## Quick Reference — Key IDs & URLs

```
Supabase URL:     https://gzehxfnlfogkhadejowo.supabase.co
Production:       https://crikly.app
GitHub:           github.com/Crikly/crikly-app
Vercel Project:   vercel.com/lasith-projects/crikly-app
Stripe Dashboard: dashboard.stripe.com (Crikly sandbox)
```

---

*Crikly CLAUDE.md v1.1 — March 2026*
*Changed: Fixed file locations, added coach requirements ref, added branch lifecycle rule*
*Update this file whenever architecture decisions change.*
*Every AI prompt reads this. Keep it accurate.*
