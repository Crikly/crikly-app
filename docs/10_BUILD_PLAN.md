# Crikly — Comprehensive Build Plan

**Version:** 3.5
**Last Updated:** 3 May 2026
**Changed:** SYNC-18 — working ethics expanded with migration
  verification gate (Step 9), Studio creation rule + recovery path,
  and Fix ID lookup rule. Working Ethics v1.7 → v1.8. Codifies
  process improvements from the 3 May 2026 cleanup session
  (SYNC-13 through SYNC-17 + 3-phase hosted-dev migration alignment).
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
| F-24 | Proper merge of feature/migrations into develop | Manual | 🟢 | ✅ |
| F-25 | Create docs/16_DESIGN_WORKFLOW.md — Figma/v0/Windsurf workflow + colour tokens | Manual | 🟢 | ✅ |

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
| M-14 | Migration 014 — coach schema additions (19 gaps from docs/14_COACH_REQUIREMENTS.md) | @DatabaseArchitect | 🟡 | feature/coach | ✅ |
| M-14a | Migration 014a — new coach tables (coach_session_types, coach_venues, group_programmes, group_programme_sessions, group_programme_enrolments) | @DatabaseArchitect | 🟡 | feature/coach | ✅ |
| M-14b | Migration 014b — coach column additions (19 columns across 6 tables) | @DatabaseArchitect | 🟡 | develop | ✅ |
| M-015 | Migration 015 — session types, venues, programmes, blocked date ranges | @DatabaseArchitect | 🟡 | feature/coach | ✅ |

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
| A-15b | E2E test — OAuth sign-up → user_profiles row created | @QAEngineer | 🟢 | feature/auth | ⚪ |

---

## Step 3 — Coach Module

A coach can fully onboard, manage their schedule,
bookings, programmes, earnings, and appear live in search.

### 3A — Coach UI Design ✅ COMPLETE

All 19 screens approved April 2026.
Figma Make project: https://fluid-flow-42224954.figma.site
Component architecture: docs/C-04_COMPONENT_ARCHITECTURE.md

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-01 | Design coach onboarding flow — 9 screens | @UIUXDesigner | 🟢 | — | ✅ |
| C-02 | Design coach dashboard (web + mobile) | @UIUXDesigner | 🟢 | — | ✅ |
| C-03 | Design coach ongoing screens — 8 screens + event popovers | @UIUXDesigner | 🟢 | — | ✅ |
| C-04 | Plan coach component architecture | @FrontendArchitect | 🟢 | — | ✅ |

Approved screens:
Onboarding: dashboard web, dashboard mobile, profile,
sports selection, availability setup, qualifications,
booking policy, get paid, go live confirmation.
Ongoing: availability management, bookings list,
booking detail, programmes, earnings, profile edit,
schedule (command centre + 4 event popovers), get paid standalone.

### 3B — Coach Backend

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-05 | Create GET + POST /api/coaches/profile | @BackendDeveloper | 🟡 | feature/coach | ✅ |
| C-06 | Create CRUD /api/coaches/sports | @BackendDeveloper | 🟡 | feature/coach | ✅ |
| C-06b | CRUD /api/coaches/session-types — standalone routes | @BackendDeveloper | 🟢 | feature/coach | ✅ |
| C-06c | CRUD /api/coaches/venues | @BackendDeveloper | 🟢 | feature/coach | ✅ |
| C-06d | CRUD /api/coaches/programmes | @BackendDeveloper | 🟡 | feature/coach | ✅ |
| C-06d-create | POST /api/coaches/programmes — create + edit + cancel programme API (deferred from C-06d) | @BackendDeveloper | 🟡 | develop | ⚪ |
| C-07 | Create CRUD /api/coaches/qualifications | @BackendDeveloper | 🟢 | feature/coach | ✅ |
| C-08 | Create CRUD /api/coaches/photos | @BackendDeveloper | 🟢 | feature/coach | ✅ |
| C-09 | Create CRUD /api/coaches/availability — template blocks | @BackendDeveloper | 🟡 | feature/coach | ✅ |
| C-10 | Create CRUD /api/coaches/blocked-dates | @BackendDeveloper | 🟢 | feature/coach | ✅ |
| C-11 | Create POST /api/payments/connect/onboard — Stripe Connect URL | @PaymentsEngineer | 🔴 | feature/coach | ✅ |
| C-12 | Create DBS submission route + £29.99 payment | @BackendDeveloper | 🔴 | feature/coach | ⚪ |

⚠️ C-09, C-10, C-11, C-12, C-13 are BLOCKED until M-015 is complete.
C-05, C-06, C-07, C-08 are safe to proceed without M-015.

### 3C — Coach Frontend (CF tasks — all complete)

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| CF-SHELL | Coach layout shell — sidebar, right panel, routing | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-01 | Dashboard home screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-02 | Schedule screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-03 | Bookings list screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-04 | Booking Detail screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-05 | Programmes screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-05a | Create Programme — full page multi-step flow /coach/programmes/create | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-05b | Edit Programme — single page, locked fields after enrolment, Cancel on active cards | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-05c | Programme Roster view — enrolled participants list + manual offline add | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-58 | 9 post-review fixes to Create Programme flow | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-59 | Hydration fix + programme preview card redesign | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-60 | Page title hierarchy + sport_id debug | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-61 | Remove nested join from programme sport validation | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-62 | RLS INSERT policy fix + admin client for group_programmes | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-63 | Correct model value group_programmes INSERT | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-64 | Admin client for PATCH handler | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-65 | Admin client for GET programmes + remove nested join | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-66 | Draft count badge on Draft tab | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-58-DB | Add days_of_week integer[] to group_programmes — migration 018 | @DatabaseArchitect | 🟡 | develop | ✅ |
| Fix-58-DB-api | Accept + return days_of_week[] in POST/PATCH/GET | @BackendDeveloper | 🟡 | develop | ✅ |
| Fix-58-FE | Send days_of_week array to API in CreateProgramme | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-67-DB | Add venue_name + venue_address to group_programmes — migration 019 | @DatabaseArchitect | 🟢 | develop | ✅ |
| Fix-67-UI | Add VenueAutocomplete to Create Programme Step 2 | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-68 | Wire Publish + Delete on draft programme cards | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-69 | Replace all browser dialogs with inline UI in Programmes + Availability | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-70 | Add min_participants + cancellation_window_hours to Create Programme | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-71 | Programme card click navigation fixed | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-72 | Programme detail modal with share sheet | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-73 | Remove sports!inner nested join from availability POST sport validation — Fix-16d pattern | @BackendDeveloper | 🟢 | develop | ✅ |
| Fix-74 | Add venue + price fields to ad hoc slot form in Schedule.tsx | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-74b | Venue free text + suggestion pills; price input no spinner arrows | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-75 | Add venue_name + venue_address to availability_templates; VenueAutocomplete in ad hoc form | @DatabaseArchitect + @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-76 | Ad hoc insert not upsert + click popover + remove venue subtitle | @BackendDeveloper + @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-77 | Ad hoc blocks visual distinction in AvailabilityManagement + popover fix in Schedule | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-78 | Filter ad hoc from availability screen + popover redesign + venue truncation on teal blocks | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-79 | Ad hoc date filter + popover click fallback to bounding rect | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-80 | Timezone bug — use local date components instead of toISOString() for schedule date comparison | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-81 | Ad hoc popover click using nativeEvent target instead of currentTarget | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-82 | Ad hoc popover anchor to card rect right edge — same pattern as handleCardClick | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-82b | AdHocPopover exact SessionPopover structure + postcode filter on subtitle + outside-click handler | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-83 | Ad hoc View/Msg quick actions + named handleAdHocClick with correct clamping + venue restore | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-83b | pointer-events-none on booking layer container so clicks reach z-10 availability/ad hoc blocks | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-84 | Restrict VenueAutocomplete to establishments only — remove geocode type to block raw postcode selection | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-05c-DB | Add participant_name column to group_programme_enrolments + update roster API | @DatabaseArchitect | 🟢 | develop | ✅ |
| SYNC-10 | Working ethics v1.4 — Claude Code + Claude Design + no browser dialogs | @TechLead | 🟢 | develop | ✅ |
| CF-06 | Availability screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-07 | Profile Hub screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-08 | Earnings screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-09 | Get Paid screen | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-10 | Onboarding — Your Profile step | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-11 | Onboarding — Sports You Coach step | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-12 | Onboarding — Sport & Pricing step | @FrontendDeveloper | � | feature/coach-frontend | ✅ |
| CF-13 | Onboarding — Qualifications step | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| CF-14 | Onboarding — Booking Policy step | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| Fix-08 | Remove dashboard max-width cap | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| Fix-09 | Wider columns, 5-option share modal, removed back buttons, right panel on all screens | @FrontendDeveloper | 🟢 | feature/coach-frontend | ✅ |
| Fix-10a | Right panel visibility rules (hidden on Schedule) + sticky save bar full-bleed right | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10b | Align onboarding availability screen with dashboard availability UI | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10c | Fix sidebar, card styling and pence display bug on onboarding availability | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10d | Extract shared OnboardingPreviewPanel component — used across all onboarding screens | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10e | Refine booking policy screen — copy, microcopy, layout, right panel | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10g | Move live policy summary to right panel — reactive booking policy simulator | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10h | Refine get-paid onboarding screen — copy, cards, footer, right panel | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10i | Fix get-paid duplicate CTA and banner copy | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10j | Fix get-paid footer balance — three-slot pattern | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10k | Remove skip from qualifications onboarding footer | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-10l | Fix spacing between qualification cards | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-11a | Diagnose and fix 404 on /coach route after CD-01 layout refactor | @FrontendDeveloper | 🟡 | feature/coach-data | ✅ |
| Fix-11b | Remove stub data from dashboard client component | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-11c | Clear remaining right panel stub data | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-11d | Time-based greeting and real name in dashboard | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-11e | Fix right panel stacking layout | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-11f | Fix right panel height (h-screen) and remove console.error | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-11g | Wire right panel data and fix initials extraction | @FrontendDeveloper | 🟡 | feature/coach-data | ✅ |
| Fix-11h | Replace failing API call with direct Supabase query in layout | @FrontendDeveloper | 🟡 | feature/coach-data | ✅ |
| Fix-11i | Create user_profiles on OAuth callback — critical auth bug fix | @BackendDeveloper | 🔴 | feature/coach-data | ✅ |
| Fix-11j | Fix greeting name source and avatar display | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-11k | Fix avatar display and remove fake booking badge | @FrontendDeveloper | 🟢 | feature/coach-data | ✅ |
| Fix-12 | Insert user_roles row on role selection for OAuth and email users | @BackendDeveloper | 🔴 | feature/coach-data-2 | ✅ |
| CF-REVIEWS-01 | Coach Reviews page — /coach/reviews + STUB GET /api/coaches/reviews + sidebar nav entry. Follow-ups: API-COACH-REVIEWS-REAL-WIRING, API-COACH-REVIEWS-PAGINATION, BUG-REVIEWS-REPLY-PERSIST, BUG-REVIEWS-FLAG-ACTION, BUG-REVIEWS-TOKEN-DEBT. | @FrontendDeveloper | 🟡 | feat/coach-reviews | ✅ |
| DB-REVIEWS-SCHEMA | Extend reviews table (nullable booking_id/reviewer_user_id, ON DELETE SET NULL/CASCADE, add reviewer_name + sport_name, created_at DESC index, coach SELECT policy). Create coach_replies table with full RLS. Migration 029. Follow-up: BUG-REVIEWS-FK-LIFECYCLE (revisit CASCADE when soft-delete on coach_profiles lands). | @DatabaseArchitect | 🔴 | feat/reviews-schema | ✅ |

### 3D — Screen Review & Polish (CF-D tasks)

These tasks adjust existing built screens based on Lasith's screen-by-screen review.
All tasks commit directly to develop branch. One task per screen. No code changes to
other screens within the same task.

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| CF-R01 | Redesign Dashboard — Track 1 priority (deferred — keeping existing design) | Manual | 🟢 | — | ⚪ |
| CF-R02 | Redesign Bookings list — Track 1 priority (deferred) | Manual | 🟢 | — | ⚪ |
| CF-R03 | Redesign You're Live! — Track 1 priority (deferred) | Manual | 🟢 | — | ⚪ |
| CF-D01 | Dashboard screen adjustments — 10 changes (see Notion CF-D01 for full list). Shipped: 42c5efb + aff3cba (CF-D01b). | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D02 | Schedule screen adjustments. Shipped: ef06528 + CF-D02b–CF-D02j (10 commits). | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D03 | Bookings list screen adjustments. Shipped: fd79dbe + CF-D03b–CF-D03e. | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D04 | Booking Detail screen adjustments | @FrontendDeveloper | 🟢 | develop | ⚪ |
| CF-D05 | Programmes screen adjustments. Shipped: a4da343 + 78938b6 (CF-D05a). | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D06 | Availability screen adjustments. Shipped: 708aaab + 363bd18 (CF-D06b) + 06c590c (CF-D06c). | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D07 | Profile Hub screen adjustments. Shipped: d4dbe2d + 0aefed6 (CF-D07b). | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D08 | Earnings screen adjustments. Shipped: 169a561. | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D09 | Get Paid screen adjustments. Shipped: a9b7716. | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D10 | Onboarding screens adjustments — all 6 steps + You're Live | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D11a | Dashboard onboarding banner — hierarchy, Do next badge, guidance copy, % in expanded state | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D11b | Onboarding Profile step — sticky save bar, no white card wrapper behind button. Shipped: 0f3b397 — sticky behaviour generalised at layout level via CF-D12 SAVE BAR PATTERN (3e7115a). | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D11c | Location field — Google Places autocomplete on ProfileStep and ProfileEdit | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D12 | Onboarding sport selection + pricing — save bar pattern (back left, save right, no border-top) | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-D13 | Onboarding qualifications — replace emoji icons with Lucide, replace category dropdown with tiles. Shipped: 125d1e0 + 98001db + 0d33192 — Lucide icons applied. Tile-cards plan abandoned in favour of dropdown via CF-D13c (be61ee1) to match Sport & Pricing pattern. | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-02a | Create Session UI on Schedule screen — manual 1-on-1 slot creation modal | @FrontendDeveloper | 🟡 | develop | ✅ |
| CF-R04 | Coach public profile design alignment — align hero name typography, subtitle, location display, DBS badge, trust row, about fact sidebar, booking card session picker to Claude Design spec. Read docs/design/coach-profile.html. | @FrontendDeveloper | 🟢 | — | ⚪ |
| CF-R04a | Coach public profile design alignment Phase 1 — location fallback to postcode, teal DBS pill badge near name, 4-stat trust row grid | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-R04b | Coach public profile design alignment Phase 2 — Fraunces serif name, inline meta row, two-column about with fact sidebar, session picker in booking card | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-R04c | Coach public profile design alignment Phase 3 — "Where I coach" section, updated Safety & Trust banner with DBS icon block | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-R04d | Coach public profile design alignment Phase 4 — move name + meta row above hero gallery | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-R04e | Coach public profile design alignment Phase 5 — reviews rating breakdown bars, reviewer avatar circles | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-R04f | Coach public profile Phase 6 — booking card auto-fill + share button | @FrontendDeveloper | 🟡 | develop | ✅ |
| CF-R04g | Coach public profile Phase 7 — availability 7-day grid with slot counts | @FrontendDeveloper | 🟢 | develop | ✅ |
| CF-R04h | Coach public profile Phase 8 — slot click populates booking card + section dividers + calendar link | @FrontendDeveloper | 🟢 | develop | ✅ |

### 3E — Data Wiring (CD tasks)

All screens currently show hardcoded stub data.
These tasks connect each screen to real Supabase data via existing API routes.
Branch: feature/coach-data (open from develop before starting CD-01)

| ID | Task | API Route | Priority | Status |
|---|---|---|---|---|
| CD-01 | Wire sidebar — real coach name, avatar, notification count | GET /api/coaches/profile | 🔴 High | ✅ |
| CD-02 | Wire dashboard — profile completion %, next session, stats | GET /api/coaches/profile + bookings | 🔴 High | ✅ |
| CD-03 | Onboarding — verify each step saves correctly to Supabase | All onboarding API routes | 🔴 High | ✅ |
| CD-03b | Fix sport_id placeholder in PricingStep — real UUID lookup | GET /api/sports | 🔴 High | ✅ |
| CD-04 | Availability management — real schedule blocks | GET/POST/DELETE /api/coaches/availability | 🟡 Medium | ✅ |
| CD-05 | Availability management — real blocked dates | GET/POST/DELETE /api/coaches/blocked-dates | 🟡 Medium | ✅ |
| CD-06-api | Build GET /api/coaches/bookings + GET /api/coaches/bookings/[id] — unblocks CD-06 and CD-07 | New routes | 🟡 Medium | ✅ |
| CD-06 | Bookings list — real data | GET /api/coaches/bookings | 🟡 Medium | ✅ |
| CD-07 | Booking detail — real data | GET /api/coaches/bookings/[id] | 🟡 Medium | ✅ |
| CD-08 | Programmes list — real data | GET /api/coaches/programmes | 🟡 Medium | ✅ |
| CD-09-api | Build GET /api/coaches/earnings — unblocks CD-09 | New route | 🟢 Low | ✅ |
| CD-09 | Earnings summary — real data | GET /api/coaches/earnings | 🟡 Medium | ✅ |
| CD-10 | Profile edit — load and save real data | GET/POST /api/coaches/profile | 🟡 Medium | ✅  |
| CD-10b | Profile Hub — wire to real data | GET /api/coaches/profile | 🟡 Medium | ✅ |
| CD-11 | Get Paid — real Stripe connection status + payout data | GET /api/coaches/profile | 🟡 Medium | ✅ |
| CD-12 | Schedule grid — real bookings + availability | GET /api/coaches/availability | 🔵 Low | ✅ |
| CD-12b | Schedule grid — wire real bookings (today + upcoming + past) onto grid at z-15 | GET /api/coaches/bookings | 🟢 Low | ✅ |
| Fix-53 | Hide trend badge on non-monthly periods — Earnings.tsx showTrend condition | Earnings.tsx | 🟢 Low | ✅ |
| Fix-54 | Add pending_approval tab to GET /api/coaches/bookings + fetch in Schedule grid (amber EventBlock) | route.ts + Schedule.tsx | 🟢 Low | ✅ |
| CI-01 | Wire Approve/Decline in Schedule popover — PATCH /api/coaches/bookings/[id]/status, real booking data, refreshKey | New route + Schedule.tsx | 🟡 Medium | ✅ |
| CI-02 | Load more pagination on Past tab + wire Pending approval tab to real API | BookingsManagement.tsx | 🟢 Low | ✅ |
| Fix-56 | Reduce Past tab page size from 20 to 10 | BookingsManagement.tsx | 🟢 Low | ✅ |
| Fix-55 | Wire right panel pending approvals + today's sessions to real API data | CoachRightPanel.tsx | 🟡 Medium | ✅ |
| Fix-56b | Align API page size to 10 — was returning 20, causing hasMore to always be false | bookings/route.ts | 🟢 Low | ✅ |
| Fix-57 | Fix right panel scrolling — h-screen overflow-hidden on layout wrapper, remove min-h-screen from main | CoachLayoutClient.tsx + CoachRightPanel.tsx | 🟡 Medium | ✅ |
| Fix-14 | Data wiring fixes: onboarding pre-population, dashboard completion %, right panel real data | Multiple | 🟡 Medium | ✅ |
| Fix-15b | POST /api/coaches/sports validation fixes: add elite skill level, make group fields optional | POST /api/coaches/sports | 🟢 Low | ✅ |
| Fix-15c | POST /api/coaches/sports 500 error: remove sports join from insert query | POST /api/coaches/sports | 🟢 Low | ✅ |
| Fix-16a | Onboarding data persistence: upsert sports, fix qualifications/availability joins | Multiple POST routes | 🟡 Medium | ✅ |
| Fix-16b | Remove hardcoded stub data from onboarding: empty blocks/qualifications, placeholder right panel data | Onboarding components | 🟡 Medium | ✅ |
| Fix-16c | Add data pre-population to all onboarding steps: fetch and display saved data on mount | Onboarding components | 🟡 Medium | ✅ |
| Fix-16d | Remove all joins from coach API routes: fetch related data separately to avoid PGRST200 errors, add upsert to availability | Coach API routes | 🟡 Medium | ✅ |
| Fix-16e | Six fixes: availability unique constraint, age_groups/languages fields, qualification/availability remove UI, right panel coach name | Multiple | 🟡 Medium | ✅ |
| Fix-16f | Three data mapping fixes: age_groups saving/loading, languages saving/loading, time display without seconds | Onboarding components | 🟢 Low | ✅ |
| Fix-17n | Add Blocked Dates tab to AvailabilityStep with full calendar UI and API integration | AvailabilityStep.tsx | 🟡 Medium | ✅ |
| Fix-18a | Preview card reads price from coach_session_types: fetch minimum price_individual_pence and display in "What Parents See" card | ProfileStep.tsx | 🟢 Low | ✅ |
| Fix-18b | Save pricing to coach_session_types not deprecated coach_sports columns: upsert session type rows when sports/pricing saved + fix broken join-filter query | sports/route.ts, session-types/route.ts | 🟡 Medium | ✅ |
| Fix-19 | Correct RLS policies with broken auth.uid() mapping: join through user_profiles.auth_user_id across 9 policies in 5 M-14a tables | Migration file only | 🟢 Low | ✅ |
| Fix-20 | Wire dashboard CTA buttons: Create Session opens Schedule with New Session modal, Add Availability/Create Programme navigate to correct routes | CoachHomeClient.tsx, Schedule.tsx | 🟢 Low | ✅ |
| Fix-21 | Dynamic week dates and navigation in dashboard week strip: calculate dates from today, add week navigation with chevrons | CoachHomeClient.tsx | 🟢 Low | ✅ |
| Fix-21b | Correct today highlight and month label in week strip: use midnight-normalized date comparison to avoid timezone bugs | CoachHomeClient.tsx | 🟢 Low | ✅ |
| Fix-21c | Replace hardcoded ThisWeekStrip in CoachRightPanel with dynamic version matching CoachHomeClient | CoachRightPanel.tsx | 🟢 Low | ✅ |
| Fix-22 | Move price fetch into OnboardingPreviewPanel: fetch minimum price internally so it displays on all onboarding steps without prop passing | OnboardingPreviewPanel.tsx | 🟢 Low | ✅ |
| Fix-23 | Redesign Sport & pricing right panel: replace flat "YOUR OFFER" panel with two-section design matching OnboardingPreviewPanel (coach preview card + offer summary) | PricingStep.tsx | 🟢 Low | ✅ |
| Fix-24 | Show real profile photo in OnboardingPreviewPanel: fetch avatar_url internally and display actual photo when uploaded, fall back to initials when not | OnboardingPreviewPanel.tsx | 🟢 Low | ✅ |
| Fix-24b | Show real profile photo in PricingStep panel: extend existing profile fetch to capture avatar_url and display photo in inline aside panel | PricingStep.tsx | 🟢 Low | ✅ |
| Fix-25 | Dynamic dates in Schedule right panel calendar: replace all hardcoded dates with dynamic detection based on current date, generate month grid dynamically | CoachRightPanel.tsx | 🟢 Low | ✅ |
| Fix-26 | Dynamic week dates in Schedule grid and header: replace hardcoded Mon 6 – Sun 12 April with dynamic week calculation based on weekOffset state | Schedule.tsx | 🟢 Low | ✅ |
| Fix-27 | Replace placeholder logos with real Crikly brand assets: update favicon, sidebar logos, mobile logos, auth logos, and onboarding logos across all coach module files | Multiple files | 🟢 Low | ✅ |
| Fix-28 | Dynamic dashboard date and fix logo clipping: replace hardcoded "Tuesday, 14 May" with dynamic date, fix sidebar logo clipping with object-left and maxWidth | CoachHomeClient.tsx, CoachLayoutClient.tsx | 🟢 Low | ✅ |
| Fix-29 | Stable language pill width on selection: always render checkmark icon but make invisible when not selected to prevent layout shift | ProfileStep.tsx | 🟢 Low | ✅ |
| Fix-30 | Skeleton loader and session cache for sports list: replace loading text with animated pill skeletons, cache sports in sessionStorage to avoid re-fetching | SportStep.tsx | 🟢 Low | ✅ |
| Fix-31 | Consistent spinner loading state across all onboarding steps: replace plain text loading states with spinner + text pattern in PricingStep, QualificationsStep, AvailabilityStep | 3 files | 🟢 Low | ✅ |
| Fix-32 | Qualifications heading size and sticky right panel: update heading to match other steps (32px bold), make OnboardingPreviewPanel sticky so it stays fixed while content scrolls | QualificationsStep.tsx, OnboardingPreviewPanel.tsx | 🟢 Low | ✅ |
| Fix-33 | Richer qualification cards and remove confirmation: improve card visual hierarchy with bold name and meta row, add confirmation modal before removing qualifications | QualificationsStep.tsx | 🟢 Low | ✅ |
| Fix-34 | Sticky right panel in onboarding via proper h-screen layout context: add h-screen overflow-hidden wrapper to layout, update all 7 step files to flex-1 overflow-y-auto for independent scrolling | layout.tsx, OnboardingPreviewPanel.tsx, 7 step files | 🟡 Medium | ✅ |
| Fix-35 | Smooth page entrance animation across onboarding steps: add fade-in + slide-up animation to content wrappers in all 7 onboarding steps to eliminate jarring pop-in effect | globals.css, 7 step files | 🟢 Low | ✅ |
| Fix-36 | Convert go-live to celebration modal over dashboard: replace full-page GoLiveStep with modal that appears once on dashboard after onboarding completion, sets is_profile_live = true | GetPaidStep.tsx, CoachHomeClient.tsx | 🟡 Medium | ✅ |
| Fix-36b | Wire copy link and share buttons in celebration modal: derive profile URL from coach name slug, implement clipboard copy with feedback, dispatch custom event to open share modal | CoachHomeClient.tsx, CoachLayoutClient.tsx | 🟢 Low | ✅ |
| Fix-37 | Wire location_lat and location_lng in /api/coaches/profile POST route — save to user_profiles table | @BackendDeveloper | 🟡 | develop | ✅ |
| Fix-38 | LocationAutocomplete styling — fix Google dropdown border + add postcode support (change types to geocode) | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-38b | Add Google Places autocomplete to all venue fields — availability block + session creation. Types: establishment + geocode. Reuse or extend LocationAutocomplete.tsx | @FrontendDeveloper | 🟢 | develop | ✅ |
| Fix-38c | Add venue_id FK to availability_templates migration + wire venue saving to coach_venues table | @DatabaseArchitect | 🟡 | develop | ✅ |
| Fix-42 | Profile photo upload UI in ProfileEdit — click avatar to upload to Supabase Storage coach-photos bucket, PATCH avatar_url on profile | @FrontendDeveloper | 🟡 | develop | ✅ |
| Fix-42b | Coach gallery modal — 10 photos max, upload + delete, random shuffle on public profile | @FrontendDeveloper | 🟡 | develop | ✅ |

### 3F — Coach Go-Live Gaps (CG tasks)

Critical tasks required before any coach can go live on the platform.

| ID | Task | Risk | Depends On | Status |
|---|---|---|---|---|
| CG-01 | Coach search API — GET /api/coaches public search route | 🔴 High | CD-03 | ✅ |
| CG-01b | Coach profile + availability API — GET /api/coaches/[id] and GET /api/coaches/[id]/availability | 🔴 High | CG-01 | ✅ |
| CG-02 | Coach public profile page — what parents see | 🔴 High | CG-01b | ✅ |
| Fix-42 | Build coach photo upload UI in Profile Hub | 🟢 Low | CG-02 | ✅ |
| CG-03 | Stripe Connect onboarding — real redirect (C-11, C-19) | 🔴 High | CD-03 | ✅ |
| Fix-44 | Hide profile completion banner when at 100% | 🟢 Low | CG-03 | ✅ |
| Fix-45 | Sync Payment Setup row to real Stripe Connect status | 🟢 Low | CG-03 | ✅ |
| CG-04 | Email notifications via Resend | 🟡 Medium | CG-01 | ✅ |
| Fix-46 | Wire group programmes to coach dashboard | 🟢 Low | CG-02 | ✅ |
| Fix-47 | Fix reviews query using raw slug | 🟢 Low | L-UX01 | ✅ |
| Fix-48 | Use slug in preview button URL | 🟢 Low | L-UX01 | ✅ |
| Fix-49 | Fix location data saved to wrong columns | 🟢 Low | CG-02 | ✅ |
| Fix-50 | Move Where I coach below Qualifications | 🟢 Low | CF-R04c | ✅ |
| Fix-51 | Pass coach UUID not slug to availability API | 🟢 Low | L-UX01 | ✅ |
| Fix-52 | Fix UTC timezone day name bug | 🟢 Low | CF-R04g | ✅ |
| CG-05 | Push notifications via OneSignal — BLOCKED: requires production deployment | 🟡 Medium | CG-01 | 🔴 |
| CG-06 | Integration tests — all coach API routes | 🟡 Medium | CD-03 | ✅ |
| CG-07 | E2E test — full coach onboarding to profile live | 🟡 Medium | CG-01, CG-02 | ⚪ |

### 3G — Coach Tests

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| C-23 | Integration tests — all coach API routes | @QAEngineer | 🟢 | feature/coach | ⚪ |
| C-24 | E2E test — full coach onboarding to profile live | @QAEngineer | 🟢 | feature/coach | ⚪ |

### 3H — Refactoring Backlog

| ID | Task | Agent | Risk | Branch | Status |
|---|---|---|---|---|---|
| Refactor-01 | Extract shared coach components — move ThisWeekStrip and TodayLineup from CoachHomeClient.tsx and CoachRightPanel.tsx into src/components/coach/shared/. Both files import from shared location. No visual or behavioural changes. | @FrontendDeveloper | 🟡 | refactor/extract-shared-coach-components | ⚪ |

### 3I — Coach Go-Live Checklist

These are the remaining tasks to complete the coach module 100%
before going live with real coaches. Ordered by priority.

**Section A — Screen Polish (must do before go-live)**

| ID | Task | Agent | Risk | Status |
|---|---|---|---|---|
| CF-D01 | Dashboard adjustments — clickable stat cards, profile bar tone down blue in expanded state | @FrontendDeveloper | 🟢 | ✅ |
| CF-D02 | Schedule adjustments — today column tint, session card status borders, 4-type session popovers on click, available slot treatment, FAB pill shape, right panel route-aware | @FrontendDeveloper | 🟢 | ✅ |
| CF-02a | Create Session modal on Schedule — manual 1-on-1 slot creation from FAB | @FrontendDeveloper | 🟡 | ✅ |
| CF-D03 | Bookings list adjustments | @FrontendDeveloper | 🟢 | ✅ |
| CF-D04 | Booking Detail adjustments | @FrontendDeveloper | 🟢 | ⚪ |
| CF-D05 | Programmes screen adjustments | @FrontendDeveloper | 🟢 | ✅ |
| CF-D06 | Availability adjustments | @FrontendDeveloper | 🟢 | ✅ |
| CF-D07 | Profile Hub adjustments — Fix-42 photo upload done separately ✅ | @FrontendDeveloper | 🟢 | ✅ |
| CF-D08 | Earnings adjustments | @FrontendDeveloper | 🟢 | ✅ |
| CF-D09 | Get Paid adjustments | @FrontendDeveloper | 🟢 | ✅ |
| CF-D11b | Onboarding Profile step — sticky save bar | @FrontendDeveloper | 🟢 | ✅ |
| CF-D13 | Qualifications step — Lucide icons + tile category selector | @FrontendDeveloper | 🟢 | ✅ |

**Section B — Database Tech Debt**

| ID | Task | Agent | Risk | Status |
|---|---|---|---|---|
| CF-05c-DB | Add participant_name column to group_programme_enrolments + update roster API | @DatabaseArchitect | 🟢 | ✅ |
| Fix-38c | Add venue_id FK to availability_templates + wire venue saving | @DatabaseArchitect | 🟡 | ✅ |

**Section C — Tests**

| ID | Task | Agent | Risk | Status |
|---|---|---|---|---|
| CG-07 | E2E test — full coach onboarding to profile live | @QAEngineer | 🟡 | ⚪ |
| A-15b | E2E test — OAuth sign-up → user_profiles row created | @QAEngineer | 🟢 | ⚪ |

**Section D — Deferred to Step 7 Pre-Launch**

| ID | Task | Status |
|---|---|---|
| Fix-72-redesign | Programme detail modal redesign (rated 1/10) | ⚪ Step 7 |
| CF-R01 | Dashboard full redesign | ⚪ Step 7 |
| CF-R02 | Bookings list full redesign | ⚪ Step 7 |
| CF-R03 | You're Live! screen redesign | ⚪ Step 7 |
| A-06-REDESIGN | Auth screens redesign | ⚪ Step 7 |
| UI Consistency Audit | Full pass across all screens vs design system | ⚪ Step 7 |

**Section E — Blocked**

| ID | Task | Blocked on |
|---|---|---|
| CG-05 | Push notifications via OneSignal | Production deployment |
| C-12 | DBS submission route | Product decision on Phase 1 scope |

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
| P-09 | Create GET /api/coaches — search with all filters + sorting (built as CG-01, CG-01b in Step 3) | @BackendDeveloper | 🟡 | feature/search | ⚪ |
| P-10 | Create GET /api/coaches/[id] — full public profile (built as CG-01, CG-01b in Step 3) | @BackendDeveloper | 🟢 | feature/search | ⚪ |
| P-11 | Create GET /api/coaches/[id]/availability — available slots (built as CG-01, CG-01b in Step 3) | @BackendDeveloper | 🟡 | feature/search | ⚪ |

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

> ⚠️ **B-11 contract (per Fix-86):** must populate `bookings.venue_id`, `venue_name`, `venue_address` from the source — `availability_templates.venue_id` for 1-on-1 bookings, `group_programmes.venue_name` + `venue_address` for programme bookings, ad-hoc form input for coach-created sessions. Set `availability_template_id` for 1-on-1 bookings only.

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
| L-02b | API load test — coach search, booking creation, availability — p95 < 500ms at 50 concurrent users | @QAEngineer | 🟡 | ⚪ |
| L-02c | Stripe webhook stress test — idempotency under duplicate/burst events | @QAEngineer | 🔴 | ⚪ |
| L-02d | Database query audit — no query over 200ms p95 on coach search, availability, booking joins | @DatabaseArchitect | 🟡 | ⚪ |
| L-02e | Supabase connection pool test — 50 concurrent Vercel connections without exhausting pool | @DevOpsEngineer | 🟡 | ⚪ |
| SCALE-01 | Replace JS coach search filtering with PostGIS + Supabase RPC — trigger: coach count > 200 or L-02b load test fails | @DatabaseArchitect | 🟡 | ⚪ |
| L-UX01 | Replace UUID with human-readable slug in coach public profile URL — /coaches/lasith-jayarathne | @BackendDeveloper | 🟡 | ✅ |
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
| Step 1A — DevOps | Phase 1 | 8 | 8 ✅ | 0 |
| Step 1B — Migrations | Phase 1 | 17 | 17 ✅ | 0 |
| Step 1C — Design Foundation | Phase 1 | 6 | 6 ✅ | 0 |
| Step 2 — Auth | Phase 1 | 15 | 15 ✅ | 0 |
| Step 3 — Coach | Phase 1 | 95 | 92 ✅ | 3 |
| Step 4 — Parent & Player | Phase 1 | 21 | 0 | 21 |
| Step 5 — Booking & Payments | Phase 1 | 42 | 0 | 42 |
| Step 6 — Admin | Phase 1 | 24 | 0 | 24 |
| Step 7 — Pre-Launch | Phase 1 | 19 | 0 | 19 |
| **Phase 1 Total** | Phase 1 | **269** | **160** ✅ | **109** |
| Step 8 — Mobile App | **Product Phase 2** | 20 | 0 | 20 |
| Step 9 — Venues | **Product Phase 3** | 11 | 0 | 11 |
| **Total** | | **277** | **148** | **129** |

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

*Crikly Build Plan v3.5 — 3 May 2026 — SYNC-18: working ethics expanded (migration verification gate, Studio creation rule + recovery, Fix ID lookup).*
*207 tasks across all 3 phases. Follow in order. No skipping. No guessing.*
