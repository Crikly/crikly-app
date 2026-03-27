# Crikly — Technical Architecture

**Version:** 1.0
**Last Updated:** March 2026

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

---

## Repository Structure

```
crikly-app/
├── CLAUDE.md                    ← AI context file. Read before every prompt.
├── AGENTS.md                    ← Agentic task orchestration guide
├── PRD.md                       ← Full product requirements
├── 09_WORKING_ETHICS.md         ← Collaboration model and process rules
│
├── docs/
│   ├── 01_PROJECT_OVERVIEW.md   ← This project
│   ├── 02_TECH_ARCHITECTURE.md  ← This file
│   ├── 03_DATABASE_SCHEMA.md    ← Single source of truth for DB
│   ├── 04_API_REFERENCE.md      ← All API routes documented
│   ├── 05_BUSINESS_RULES.md     ← Business logic rules (BR-01 etc)
│   ├── 06_SECURITY_COMPLIANCE.md← Security, GDPR, child data rules
│   ├── 07_FUTURE_EXPANSION.md   ← Multi-sport, multi-country plans
│   ├── 08_CODING_STANDARDS.md   ← Code style and standards
│   ├── 10_BUILD_PLAN.md         ← Current build tasks and status
│   └── agents/
│       ├── tech-lead.md
│       ├── ui-ux-designer.md
│       ├── frontend-architect.md
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
│   ├── types/
│   │   ├── database.ts          ← Generated from Supabase schema
│   │   ├── api.ts               ← API request/response types
│   │   └── domain.ts            ← Domain model types
│   │
│   └── constants/
│       ├── roles.ts
│       ├── routes.ts
│       └── config.ts
│
├── supabase/
│   ├── migrations/              ← Database migrations (never edit existing)
│   └── seed.sql                 ← Dev seed data
│
└── tests/
    ├── unit/                    ← Unit tests
    ├── integration/             ← API + DB integration tests
    └── e2e/                     ← Playwright end-to-end tests
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
src/app/api/bookings/route.ts       → GET list, POST create
src/app/api/bookings/[id]/route.ts  → GET one, PATCH update, DELETE
```

### Row Level Security (RLS)
Every Supabase table has RLS enabled. No exceptions.
Security is enforced at the database level, not just the application.

---

## Environments

| Environment | Purpose | URL |
|---|---|---|
| Development | Local development | localhost:3000 |
| Staging | Pre-release testing | staging.crikly.app |
| Production | Live platform | crikly.app |

### Branch → Environment Mapping

```
feature/*  → Vercel preview URL (auto-deploy)
develop    → Vercel preview URL (auto-deploy)
staging    → staging.crikly.app (auto-deploy)
main       → crikly.app (auto-deploy) ← production
```

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=           # Public — safe in browser
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # Public — safe in browser
SUPABASE_SERVICE_ROLE_KEY=          # SECRET — server only

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # Public — safe in browser
STRIPE_SECRET_KEY=                  # SECRET — server only
STRIPE_WEBHOOK_SECRET=              # SECRET — server only

# Email
RESEND_API_KEY=                     # SECRET — server only

# Push Notifications
ONESIGNAL_APP_ID=                   # Public
ONESIGNAL_REST_API_KEY=             # SECRET — server only

# App
NEXT_PUBLIC_APP_URL=https://crikly.app
```

---

## Infrastructure Cost

| Service | Free Tier | Paid Estimate |
|---|---|---|
| Vercel | Free for MVP | ~£15/month at scale |
| Supabase | Free for MVP | ~£20/month at scale |
| Stripe | No monthly fee | 1.4% + 20p per transaction |
| Resend | 3,000 emails/month free | ~£15/month at scale |
| OneSignal | Generous free tier | Free for extended period |
| **Total** | **£0 to launch** | **~£50–£70/month at scale** |

---

## Multi-Currency Architecture

Phase 1: GBP only.
Designed from day one for multi-currency without structural changes.

- Every price record includes ISO currency code (GBP, LKR, USD)
- Country code on every user
- Commission rates configurable per country
- Adding a new country = admin configuration, not development

---

*Crikly Tech Architecture v1.0 — March 2026*
