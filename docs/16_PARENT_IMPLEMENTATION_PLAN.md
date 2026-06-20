# Crikly — Parent & Player Implementation Plan

**Version:** 1.0
**Created:** 19 June 2026
**Status:** Plan ready for build sequencing. Feeds `docs/10_BUILD_PLAN.md` (the single source of truth).
**Owner:** Lasith Jayarathne · **Planned by:** Claude
**Source requirements:** `docs/15_PARENT_REQUIREMENTS.md` (75 REQ-P) + the Guest Booking MVP (Block 0).

> **Sequencing principle:** ship a real booking *fast* via a throwaway guest flow (Block 0), lay the
> foundations (infra + schema + coach-side fixes), then build the full module in dependency order —
> accounts → profiles → discovery → booking → payment → management → passport → reviews/notifications/
> settings → conversion → player delta. Each task carries an agent, a risk level, and its dependencies.
> Lasith approves every Step 0 plan and owns all git operations.

**Risk key:** 🟢 read-only / low · 🟡 standard feature · 🔴 payments / auth / child-data / RLS (extra gate).

---

## Prerequisites (Lasith actions — not code tasks)

| # | Action | Why it matters | Blocks |
|---|---|---|---|
| PRE-1 | **Fix Supabase MCP connection** | Claude Code's Supabase MCP points at the wrong org ("AI Investor Agent" / "AI Stock Agent"), not Crikly. Any DB-touching CC task fails. | All schema/DB tasks |
| PRE-2 | **Stripe Connect identity verification** | Pending on the platform account. Coaches can't connect Stripe on prod until it clears. | Live payments (build proceeds in test mode) |
| PRE-3 | **Legal + safeguarding sign-off** on the age/conversion model | Minors + payments + contracts carry liability (REQ-P-016–019). | Conversion phase go-live |

---

## Block 0 — Guest Booking MVP (the bridge)

> A throwaway, no-auth booking flow so a coach can share a link in WhatsApp and a parent/player can book
> immediately — **before** the full parent module exists. Validates the core marketplace loop (first real
> booking) and the WhatsApp growth engine. Replaced later by the authed booking flow (Phase 5). It does not
> touch the 75 REQ-P.

**Spec:** coach shares their profile/session link → parent taps → public coach profile
(`/coaches/[id]`, already live) shows 1-on-1 availability **and** programmes → parent picks a slot or
programme → guest checkout (no login, no profiles) capturing only booker name + email + phone and
participant first name + age → Stripe payment per the existing launch payment-model decision → confirmation
+ email receipt (Resend). **No cancellation flow** (handled offline). Booker email stored for future
account linking.

| Task | What | Agent | Risk | Depends on |
|---|---|---|---|---|
| **P-00a** | **Diagnostic** — locate the dead "View full calendar" link; confirm what `/book/[coachId]` currently does; check for any programme-display logic on the public profile | @TechLead | 🟢 | PRE-1 (for any DB read) |
| **P-00b** | **Coach public profile fixes** — add a Programmes section (bookable Model-A programmes); fix the dead "View full calendar" link; wire both "Book a session" entry points into the guest flow | @FrontendDeveloper | 🟡 | P-00a |
| **P-00c** | **Guest-checkout booking flow** — no-auth `/book` for a 1-on-1 slot or programme; minimal guest fields; Stripe payment (test mode now, live on PRE-2) per launch payment model; confirmation + Resend receipt; no cancel; store email | @FrontendDeveloper + @PaymentsEngineer | 🔴 | P-00b |

---

## Phase 1 — Foundations (infra + schema + coach-side fixes)

> Everything the full module needs underneath it. Schema first, so features build on solid ground.

| Task | What | Agent | Risk | REQ / Gap |
|---|---|---|---|---|
| **P-01** | Schema migrations: `child_sports` / `player_sports`; child gender; `platform_config.adult_age`; cross-coach passport visibility; group per-participant passport entries + shared-summary field; To-Do source; player min-age 16→18; reviews 24h edit RLS | @DatabaseArchitect | 🔴 | GAP-P-01–06, REQ-P-017/067 |
| **P-02** | Coach-side cleanups: remove/wire the dead "Group" checkbox on the Sport & pricing screen | @FrontendDeveloper | 🟡 | VERIFY-P-01 |
| **P-03** | Landing CTA routing — persona CTAs route into browse, not /register (auth wall at Confirm & Pay) | @FrontendDeveloper | 🟡 | ALIGN-P-01, REQ-P-001 |

*(Deferred coach enhancement: COACH-ENH-01 additional-child pricing — built coach-side when flexible group pricing is needed.)*

---

## Phase 2 — Auth, Accounts & Onboarding (Blocks 1 & 3)

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-04** | Auth + accounts: minimal signup, unauthenticated browsing, booking-intent preservation across auth/OAuth, role landing, guest→account linking | @FrontendDeveloper + @BackendDeveloper | 🔴 | 001, 002, 003, 005 |
| **P-05** | Player onboarding: converted take-ownership + fresh-adult signup; player self-profile | @FrontendDeveloper | 🟡 | 020, 021 |
| **P-06** | Parent To-Do / action centre | @FrontendDeveloper | 🟡 | 009 |

---

## Phase 3 — Child Profiles (Block 2)

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-07** | Child profiles: inline create at booking, required/optional fields, per-sport skill (`child_sports`), default avatars, gender, always-editable, photo privacy | @FrontendDeveloper + @BackendDeveloper | 🟡 | 004, 010–015 |

---

## Phase 4 — Discovery (Blocks 4 & 5)

> Mostly already built — this is wiring + gaps, not greenfield.

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-08** | Dashboard search entry (reuse public component); group programmes in search (All/1-on-1/Group); empty-state radius widening | @FrontendDeveloper | 🟡 | 022–024, 026, 027, 029 |
| **P-09** | Coach profile demand-side polish; reviews display + coach response | @FrontendDeveloper | 🟡 | 030–032, 068 |

---

## Phase 5 — Booking Flow (Blocks 6 & 7) — upgrade Block 0 to authed

> Same build event as **CG-BookableWidget-01**. Builds on Block 0's guest flow, adding accounts, child
> selection, and group enrolment.

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-10** | Authed 1-on-1 booking: generic skeleton, child selector, duration selection, transparent cost breakdown, slot soft-hold | @FrontendDeveloper + @PaymentsEngineer | 🔴 | 033, 034, 037, 043 |
| **P-11** | Manual-approval coaches: authorise on booking, capture on approval, release on decline/timeout, clear messaging | @PaymentsEngineer | 🔴 | 036 |
| **P-12** | Group programme enrolment (Model A): multi-child, per-participant pricing, payment-model display, late join, roster privacy | @FrontendDeveloper + @PaymentsEngineer | 🔴 | 035, 038–042 |

---

## Phase 6 — Payment & Checkout (Block 8)

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-13** | Saved cards (Stripe Customer), promo-code field, declined-card retry, confirmation + email receipt | @PaymentsEngineer + @FrontendDeveloper | 🔴 | 044–047 |

---

## Phase 7 — Bookings Management & Cancellations (Block 9)

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-14** | Bookings list (3 tabs + child filter), booking detail, cancellation + refund preview, add to calendar, contact unlock | @FrontendDeveloper + @PaymentsEngineer | 🔴 | 048, 049, 052–054 |
| **P-15** | Reschedule (price-neutral slot move) + rules | @FrontendDeveloper + @PaymentsEngineer | 🟡 | 050, 051 |
| **P-16** | Group cancellation / min-not-met + no-show outcome (parent-side) | @FrontendDeveloper | 🟡 | 055, 056 |

---

## Phase 8 — Training Passport (Block 10)

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-17** | Passport per-sport structure + base privacy + cross-coach visibility + owner-sees-shared-only | @FrontendDeveloper + @DatabaseArchitect | 🔴 | 057–061 |
| **P-18** | Progress visualisation + PDF export + shareable read-only link | @FrontendDeveloper | 🟡 | 062, 063 |
| **P-19** | Programme reports → passport (hybrid: per-participant entries + shared summary + per-child report) | @BackendDeveloper | 🟡 | 064 |

---

## Phase 9 — Reviews, Notifications & Settings (Block 11)

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-20** | Reviews: prompt after completion, optional, 24h edit window, reviewer identity | @FrontendDeveloper | 🟡 | 065–067, 069 |
| **P-21** | Notifications: trigger set, email/push toggles, marketing opt-in, reminder timing | @BackendDeveloper | 🟡 | 070–072 |
| **P-22** | Settings: sections, profile editing, delete account (GDPR) | @FrontendDeveloper + @BackendDeveloper | 🔴 | 073–075 |

---

## Phase 10 — Child → Player Conversion (full flow)

> Depends on accounts (Phase 2) and the passport (Phase 8) being live.

| Task | What | Agent | Risk | REQ-P |
|---|---|---|---|---|
| **P-23** | Birthday cron → To-Do prompt → invite/accept → one-way handover + child-profile freeze (RLS) → unified passport forward | @BackendDeveloper + @DatabaseArchitect | 🔴 | 006/006a/006b, 007, 008, 016–019 |

---

## Phase 11 — Player Module Delta

| Task | What | Agent | Risk | Notes |
|---|---|---|---|---|
| **P-24** | Player-specific deltas across discovery/booking/passport/settings (no child selector; self-managed) | @FrontendDeveloper | 🟡 | ~50% delta from Parent |

---

## Deferred (separate tracks)

- **Admin module** — inherits the Jan 2026 admin PRD + the Admin Config Backlog (adult_age, reschedule
  max-count, search ranking weights, promo/discount engine, commission per sport/user, etc.). Lean MVP
  first (DBS queue, user management, dispute view), fuller config later.
- **Phase 2 backlog** — save/favourite coach, map search view, premium-coach ranking boost, Model B
  shared-slot enrolment, COACH-ENH-01 additional-child pricing, in-app messaging.

---

## Dependency Map (critical path)

```
PRE-1 (Supabase MCP) ──┐
                       ├─→ P-01 (schema) ──→ Phases 3–10
PRE-2 (Stripe Connect) ─┴─→ live payments (Block 0 go-live, all 🔴 tasks)

Block 0 (P-00a→b→c) ──→ first real booking  [independent bridge, runs now]

P-04 (auth/accounts) ──→ P-07 (child profiles) ──→ P-10/12 (authed booking) ──→ P-13 (payment)
                                                                              └─→ P-14–16 (management)
P-17 (passport) ──→ P-23 (conversion)
All Parent phases ──→ P-24 (player delta)
```

**Build now (unblocked):** Block 0 diagnostic (P-00a) and profile fixes (P-00b). Block 0 payment (P-00c)
and all 🔴 tasks build in Stripe test mode now; go live when PRE-2 clears.

---

## Risk & Gate Summary

- 🔴 tasks (payments / auth / child-data / RLS): P-00c, P-01, P-04, P-10, P-11, P-12, P-13, P-14, P-17,
  P-22, P-23 — each gets the extra quality gate and explicit Lasith approval at Step 0.
- Every task is diagnostic-first where it touches existing code.
- Schema migrations (P-01, parts of P-17/P-23) reviewed by `supabase-migration-reviewer`, verified against
  live staging before apply.
- Lasith owns all `git push` and merges; individual fix/feature branches; nothing committed direct to
  `develop`.

---

*Crikly Parent & Player Implementation Plan v1.0 — 19 June 2026. Feeds docs/10_BUILD_PLAN.md.
Block 0 (Guest Booking MVP) ships first; the full module follows in dependency order; Player is a delta of
Parent; Admin is a separate track.*
