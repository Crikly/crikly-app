# Crikly — Comprehensive Build Plan

**Version:** 2.0
**Last Updated:** March 2026
**This is the single source of truth for every task in the project.**

---

## Phase vs Step — Important Distinction

| Term | What it means | Where used |
|---|---|---|
| **Product Phase 1** | MVP Web App — the thing you're building now | PRD, Roadmap, stakeholders |
| **Product Phase 2** | Flutter Mobile App | PRD, Roadmap, stakeholders |
| **Product Phase 3** | Venue marketplace | PRD, Roadmap, stakeholders |
| **Step 0–7** | Internal build steps within Product Phase 1 | This build plan, Windsurf |
| **Step 8** | Internal build steps for Product Phase 2 | This build plan, Windsurf |
| **Step 9** | Internal build steps for Product Phase 3 | This build plan, Windsurf |

**Rule:** When talking to stakeholders or investors — use Product Phases.
**Rule:** When working in Windsurf — use Steps.

---

## How To Use This File

### Windsurf — At the START of every session:
1. Open this file
2. Find the first 🟡 In Progress task — continue it
3. If none, find the first ⚪ Planned task — start it
4. Mark it 🟡 In Progress before touching any code
5. Also mark it 🟡 in Notion Build Plan

### Windsurf — At the END of every session:
1. Mark completed tasks ✅ Complete
2. Mark blockers 🔴 Blocked with a note explaining why
3. Commit all work with correct message format
4. Update matching Notion task

### Rules — non-negotiable:
- Never skip a task
- Never work out of order without explicit written approval from Lasith
- Never mark ✅ without tests passing
- Never mark ✅ without relevant docs updated
- If something is unclear — mark 🔴 Blocked and stop. Do not guess.

---

## Status Legend

```
⚪ Planned      → Not started
🟡 In Progress  → Currently being worked on (only ONE task at a time)
✅ Complete     → Done + tested + committed + docs updated
🔴 Blocked      → Cannot proceed — needs Lasith input
```

---

## Step 0 — Foundation (Documentation & Setup)

Everything needed before writing a single line of application code.

| ID | Task | Agent | Risk | Status |
|---|---|---|---|---|
| F-01 | Create CLAUDE.md — AI master context | Manual | 🟢 | ✅ |
| F-02 | Create AGENTS.md — agent orchestration guide | Manual | 🟢 | ✅ |
| F-03 | Create PRD.md — full product requirements | Manual | 🟢 | ✅ |
| F-04 | Create 09_WORKING_ETHICS.md | Manual | 🟢 | ✅ |
| F-05 | Create docs/01_PROJECT_OVERVIEW.md | Manual | 🟢 | ✅ |
| F-06 | Create docs/02_TECH_ARCHITECTURE.md | Manual | 🟢 | ✅ |
| F-07 | Create docs/03_DATABASE_SCHEMA.md — v1.1, 31 tables, PRD traceability | Manual | 🟢 | ✅ |
| F-08 | Create docs/04_API_REFERENCE.md | Manual | 🟢 | ✅ |
| F-09 | Create docs/05_BUSINESS_RULES.md — BR-01 to BR-15 | Manual | 🟢 | ✅ |
| F-10 | Create docs/06_SECURITY_COMPLIANCE.md | Manual | 🟢 | ✅ |
| F-11 | Create docs/07_FUTURE_EXPANSION.md | Manual | 🟢 | ✅ |
| F-12 | Create docs/08_CODING_STANDARDS.md | Manual | 🟢 | ✅ |
| F-13 | Create docs/10_BUILD_PLAN.md — this file | Manual | 🟢 | ✅ |
| F-14 | Create all 9 agent files in docs/agents/ | Manual | 🟢 | ✅ |
| F-15 | Create Notion HQ workspace with all sections and subpages | Manual | 🟢 | ✅ |
| F-16 | Commit all foundation files to GitHub main branch | Manual | 🟢 | ✅ |
| F-17 | Create docs/14_COACH_REQUIREMENTS.md — 78 requirements, coach module | Manual | 🟢 | ✅ |
| F-18 | Move 09_WORKING_ETHICS.md to docs/ folder | Manual | 🟢 | ✅ |
| F-19 | Add branch lifecycle rule to docs/09_WORKING_ETHICS.md | Manual | 🟢 | ✅ |
| F-20 | Add BR-16 to BR-19 to docs/05_BUSINESS_RULES.md | Manual | 🟡 | ✅ |
| F-21 | Update docs/11_UX_PRINCIPLES.md — coach nav 6 tabs | Manual | 🟢 | ✅ |
| F-22 | Update CLAUDE.md — fix stale refs, add coach requirements, branch rule | Manual | 🟢 | ✅ |

**F-16 commit message:**
```
chore(docs): add all foundation docs, agents, schema and build plan
```

---

## Step 1 — Infrastructure Setup

### 1A — DevOps & Branches & Branches

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| D-01 | Install Supabase CLI, verify connection to project | @DevOpsEngineer | 🟢 | chore/supabase-setup | ✅ |
| D-02 | Create develop branch from main | @DevOpsEngineer | 🟢 | — | ✅ |
| D-03 | Create staging branch from main | @DevOpsEngineer | 🟢 | — | ✅ |
| D-04 | Protect main branch — no direct commits | @DevOpsEngineer | 🟢 | — | ✅ |
| D-05 | Create .env.example with all required variables | @DevOpsEngineer | 🟢 | chore/env-setup | ✅ |
| D-06 | GitHub Actions CI pipeline — type-check, lint, test, build | @DevOpsEngineer | 🟢 | chore/ci-setup | ✅ |
| D-07 | Configure Vercel environments (development, staging, production) | @DevOpsEngineer | 🟢 | chore/vercel-config | ✅ |
| D-08 | Verify crikly.app domain working end-to-end | @DevOpsEngineer | 🟢 | — | ✅ |

### 1B — Database Migrations

**Read docs/03_DATABASE_SCHEMA.md in full before writing any migration.**
**Write in strict order 001 → 010. Never edit an existing migration file.**

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| M-01 | Migration 001 — user_profiles, user_roles | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-02 | Migration 002 — parent_profiles, child_profiles, player_profiles, coach_profiles, coach_sports, coach_qualifications, coach_photos | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-03 | Migration 003 — sports, qualification_types, countries, platform_config, feature_flags | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-04 | Migration 004 — availability_templates, blocked_dates | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-05 | Migration 005 — bookings, group_bookings | @DatabaseArchitect | 🔴 | feature/migrations | ✅ |
| M-06 | Migration 006 — payment_intents, payouts, refunds | @DatabaseArchitect | 🔴 | feature/migrations | ✅ |
| M-07 | Migration 007 — passport_entries, performance_reports, reviews | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-08 | Migration 008 — subscription_tiers, tier_features, coach_subscriptions, tier_usage | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-09 | Migration 009 — notification_preferences, notifications | @DatabaseArchitect | 🟢 | feature/migrations | ✅ |
| M-10 | Migration 010 — admin_roles, content_pages, session_notes, dbs_verifications, disputes, promo_codes, audit_logs | @DatabaseArchitect | 🟡 | feature/migrations | ✅ |
| M-11 | Seed data — sports (cricket), countries (GB), platform_config, feature_flags, Free + Premium tiers | @DatabaseArchitect | 🟢 | feature/migrations | ✅ |
| M-12 | Generate TypeScript types from Supabase → src/types/database.ts | @DatabaseArchitect | 🟢 | feature/migrations | ✅ |
| M-13 | Run all migrations on Supabase and verify all tables exist | @DevOpsEngineer | 🟢 | feature/migrations | ✅ |
| M-14 | Migration 014 — coach schema additions (19 gaps from docs/14_COACH_REQUIREMENTS.md) | @DatabaseArchitect | 🟡 | feature/coach | ⚪ |

---

## Step 1C — Design Foundation

**Must be fully complete before ANY UI task in Steps 2–6 is started.**
This step defines the visual language, UX rules, and component library
that every screen in the app is built from. One-time investment.
All outputs live in docs/ and src/components/ui/.

### 1C — Design System

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| DS-01 | Define UX principles — gestures, rules, flows, empty/error/loading states | Manual | 🟢 | chore/design-system | ✅ |
| DS-02 | Define design system — colours, typography, spacing, shadows, radius | Manual | 🟢 | chore/design-system | ✅ |
| DS-03 | Build Tailwind design tokens — tailwind.config.ts + global CSS variables | @FrontendArchitect | 🟢 | chore/design-system | ✅ |
| DS-04 | Build base component library — Button, Input, Card, Badge, Avatar, Modal, Toast, Spinner | @FrontendDeveloper | 🟢 | chore/design-system | ✅ |
| DS-05 | Document all screen flows — parent, player, coach journeys | Manual | 🟢 | chore/design-system | ✅ |
| UX-01 | Add Programmes to coach navigation structure (REQ-C-062) | Manual | 🟢 | develop | ✅ |

**Outputs:**
- docs/11_UX_PRINCIPLES.md
- docs/12_DESIGN_SYSTEM.md
- docs/13_SCREEN_FLOWS.md
- tailwind.config.ts (updated with design tokens)
- src/components/ui/ (base component library)

**Rule:** Every UI prompt from A-06 onwards must reference docs/12_DESIGN_SYSTEM.md.
**Rule:** No UI is built outside the component library. New components → add to docs/12_DESIGN_SYSTEM.md first.

---

## Step 2 — Authentication & Roles & Roles

First working screens. Register, log in, select roles, switch roles.

### 2A — Auth Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| A-01 | Set up Supabase Auth — email + Google + Apple | @BackendDeveloper | 🟡 | feature/auth | ✅ |
| A-02 | Create POST /api/auth/register route | @BackendDeveloper | 🟡 | feature/auth | ✅ |
| A-03 | Create POST /api/auth/roles — add role to account | @BackendDeveloper | 🟡 | feature/auth | ✅ |
| A-04 | Create Supabase browser client — src/lib/supabase/client.ts | @BackendDeveloper | 🟢 | feature/auth | ✅ |
| A-05 | Create Supabase server client — src/lib/supabase/server.ts | @BackendDeveloper | 🟢 | feature/auth | ✅ |
| A-16 | Wire Supabase auth — register, login, OAuth | @BackendDeveloper | 🟡 | feature/auth | ✅ |
| A-17 | Wire role selection to save role in Supabase | @BackendDeveloper | 🟡 | feature/auth | ✅ |

### 2B — Auth UI Design & Build

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| A-06 | Design auth screens — sign up, log in, role selection | @UIUXDesigner | 🟢 | feature/auth | ✅ |
| A-06a | Build placeholder homepage — src/app/page.tsx | @FrontendDeveloper | 🟢 | feature/auth | ✅ |
| A-07 | Plan auth component architecture | @FrontendArchitect | 🟢 | feature/auth | ✅ |
| A-08 | Build sign up page — src/app/(auth)/register/page.tsx | @FrontendDeveloper | 🟢 | feature/auth | ✅ |
| A-09 | Build log in page — src/app/(auth)/login/page.tsx | @FrontendDeveloper | 🟢 | feature/auth | ✅ |
| A-10 | Build role selection screen — parent / player / coach picker | @FrontendDeveloper | 🟢 | feature/auth | ✅ |
| A-11 | Build Terms & Conditions acceptance flow | @FrontendDeveloper | 🟢 | feature/auth | ✅ |
| A-12 | Build multi-role context switcher | @FrontendDeveloper | 🟡 | feature/auth | ✅ |

### 2C — Auth Tests

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| A-13 | Unit tests — auth utility functions | @QAEngineer | 🟢 | feature/auth | ✅ |
| A-14 | Integration tests — register, login, role assignment | @QAEngineer | 🟢 | feature/auth | ✅ |
| A-15 | E2E test — sign up → role select → dashboard | @QAEngineer | 🟢 | feature/auth | ✅ |

---

## Step 3 — Coach Module

A coach can fully onboard and appear live in search.
**UI design starts here. Always begin with @UIUXDesigner.**

### 3A — Coach UI Design

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-01 | Design coach onboarding flow — all steps (requirements locked in F-17) | @UIUXDesigner | 🟢 | — | ⚪ |
| C-02 | Design coach dashboard screen | @UIUXDesigner | 🟢 | — | ⚪ |
| C-03 | Design availability setup screen | @UIUXDesigner | 🟢 | — | ⚪ |
| C-04 | Plan coach component architecture | @FrontendArchitect | 🟢 | — | ⚪ |

### 3B — Coach Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-05 | Create GET + POST /api/coaches/profile | @BackendDeveloper | 🟡 | feature/coach | ⚪ |
| C-06 | Create CRUD /api/coaches/sports | @BackendDeveloper | 🟡 | feature/coach | ⚪ |
| C-07 | Create CRUD /api/coaches/qualifications | @BackendDeveloper | 🟢 | feature/coach | ⚪ |
| C-08 | Create CRUD /api/coaches/photos | @BackendDeveloper | 🟢 | feature/coach | ⚪ |
| C-09 | Create CRUD /api/coaches/availability — template blocks | @BackendDeveloper | 🟡 | feature/coach | ⚪ |
| C-10 | Create CRUD /api/coaches/blocked-dates | @BackendDeveloper | 🟢 | feature/coach | ⚪ |
| C-11 | Create POST /api/payments/connect/onboard — Stripe Connect URL | @PaymentsEngineer | 🔴 | feature/coach | ⚪ |
| C-12 | Create DBS submission route + £29.99 payment | @BackendDeveloper | 🔴 | feature/coach | ⚪ |

### 3C — Coach Frontend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-13 | Build onboarding step 1 — name, photo, bio, location | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-14 | Build onboarding step 2 — sports, pricing, session types, skill levels | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-15 | Build onboarding step 3 — qualifications (structured + free text) | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-16 | Build onboarding step 4 — availability (multiple blocks per day, week preview) | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-17 | Build onboarding step 5 — blocked dates | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-18 | Build onboarding step 6 — cancellation policy + booking window (min/max) | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-19 | Build Stripe Connect onboarding redirect | @FrontendDeveloper | 🔴 | feature/coach | ⚪ |
| C-20 | Build DBS verification submission screen | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-21 | Build coach dashboard home | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |
| C-22 | Build coach profile edit screen | @FrontendDeveloper | 🟢 | feature/coach | ⚪ |

### 3D — Coach Tests

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-23 | Integration tests — all coach API routes | @QAEngineer | 🟢 | feature/coach | ⚪ |
| C-24 | E2E test — full coach onboarding to profile live | @QAEngineer | 🟢 | feature/coach | ⚪ |

---

## Step 4 — Parent & Player Module

Parents manage child profiles, search coaches, players manage their own profiles.

### 4A — Parent & Player UI Design

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| P-01 | Design parent home screen | @UIUXDesigner | 🟢 | — | ⚪ |
| P-02 | Design child profile create + edit screens | @UIUXDesigner | 🟢 | — | ⚪ |
| P-03 | Design coach search + filter screen | @UIUXDesigner | 🟢 | — | ⚪ |
| P-04 | Design coach public profile screen | @UIUXDesigner | 🟢 | — | ⚪ |
| P-05 | Design player profile screen | @UIUXDesigner | 🟢 | — | ⚪ |
| P-06 | Plan parent/player component architecture | @FrontendArchitect | 🟢 | — | ⚪ |

### 4B — Parent & Player Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| P-07 | Create CRUD /api/children — child profiles | @BackendDeveloper | 🟡 | feature/parent | ⚪ |
| P-08 | Create CRUD /api/players/profile — player profiles (16+ gate) | @BackendDeveloper | 🟡 | feature/player | ⚪ |
| P-09 | Create GET /api/coaches — search with all filters + sorting | @BackendDeveloper | 🟡 | feature/search | ⚪ |
| P-10 | Create GET /api/coaches/[id] — full public profile | @BackendDeveloper | 🟢 | feature/search | ⚪ |
| P-11 | Create GET /api/coaches/[id]/availability — available slots | @BackendDeveloper | 🟡 | feature/search | ⚪ |

### 4C — Parent & Player Frontend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| P-12 | Build parent home screen | @FrontendDeveloper | 🟢 | feature/parent | ⚪ |
| P-13 | Build child profile list screen | @FrontendDeveloper | 🟡 | feature/parent | ⚪ |
| P-14 | Build child profile create screen (name, photo, DOB, sport, medical notes) | @FrontendDeveloper | 🟡 | feature/parent | ⚪ |
| P-15 | Build child profile edit screen | @FrontendDeveloper | 🟡 | feature/parent | ⚪ |
| P-16 | Build coach search screen with all filters | @FrontendDeveloper | 🟢 | feature/search | ⚪ |
| P-17 | Build coach public profile screen | @FrontendDeveloper | 🟢 | feature/search | ⚪ |
| P-18 | Build player profile create + edit screen | @FrontendDeveloper | 🟡 | feature/player | ⚪ |

### 4D — Parent & Player Tests

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| P-19 | Integration tests — child profile routes (RLS cross-user access) | @QAEngineer | 🟡 | feature/parent | ⚪ |
| P-20 | Integration tests — player 16+ age gate | @QAEngineer | 🟢 | feature/player | ⚪ |
| P-21 | Integration tests — search + filter | @QAEngineer | 🟢 | feature/search | ⚪ |

---

## Step 5 — Booking & Payments

The most critical phase. Every 🔴 task requires Lasith sign-off before implementation.

### 5A — Booking Design & Architecture

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| B-01 | @TechLead full analysis of booking + payment flow | @TechLead | 🔴 | — | ⚪ |
| B-02 | Design booking flow — slot select, child select, summary, payment | @UIUXDesigner | 🟢 | — | ⚪ |
| B-03 | Design booking history screen | @UIUXDesigner | 🟢 | — | ⚪ |
| B-04 | Design booking detail screen | @UIUXDesigner | 🟢 | — | ⚪ |
| B-05 | Design cancellation confirmation screen | @UIUXDesigner | 🟢 | — | ⚪ |
| B-06 | Plan booking component architecture | @FrontendArchitect | 🟡 | — | ⚪ |

### 5B — Payment Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| B-07 | Stripe Checkout payment intent — 10% commission split (BR-01) | @PaymentsEngineer | 🔴 | feature/payments | ⚪ |
| B-08 | Stripe webhook handler — payment_intent.succeeded + failed | @PaymentsEngineer | 🔴 | feature/payments | ⚪ |
| B-09 | Automated 48hr coach payout — Supabase Edge Function cron (BR-03) | @PaymentsEngineer | 🔴 | feature/payments | ⚪ |
| B-10 | Cancellation + refund logic — all 3 scenarios (BR-04) | @PaymentsEngineer | 🔴 | feature/payments | ⚪ |

### 5C — Booking Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| B-11 | POST /api/bookings — create booking + trigger payment intent | @BackendDeveloper | 🔴 | feature/bookings | ⚪ |
| B-12 | GET /api/bookings — list bookings for user | @BackendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-13 | GET /api/bookings/[id] — booking detail | @BackendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-14 | POST /api/bookings/[id]/cancel — cancellation (BR-04) | @BackendDeveloper | 🔴 | feature/bookings | ⚪ |
| B-15 | POST /api/bookings/[id]/complete — coach marks session done | @BackendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-16 | Promo code validation + apply at checkout (BR-14) | @BackendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-17 | Email notifications via Resend — all PRD Section 6 triggers | @BackendDeveloper | 🟡 | feature/notifications | ⚪ |
| B-18 | Push notifications via OneSignal — all PRD Section 6 triggers | @BackendDeveloper | 🟡 | feature/notifications | ⚪ |

### 5D — Booking Frontend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| B-19 | Booking step 1 — select date + slot from availability | @FrontendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-20 | Booking step 2 — select child / confirm as player | @FrontendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-21 | Booking step 3 — summary, promo code, total price | @FrontendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-22 | Booking step 4 — Stripe Checkout redirect + confirmation screen | @FrontendDeveloper | 🔴 | feature/bookings | ⚪ |
| B-23 | Booking history screen | @FrontendDeveloper | 🟢 | feature/bookings | ⚪ |
| B-24 | Booking detail screen | @FrontendDeveloper | 🟢 | feature/bookings | ⚪ |
| B-25 | Cancellation flow + confirmation | @FrontendDeveloper | 🟡 | feature/bookings | ⚪ |
| B-26 | Notification preferences screen | @FrontendDeveloper | 🟢 | feature/notifications | ⚪ |

### 5E — Training Passport & Reviews

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| B-27 | Auto-create passport entry on session complete | @BackendDeveloper | 🟡 | feature/passport | ⚪ |
| B-28 | Training Passport view — parent/player | @FrontendDeveloper | 🟢 | feature/passport | ⚪ |
| B-29 | Passport privacy controls (open / booking only / private) | @FrontendDeveloper | 🟢 | feature/passport | ⚪ |
| B-30 | Session notes — Free tier (coach writes after session) | @FrontendDeveloper | 🟢 | feature/passport | ⚪ |
| B-31 | Performance report — Premium tier structured form | @FrontendDeveloper | 🟡 | feature/passport | ⚪ |
| B-32 | Review + rating submission screen | @FrontendDeveloper | 🟢 | feature/reviews | ⚪ |
| B-33 | POST /api/reviews — submit review, update coach rating cache | @BackendDeveloper | 🟢 | feature/reviews | ⚪ |
| B-34 | Child → player transition — birthday cron, 30-day window, GDPR | @BackendDeveloper | 🔴 | feature/transition | ⚪ |

### 5F — Booking & Payment Tests

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| B-35 | Unit test — commission calculation BR-01 (specific pence values) | @QAEngineer | 🟡 | feature/bookings | ⚪ |
| B-36 | Unit test — cancellation window logic BR-04 | @QAEngineer | 🟡 | feature/bookings | ⚪ |
| B-37 | Unit test — promo code validation BR-14 | @QAEngineer | 🟡 | feature/bookings | ⚪ |
| B-38 | Integration test — booking creation + payment intent | @QAEngineer | 🔴 | feature/bookings | ⚪ |
| B-39 | Integration test — cancellation all 3 scenarios | @QAEngineer | 🔴 | feature/bookings | ⚪ |
| B-40 | Integration test — webhook handling | @QAEngineer | 🔴 | feature/bookings | ⚪ |
| B-41 | E2E test — parent books coach full happy path | @QAEngineer | 🔴 | feature/bookings | ⚪ |
| B-42 | E2E test — coach cancels → full refund to parent | @QAEngineer | 🔴 | feature/bookings | ⚪ |

---

## Step 6 — Admin Panel

Lasith can manage the platform, approve DBS, configure everything.

### 6A — Admin Design

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| AD-01 | Design admin dashboard | @UIUXDesigner | 🟢 | — | ⚪ |
| AD-02 | Plan admin component architecture | @FrontendArchitect | 🟢 | — | ⚪ |

### 6B — Admin Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| AD-03 | Admin auth middleware — role check + permission level | @BackendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-04 | GET /api/admin/dashboard — platform metrics | @BackendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-05 | GET + PATCH /api/admin/users — user management | @BackendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-06 | PATCH /api/admin/dbs-verifications/[id] — approve/reject | @BackendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-07 | PATCH /api/admin/disputes/[id] — resolve dispute | @BackendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-08 | CRUD /api/admin/promo-codes | @BackendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-09 | CRUD /api/admin/content-pages | @BackendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-10 | PATCH /api/admin/platform-config | @BackendDeveloper | 🟡 | feature/admin | ⚪ |

### 6C — Admin Frontend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| AD-11 | Admin dashboard — revenue, bookings, coaches, alerts | @FrontendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-12 | Sports + qualification types management | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-13 | Countries + currency configuration | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-14 | Platform config — commission, payout delay, booking windows | @FrontendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-15 | Subscription tier engine — create tiers, toggle features, set limits | @FrontendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-16 | User management — view, suspend, admin role assignment | @FrontendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-17 | DBS verification queue + approve/reject workflow | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-18 | Dispute management screen | @FrontendDeveloper | 🟡 | feature/admin | ⚪ |
| AD-19 | Promo codes management | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-20 | Feature flags management | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-21 | Content pages — T&Cs, Privacy Policy, email templates | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |
| AD-22 | Audit log viewer | @FrontendDeveloper | 🟢 | feature/admin | ⚪ |

### 6D — Admin Tests

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| AD-23 | Integration tests — admin routes (auth, permissions) | @QAEngineer | 🟡 | feature/admin | ⚪ |
| AD-24 | E2E — admin approves DBS, badge appears on coach profile | @QAEngineer | 🟢 | feature/admin | ⚪ |

---

## Step 7 — Pre-Launch

| ID | Task | Agent | Risk | Status |
|---|---|---|---|---|
| L-01 | Set up staging.crikly.app | @DevOpsEngineer | 🟡 | ⚪ |
| L-02 | Performance audit — Lighthouse mobile target 90+ | @QAEngineer | 🟢 | ⚪ |
| L-03 | Security review — RLS, auth, child data, payments | Manual | 🔴 | ⚪ |
| L-04 | Write Terms & Conditions | Manual | 🟢 | ⚪ |
| L-05 | Write Privacy Policy (GDPR compliant) | Manual | 🟢 | ⚪ |
| L-06 | Write Cookie Policy | Manual | 🟢 | ⚪ |
| L-07 | Publish T&Cs + Privacy Policy via admin content panel | Manual | 🟢 | ⚪ |
| L-08 | Full E2E regression suite on staging | @QAEngineer | 🟡 | ⚪ |
| L-09 | Switch Stripe to live mode keys on production | Manual | 🔴 | ⚪ |
| L-10 | Onboard first 10 real coaches (in-person) | Manual | 🟢 | ⚪ |
| L-11 | First real test booking end-to-end | Manual | 🟢 | ⚪ |
| L-12 | First real 48hr payout to coach confirmed | Manual | 🟢 | ⚪ |
| L-13 | 🎉 Phase 1 launch — first public announcement | Manual | 🟢 | ⚪ |


---

## Step 8 — Mobile App

> **Product Phase 2.** Trigger: Phase 1 (MVP) validated with 50+ real bookings.

Flutter mobile app built on the same backend as Phase 1.
**Trigger:** Phase 1 validated — 50+ completed bookings, product market fit confirmed.
**Reference:** PRD.md Section 1.4, docs/07_FUTURE_EXPANSION.md

### 8A — Mobile Setup

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| MOB-01 | Create new repo github.com/Crikly/crikly-mobile | Manual | 🟢 | — | ⚪ |
| MOB-02 | Set up Flutter project (iOS + Android) | @DevOpsEngineer | 🟢 | chore/flutter-setup | ⚪ |
| MOB-03 | Set up Supabase Flutter SDK | @BackendDeveloper | 🟡 | chore/flutter-setup | ⚪ |
| MOB-04 | Set up Stripe Flutter SDK | @PaymentsEngineer | 🔴 | chore/flutter-setup | ⚪ |
| MOB-05 | Configure iOS + Android build environments | @DevOpsEngineer | 🟢 | chore/flutter-setup | ⚪ |

### 8B — Mobile Core Features

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| MOB-06 | Design all mobile screens (iOS-first) | @UIUXDesigner | 🟢 | — | ⚪ |
| MOB-07 | Build auth screens (sign up, log in, role select) | @FrontendDeveloper | 🟢 | feature/mob-auth | ⚪ |
| MOB-08 | Build parent home + child profiles | @FrontendDeveloper | 🟢 | feature/mob-parent | ⚪ |
| MOB-09 | Build coach search + profile view | @FrontendDeveloper | 🟢 | feature/mob-search | ⚪ |
| MOB-10 | Build booking flow + Stripe payment | @FrontendDeveloper | 🔴 | feature/mob-booking | ⚪ |
| MOB-11 | Build coach dashboard + availability | @FrontendDeveloper | 🟢 | feature/mob-coach | ⚪ |
| MOB-12 | Build Training Passport screens | @FrontendDeveloper | 🟢 | feature/mob-passport | ⚪ |

### 8C — Phase 2 New Features

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| MOB-13 | Build full in-app messaging inbox | @TechLead | 🟡 | feature/messaging | ⚪ |
| MOB-14 | Backend — conversations + messages tables + API routes | @BackendDeveloper | 🟡 | feature/messaging | ⚪ |
| MOB-15 | Set up SMS notifications via Twilio | @BackendDeveloper | 🟡 | feature/sms | ⚪ |
| MOB-16 | Mobile push notifications via OneSignal | @BackendDeveloper | 🟢 | feature/push-mobile | ⚪ |

### 8D — App Store Launch

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| MOB-17 | App Store submission (iOS) | Manual | 🟢 | — | ⚪ |
| MOB-18 | Google Play Store submission (Android) | Manual | 🟢 | — | ⚪ |
| MOB-19 | App Store + Play Store live | Manual | 🟢 | — | ⚪ |
| MOB-20 | 🎉 Phase 2 milestone — 1,000 active users | Manual | 🟢 | — | ⚪ |

---

## Step 9 — Venues

> **Product Phase 3.** Trigger: Phase 2 (Mobile) validated with sufficient volume.

Three-sided marketplace — coaches, parents, and venues.
**Trigger:** Phase 2 validated — sufficient volume for venues to want to list.
**Reference:** PRD.md Section 1.4, docs/07_FUTURE_EXPANSION.md

### 9A — Venue Infrastructure

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| VEN-01 | Design venue onboarding + booking flows | @UIUXDesigner | 🟢 | — | ⚪ |
| VEN-02 | Migration 011 — venues, venue_availability | @DatabaseArchitect | 🟡 | feature/venues | ⚪ |
| VEN-03 | Migration 012 — venue_bookings, venue_bundle_bookings | @DatabaseArchitect | 🟡 | feature/venues | ⚪ |
| VEN-04 | Venue self-onboarding flow | @FrontendDeveloper | 🟢 | feature/venues | ⚪ |
| VEN-05 | Venue availability management | @FrontendDeveloper | 🟢 | feature/venues | ⚪ |
| VEN-06 | Parent books venue only | @FrontendDeveloper | 🟡 | feature/venues | ⚪ |
| VEN-07 | Coach books venue for their session | @FrontendDeveloper | 🟡 | feature/venues | ⚪ |
| VEN-08 | Bundle booking — coach + venue together | @TechLead | 🔴 | feature/venues | ⚪ |
| VEN-09 | Venue payments + payouts via Stripe Connect | @PaymentsEngineer | 🔴 | feature/venues | ⚪ |
| VEN-10 | WhatsApp notifications via Twilio | @BackendDeveloper | 🟡 | feature/whatsapp | ⚪ |
| VEN-11 | 🎉 Phase 3 milestone — first venue booking | Manual | 🟢 | — | ⚪ |

---

## Summary

| Step | Product Phase | Task Count | Complete | Remaining |
|---|---|---|---|---|
| Step 0 — Foundation | All | 22 | 22 ✅ | 0 |
| Step 1A — DevOps | Phase 1 | 8 | 8 | 0 |
| Step 1B — Migrations | Phase 1 | 14 | 13 | 1 |
| Step 1C — Design Foundation | Phase 1 | 6 | 6 | 0 |
| Step 2 — Auth | Phase 1 | 15 | 15 | 0 |
| Step 3 — Coach | Phase 1 | 24 | 0 | 24 |
| Step 4 — Parent & Player | Phase 1 | 21 | 0 | 21 |
| Step 5 — Booking & Payments | Phase 1 | 42 | 0 | 42 |
| Step 6 — Admin | Phase 1 | 24 | 0 | 24 |
| Step 7 — Pre-Launch | Phase 1 | 13 | 0 | 13 |
| Step 8 — Mobile App | **Product Phase 2** | 20 | 0 | 20 |
| Step 9 — Venues | **Product Phase 3** | 11 | 0 | 11 |
| **Total** | | **220** | **64** | **156** |

---

## Commit Message Reference

```
feat(auth): add role selection onboarding flow
feat(coach): add availability template setup
feat(bookings): add booking creation with commission (BR-01)
fix(payments): prevent double commission on group bookings
test(bookings): add cancellation refund flow tests
docs(schema): update coach_photos table v1.2
chore(migrations): add migration 001 user_profiles
```

---

## Notion Build Plan

Sync this file with Notion at every session start and end.
Notion: https://www.notion.so/b288473c2a4f47ebad99bf6bf3f7b041

---

*Crikly Build Plan v2.0 — March 2026*
*207 tasks across all 3 phases. Follow in order. No skipping. No guessing.*
