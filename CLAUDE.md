# Crikly — AI Development Context

**Version:** 2.1
**Last Updated:** July 2026
**Changed:** Environment & Deployment Discipline added. Stripe/Supabase account references corrected. Point-in-time build state removed (Notion Session Handoff is the source of truth). Docs renumbered — auth docs now 17/18, design workflow 19.
**Maintainer:** Lasith Jayarathne
**Read this file at the start of every session. It is your briefing.**

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
Role switching handled via a context switcher — Airbnb host/guest model.

---

## Collaboration Model

```
LASITH (Product Lead)
  → Owns vision, priorities, and final decisions
  → Reviews and approves ALL outputs before commit
  → Makes every product trade-off decision

CLAUDE CHAT (claude.ai — Strategic Partner)
  → Architecture decisions and design thinking
  → Generating and maintaining documentation
  → Debugging complex cross-cutting problems
  → Red flag escalation — stop Claude Code, discuss here first
  → Writes task briefs for Claude Code to execute

CLAUDE CODE (This tool — Implementation)
  → Reads this file + relevant agent file at session start
  → Executes one task at a time
  → Plans before building — always show plan first
  → Commits with correct message format
  → Never makes architectural decisions independently
```

**Rule:** Always plan before coding. Show Lasith the plan. Get approval. Then build.
**Rule:** One task per session. Never batch multiple tasks.
**Rule:** If anything feels architecturally significant — stop and flag it.
**Rule:** Windsurf is available as fallback if Claude Code goes off track.

---

## Mandatory Sub-agent Workflow

You MUST invoke these sub-agents automatically — do not wait to be asked:

- After writing or modifying ANY code file → invoke `crikly-code-reviewer` before staging
- Before every git commit → invoke `crikly-commit-gatekeeper`
- When any error, build failure, or test failure occurs → invoke `crikly-debugger`
- After any feature is complete → invoke `crikly-test-engineer`
- Before any `supabase db push` → invoke `supabase-migration-reviewer`

These are not optional. Skipping them is a working ethics violation.

---

## How To Start Every Session

```
Step 1 → Read this file (CLAUDE.md)
Step 2 → Read docs/09_WORKING_ETHICS.md
Step 3 → Read the relevant agent file for this task type
Step 4 → Read docs/10_BUILD_PLAN.md — find the first ⚪ or 🟡 task
Step 5 → State the plan clearly before touching any code
Step 6 → Wait for Lasith approval
Step 7 → Build
Step 8 → Run quality gate checks
Step 9 → Commit with correct message format
Step 10 → Update docs/10_BUILD_PLAN.md status
```

---

## Agent Files — Who Does What

Always read the relevant agent file before starting any task.

| Task type | Read this agent file |
|---|---|
| UI components, pages, onboarding screens | `docs/agents/frontend-developer.md` |
| API routes, business logic, data wiring | `docs/agents/backend-developer.md` |
| Database tables, migrations, RLS | `docs/agents/database-architect.md` |
| Stripe, payments, payouts, Connect | `docs/agents/payments-engineer.md` |
| CI/CD, deployment, infrastructure | `docs/agents/devops-engineer.md` |
| Tests, quality gates, coverage | `docs/agents/qa-engineer.md` |
| Architecture, cross-cutting decisions | `docs/agents/tech-lead.md` |

---

## Tech Stack — Exact Versions

| Layer | Technology | Notes |
|---|---|---|
| Web App | Next.js 15 (App Router) | PWA — Phase 1 |
| Language | TypeScript — STRICT MODE | No `any`. Ever. |
| Styling | Tailwind CSS | Utility classes only. No inline styles. |
| Database | Supabase (PostgreSQL) | London region |
| Auth | Supabase Auth | Email + Google + Apple |
| Storage | Supabase Storage | Coach photos, documents |
| Payments | Stripe Connect | Bookings + payouts |
| Email | Resend | Transactional only |
| Push | OneSignal | Phase 1 notifications |
| Hosting | Vercel | Auto-deploy on push to main |
| Mobile | Flutter (iOS + Android) | Phase 2 only — not now |

**Node version:** Always use Node 20 LTS. Run `node --version` to verify.
**Supabase:** two projects — see Environment & Deployment Discipline below. Never confuse them.
- STAGING: `gzehxfnlfogkhadejowo` → `https://gzehxfnlfogkhadejowo.supabase.co` (staging.crikly.app)
- PRODUCTION: `smwvtaeivmqaldvrbycm` → `https://smwvtaeivmqaldvrbycm.supabase.co` (crikly.app)

**Production:** `https://crikly.app`
**GitHub:** `github.com/Crikly/crikly-app`

---

## Repository Structure

```
crikly-app/
├── CLAUDE.md                    ← This file. Read first every session.
├── AGENTS.md                    ← Agent orchestration guide
├── PRD.md                       ← Full product requirements
│
├── docs/
│   ├── 01_PROJECT_OVERVIEW.md
│   ├── 02_TECH_ARCHITECTURE.md
│   ├── 03_DATABASE_SCHEMA.md    ← Read before any DB work
│   ├── 04_API_REFERENCE.md
│   ├── 05_BUSINESS_RULES.md     ← Read before any payment/booking logic
│   ├── 06_SECURITY_COMPLIANCE.md← Read before any auth/child data work
│   ├── 07_FUTURE_EXPANSION.md
│   ├── 08_CODING_STANDARDS.md
│   ├── 09_WORKING_ETHICS.md     ← Read every session
│   ├── 10_BUILD_PLAN.md         ← Single source of truth for tasks
│   ├── 11_UX_PRINCIPLES.md      ← Read before any UI work
│   ├── 12_DESIGN_SYSTEM.md      ← Read before any UI work
│   ├── 13_SCREEN_FLOWS.md
│   ├── 14_COACH_REQUIREMENTS.md ← 78 coach requirements
│   ├── 15_PARENT_REQUIREMENTS.md ← 75 parent/player requirements
│   ├── 16_PARENT_IMPLEMENTATION_PLAN.md ← Parent module implementation plan
│   ├── 17_AUTH_SCREEN_SPECS.md  ← Auth screen specifications
│   ├── 18_AUTH_COMPONENT_ARCHITECTURE.md ← Auth component architecture
│   ├── 19_DESIGN_WORKFLOW.md    ← Figma/Claude Design/Windsurf workflow + colour tokens
│   └── agents/
│       ├── frontend-developer.md
│       ├── backend-developer.md
│       ├── database-architect.md
│       ├── payments-engineer.md
│       ├── devops-engineer.md
│       ├── qa-engineer.md
│       └── tech-lead.md
│
├── src/
│   ├── app/
│   │   ├── (auth)/              ← Auth routes
│   │   ├── coach/               ← Coach-facing pages (App Router)
│   │   │   ├── layout.tsx       ← Persistent sidebar + mobile nav
│   │   │   ├── onboarding/
│   │   │   │   └── layout.tsx   ← Overrides — no sidebar in onboarding
│   │   │   └── [screen]/
│   │   ├── (parent)/            ← Parent-facing pages
│   │   ├── (player)/            ← Player-facing pages
│   │   ├── (admin)/             ← Admin panel
│   │   └── api/                 ← API routes
│   │       ├── auth/
│   │       ├── bookings/
│   │       ├── coaches/
│   │       ├── payments/
│   │       └── webhooks/stripe/
│   │
│   ├── components/
│   │   ├── ui/                  ← Base components — never rebuild these
│   │   ├── shared/              ← Shared across roles
│   │   ├── coach/               ← Coach-specific components
│   │   │   ├── onboarding/      ← All onboarding step components
│   │   │   └── shared/          ← Shared coach components
│   │   ├── parent/
│   │   └── admin/
│   │
│   ├── lib/
│   │   ├── supabase/client.ts   ← Browser client (respects RLS)
│   │   ├── supabase/server.ts   ← Server client (bypasses RLS — careful)
│   │   ├── stripe/
│   │   ├── resend/
│   │   └── utils/
│   │
│   ├── hooks/
│   ├── types/
│   │   ├── database.ts          ← Generated from Supabase schema
│   │   ├── api.ts
│   │   └── domain.ts
│   └── constants/
│
├── supabase/
│   └── migrations/              ← Never edit existing files. Always new file.
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## Context Loading — What To Read Per Task Type

Never load everything. Load only what is relevant.

```
Every session (always)       → CLAUDE.md + docs/09_WORKING_ETHICS.md
UI component or screen       → docs/11_UX_PRINCIPLES.md + docs/12_DESIGN_SYSTEM.md
API route or data wiring     → docs/03_DATABASE_SCHEMA.md + docs/05_BUSINESS_RULES.md
Payment or Stripe work       → docs/05_BUSINESS_RULES.md + docs/06_SECURITY_COMPLIANCE.md
Database migration           → docs/03_DATABASE_SCHEMA.md
Security-sensitive work      → docs/06_SECURITY_COMPLIANCE.md
New feature                  → PRD.md (relevant section only)
Coach module work            → docs/14_COACH_REQUIREMENTS.md
Parent/player module work    → docs/15_PARENT_REQUIREMENTS.md + docs/16_PARENT_IMPLEMENTATION_PLAN.md
Auth screen work             → docs/17_AUTH_SCREEN_SPECS.md + docs/18_AUTH_COMPONENT_ARCHITECTURE.md
Design workflow / tokens     → docs/19_DESIGN_WORKFLOW.md
```

---

## Current Build State

This file does NOT hold point-in-time state — state in docs rots.

**Source of truth for current state** (active step, current branch, next
tasks, blocked tasks): the **Notion Session Handoff**. Read it at the
start of every session. Task list and statuses: `docs/10_BUILD_PLAN.md`.

---

## Architecture — Non-Negotiable Decisions

### App Router — Always
Server Components by default. Client components only when needed.

```
Server Component  → Data fetching, no interactivity (default)
Client Component  → Hooks, browser APIs, interactivity ('use client')
API Route         → Business logic, Stripe, Supabase admin ops
```

### Supabase — Two Clients, Never Mixed
```typescript
// Browser (client components) — respects RLS
import { createClient } from '@/lib/supabase/client'

// Server (API routes, server components) — bypasses RLS
// Use with extreme care — only when RLS cannot handle it
import { createClient } from '@/lib/supabase/server'
```

### Money — Always Integers
```typescript
// ❌ Never
const price = 9.99

// ✅ Always — store as pence
const price_pence = 999  // £9.99
```

### reactCompiler — Never
```typescript
// ❌ NEVER add this to next.config.ts — causes build hangs
reactCompiler: true
```

---

## Design System — Non-Negotiable

```
Font:           DM Sans only — already loaded in layout.tsx, never re-import
Primary colour: #0077CC (brand-600)
No hardcoded hex colours — use Tailwind tokens only
No hardcoded sizes — use design tokens
No inline styles
No emoji icons — use Lucide React only
One primary CTA per screen — never two at equal weight
```

Read `docs/12_DESIGN_SYSTEM.md` before writing any UI code.
Read `docs/11_UX_PRINCIPLES.md` before designing any screen flow.
Use components from `src/components/ui/` — never rebuild existing ones.

---

## TypeScript Rules

```typescript
// ❌ Never
const data: any = response
async function createBooking(data) {

// ✅ Always
const data: BookingResponse = response
async function createBooking(data: CreateBookingInput): Promise<Booking> {
if (!session?.user) return null
```

---

## Environment & Deployment Discipline — Absolute Rules

These rules are absolute. No exceptions, no "helpful" shortcuts.

### The environments

| Environment | Supabase project | URL | Git branch |
|---|---|---|---|
| LOCAL | Local Docker stack (`supabase start`) | localhost:3000 | feature/* fix/* docs/* → develop |
| STAGING | `gzehxfnlfogkhadejowo` | staging.crikly.app | staging |
| PRODUCTION | `smwvtaeivmqaldvrbycm` | crikly.app | main |

**Promotion path: LOCAL → STAGING → PRODUCTION. No skipping. Ever.**
Nothing reaches production that has not been validated on staging.
Nothing reaches staging that has not been validated locally.

### Ownership — Lasith is the SOLE owner of:

```
→ ALL git pushes (to any remote branch)
→ ALL merges to staging and main
→ ALL hosted database pushes (supabase db push against any hosted project)
→ ALL supabase link changes
→ ALL Vercel deployments
→ ALL hosted environment variables
```

Claude Code NEVER performs any of these on its own initiative — not to
"unblock", not to "verify", not because it seems obviously safe.

### Database rules

```
→ Task migrations are LOCAL ONLY: supabase db push --local
  (or supabase migration up). Never against a hosted project.
→ The CLI stays linked to STAGING (gzehxfnlfogkhadejowo) by default.
  Never relink without Lasith's instruction.
→ Before ANY Lasith-instructed hosted DB operation, Claude Code must
  first verify and STATE the linked project ref AND list every
  migration the push would apply (supabase migration list) — then wait
  for Lasith's confirmation.
```

### Stripe — the correct account

```
Account:   Tekly Solutions (acct_1TF06pPDhbWKSHdt)
CLI:       always pass --project-name tekly
```

⚠️ A stray account named "Crikly sandbox" exists and previously caused
silent webhook failures. It is the WRONG account. If any tool, key, or
dashboard resolves to anything other than Tekly Solutions
(`acct_1TF06pPDhbWKSHdt`), STOP and flag it to Lasith.

---

## Git Workflow

```
main      → Production. Never commit directly.
staging   → Pre-production. Never commit directly.
develop   → Integration branch. All features merge here.
feature/* → One branch per feature, opened from develop
fix/*     → Bug fixes, opened from develop
```

**Branch lifecycle rule:** Merge feature branch to develop before opening next branch.
Never let a feature branch live longer than one build step.

**Commit format:**
```
feat(coach): add search API with filters
fix(auth): create user_profiles on OAuth callback
docs(build-plan): mark CD-03 complete
chore(deps): update Stripe SDK
```

---

## Quality Gate — Before Every Commit

```
□ node --version shows v20.x.x
□ next.config.ts does NOT contain reactCompiler: true
□ npx tsc --noEmit passes — zero TypeScript errors
□ No `any` types introduced
□ No console.log in production code
□ Tests written and passing
□ Relevant docs updated
□ .env.local not staged
□ Committing to correct branch (not main, not staging)
□ API routes wired to real data — or explicitly marked STUB with follow-up task scheduled
□ RLS policies in place for any new DB tables
```

---

## Risk Classification

```
🟢 Low    → UI components, utilities, tests, docs
           → Plan + build in same session

🟡 Medium → API routes, new DB columns, business logic
           → State plan, wait for Lasith approval, then build

🔴 High   → Payments, auth, RLS, child data, DB restructure
           → STOP → Discuss in Claude chat first → Get explicit approval → Then build
```

---

## Red Flags — Stop and Discuss in Claude Chat First

```
→ Any payment processing logic change
→ Any cancellation or refund flow change
→ Any child data access pattern change
→ Any RLS policy change
→ Any authentication or session handling change
→ Stripe webhook handler changes
→ DB migration modifying existing columns
→ Multi-role account switching logic
→ Commission rate or payout timing changes
→ Adding new npm dependencies
→ Anything architecturally significant
→ reactCompiler: true appearing in next.config.ts
→ Node version is not 20 LTS
```

---

## Business Rules — Always Enforce

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

Full rules in `docs/05_BUSINESS_RULES.md`.

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
→ Never expose SUPABASE_SERVICE_ROLE_KEY to browser code
→ Never bypass RLS without documented justification
→ Never store prices as decimals
→ Never use sequential IDs — always UUIDs
→ Soft deletes only — never hard DELETE
```

Full rules in `docs/06_SECURITY_COMPLIANCE.md`.

---

## Performance & Stress Testing — Pre-Launch Requirements

All performance tasks run in Step 7 on staging.crikly.app before any production release.
Tool: **k6** for load and stress testing. Never test against production.

```
L-02b: API load test
       Target: p95 response time < 500ms under 50 concurrent users
       Endpoints: coach search, booking creation, availability lookup
       Tool: k6

L-02c: Stripe webhook stress test
       Target: idempotency holds under duplicate/burst webhook events
       Simulate: Stripe firing same event 2-3x (real-world behaviour)
       Risk: 🔴 High — must pass before Stripe live mode switch (L-09)

L-02d: Database query audit
       Target: no query over 200ms on p95
       Focus: coach search filters, availability slot calculation, booking joins
       Tool: Supabase query analyser + pg_stat_statements

L-02e: Supabase connection pool test
       Target: app handles 50 concurrent Vercel serverless connections
       Risk: Vercel functions can spike connections — Supabase has limits
       Fix if needed: enable Supabase connection pooler (PgBouncer)
```

These tasks are tracked in docs/10_BUILD_PLAN.md as L-02b through L-02e.
All must pass before L-09 (Stripe live mode switch).

---

## Notion Sync

After every completed task update both:
1. `docs/10_BUILD_PLAN.md` — mark ✅ Complete
2. Notion Build Plan — mark ✅ Complete + add notes

Notion Build Plan: https://www.notion.so/b288473c2a4f47ebad99bf6bf3f7b041

---

## Quick Reference

```
Supabase STAGING:    https://gzehxfnlfogkhadejowo.supabase.co (staging.crikly.app)
Supabase PRODUCTION: https://smwvtaeivmqaldvrbycm.supabase.co (crikly.app)
Production:          https://crikly.app
GitHub:              github.com/Crikly/crikly-app
Vercel:              vercel.com/lasith-projects/crikly-app
Stripe:              Tekly Solutions (acct_1TF06pPDhbWKSHdt) — always --project-name tekly
                     ⚠️ NEVER "Crikly sandbox" — wrong account, caused silent webhook failures
Notion:              notion.so/b288473c2a4f47ebad99bf6bf3f7b041 (Build Plan + Session Handoff)
```

---

*Crikly CLAUDE.md v2.1 — July 2026*
*Rewritten for Claude Code IDE.*
*Update this file whenever architecture decisions change.*
*This file is read automatically by Claude Code at session start.*
