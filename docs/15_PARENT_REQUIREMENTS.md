# Crikly — Parent & Player Module Requirements

**Version:** 1.0
**Last Updated:** 19 June 2026
**Status:** All 11 blocks elicited. 75 requirements locked. Ready for design → build planning.
**Elicited by:** Lasith Jayarathne
**Documented by:** Claude
**Applies to:** Parent & Player module build tasks (P-XX, to be added to `docs/10_BUILD_PLAN.md`)

This document is the single source of truth for all Parent and Player module product requirements.
No parent/player screen, schema change, or API route should be built without tracing back to a
requirement here. It is the demand-side counterpart to `docs/14_COACH_REQUIREMENTS.md` and consumes
nearly everything the coach module produces.

**Governing principle (REQ-P-038):** the parent/player module is a *consumer* of coach configuration.
Pricing, payment model, schedule, late-join, cancellation policy, and no-show policy are all set by the
coach. The demand side reads them, displays them transparently, and charges accordingly — it defines no
new commercial rules of its own.

**Player notation:** `[PAR]` parent-specific · `[PL]` player-specific · `[SHR]` shared. Parent and Player
were elicited together; the Player module is largely a delta of the Parent module.

---

## Table of Contents

1. [Registration & Onboarding](#block-1--registration--onboarding)
2. [Child → Player Conversion](#child--player-conversion)
3. [Child Profiles](#block-2--child-profiles)
4. [Age & Legal Model](#age--legal-model)
5. [Player Onboarding & Self-Profile](#block-3--player-onboarding--self-profile)
6. [Coach Search & Discovery](#block-4--coach-search--discovery)
7. [Coach Public Profile (demand-side)](#block-5--coach-public-profile-demand-side)
8. [Booking Flow — 1-on-1](#block-6--booking-flow--1-on-1)
9. [Booking Flow — Group Programmes](#block-7--booking-flow--group-programmes)
10. [Payment & Checkout](#block-8--payment--checkout)
11. [Bookings Management & Cancellations](#block-9--bookings-management--cancellations)
12. [Training Passport / Player Passport](#block-10--training-passport--player-passport)
13. [Reviews, Notifications & Settings](#block-11--reviews-notifications--settings)
14. [Schema Gap Analysis](#schema-gap-analysis)
15. [Coach Module Alignment Map](#coach-module-alignment-map)
16. [Admin Config Backlog](#admin-config-backlog)
17. [Phase 2 Backlog](#phase-2-backlog)
18. [Open Items, Verifications & Alignment Flags](#open-items-verifications--alignment-flags)
19. [Documentation Drift to Fix](#documentation-drift-to-fix)
20. [Requirements Index](#requirements-index)

---

## Block 1 — Registration & Onboarding

> **Framing:** the dominant parent entry path is a coach pasting a booking link into a WhatsApp parent
> group — not organic homepage arrival. A parent's first touch is usually a specific coach's link with
> booking intent already formed. Onboarding is designed for that path.

### REQ-P-001 — Unauthenticated browsing permitted
Visitors from any path (coach link, search, direct URL) may browse coach profiles, session types,
availability, and group programmes without an account. The auth wall fires at exactly one point:
**Confirm & Pay**. Nothing before that requires authentication.

### REQ-P-002 — Booking intent preserved across auth and OAuth
At the auth wall mid-booking, the full selection (coach ID, session type, slot datetime, group programme
ID where applicable) is preserved across authentication — including the Google OAuth round-trip — and the
user is returned to booking confirmation with the selection intact. Persist intent in URL params before
redirect; restore on `/auth/callback`.

### REQ-P-003 — Role landing: Parent Dashboard
On role selection or role-switch into Parent, the user lands on the Parent Dashboard. Exception: if active
booking intent is in play (REQ-P-002), the destination is booking confirmation.

### REQ-P-004 — Inline child selector with "add child"
At the first "Confirm booking," the inline prompt "Who is this session for?" presents existing children as
selectable options plus an explicit selectable **"Add a child"** option that reveals three inline fields
(name, DOB, sport) without leaving the flow. No separate onboarding wizard. (Single- vs multi-select is a
booking-flow decision — single-select by nature for a 1-on-1 slot.)

### REQ-P-005 — Minimal data at account creation
Sign-up collects only: name (OAuth-pulled or prompted), email, T&C acceptance (`terms_accepted_at`), and a
marketing opt-in checkbox. Location, phone, and the first child profile are collected lazily in-context.

---

## Child → Player Conversion

> A child becomes a player at the **adult age** (default 18, admin-configurable — see REQ-P-019). The
> conversion is a one-way handover that keeps only one live editable profile at any moment, removing any
> medical-data sync risk.

### REQ-P-006 — Conversion is a parent decision, never automatic
At the adult age, the parent receives a prompt (lives in the To-Do centre, REQ-P-009). The parent chooses
to hand over or not. The platform never auto-converts.

### REQ-P-006a — Decline / defer = status quo
If the parent doesn't hand over, the child profile stays active and editable under the parent, fully
bookable. They can be prompted again later.

### REQ-P-006b — Handover = one-way transfer
On handover, the player account becomes the single source of truth for all editable details and all
forward bookings. The child profile freezes: read-only, history only, no editing, no new bookings. The
parent keeps visibility of past sessions but nothing beyond the handover point. The freeze takes effect
when the teen **accepts** the invite and their account exists (never stranding a frozen profile).

### REQ-P-007 — History travels forward; parent retains read-only history
The full passport history moves with the teen into their player account and continues there. The parent's
frozen child profile still shows the historical record. Implemented via the `transitioned_player_id` link
— no data migration; the FK resolves at read time.

### REQ-P-008 — No auto-cutoff; parent controls profile lifecycle
No forced conversion at any age. The child profile persists — active until handover, frozen-read-only
after — until the parent removes it.

### REQ-P-009 — Parent To-Do / action centre
The Parent Dashboard includes a To-Do / action-items area surfacing pending actions: conversion prompts
("[Child] turned [adult age] — invite them to their own account"), incomplete bookings, review prompts
after completed sessions, and similar. → **GAP-P-01**.

**Schema note:** maps onto existing `child_profiles.transition_status`
(`child` → `transition_pending` → `transitioned`) and `transitioned_player_id`. The freeze is an RLS rule
(block UPDATE once `transitioned`) plus routing forward bookings to the player profile — logic, not new
columns. Verify RLS against live staging at build.

---

## Block 2 — Child Profiles  `[PAR]`

> **Data hierarchy: Parent > Child > Sport.**

### REQ-P-010 — Field requirements
Required: name, date of birth, at least one sport, skill level. Optional: photo, gender, medical notes,
notes for coach.

### REQ-P-011 — Default avatars
If no photo is uploaded, the child is assigned a friendly default avatar from a curated kids' set. If
gender is provided, the avatar matches; otherwise a neutral avatar is used. Generic and sport-agnostic so
it carries into tutoring/arts later.

### REQ-P-012 — Gender optional (avatar + coach context)
Optional field: male / female / other / prefer not to say (mirrors the coach enum). Used for default
avatar selection and shown to a confirmed coach as session context. Never shown publicly. → **GAP-P-03**.

### REQ-P-013 — Photo privacy
Optional; visible only to a confirmed coach post-booking; never publicly browsable.

### REQ-P-014 — Always editable; coach sees live
Child details are always editable, and a confirmed coach's booking view pulls the latest version (a new
medical note appears even on an already-booked session). The only exception is the post-handover freeze
(REQ-P-006b).

### REQ-P-015 — Skill level is per sport
Skill level moves off the child record onto a per-sport record (`child_sports`). → **GAP-P-02**.

---

## Age & Legal Model

> *Not legal advice — confirm with a solicitor and safeguarding advisor before build.* In England/Wales/NI
> legal adulthood is 18; under-18s are always safeguarding children; independent paid contracts with
> minors are generally not binding. The platform therefore treats 16–17-year-olds as parent-managed
> children, with full player independence at 18.

### REQ-P-016 — Passport serves three audiences *(provisional → realised in Block 10)*
(1) Parent tracks the child's progress; (2) coach tracks progress and programme delivery; (3) at each new
session the coach sees prior sessions' reports and history for continuity. Sectioned per sport via
`sport_id`. See REQ-P-057 to REQ-P-064.

### REQ-P-017 — Player minimum age = adult age
`player_profiles` minimum age is the configured adult age (default 18 — was 16 in the v1.1 schema; that
constraint and the schema doc need updating). Anyone under the adult age is, for safeguarding, a child.

### REQ-P-018 — Independent minors not supported in Phase 1
A 16–17-year-old with no guardian on the platform cannot self-register to book coaching; they require a
guardian account. Accepted Phase 1 limitation (safeguarding-positive).

### REQ-P-019 — Age thresholds admin-configurable
All age-gated logic reads from `platform_config`, never a hardcoded constant. → **GAP-P-04**
(`platform_config.adult_age integer NOT NULL DEFAULT 18`), driving player eligibility, the conversion
trigger, and the child/adult boundary. Single global value for Phase 1; extensible to per-region later.

---

## Block 3 — Player Onboarding & Self-Profile  `[PL]`

### REQ-P-020 — Two player arrival paths
**(A) Converted from a child at the adult age** — one-screen "take ownership": details pre-populated from
the child record (incl. `child_sports → player_sports`), passport history carried forward; player confirms
info + accepts T&Cs as account holder. **(B) Fresh adult (18+) signup** — minimal signup (name, email,
T&C, marketing), no child step; own sport + per-sport skill + optional medical collected inline at first
booking.

### REQ-P-021 — Player self-profile fields
Mirror the child profile, minus parent management: name, DOB (adult-age gated), gender (optional), photo
(optional → default avatar), per-sport skill (`player_sports`), medical notes (optional). The player owns
and edits all of it.

---

## Block 4 — Coach Search & Discovery  `[SHR]`

> Search already exists on the live landing page (activity + location) and a public `/coaches` listing
> at `/search`. The dashboard search reuses the same component. Designed sport-agnostic for future
> expansion (tutoring/arts).

### REQ-P-022 — Search axis: activity + location
Primary filters are activity then location — already live on the landing page. Reused as-is.

### REQ-P-023 — Sort options
Nearest · Highest rated · Price (low→high) · Most availability. Default: Nearest when location known,
Highest rated otherwise.

### REQ-P-024 — List-first for Phase 1
List view with distance labels. Map deferred to Phase 2 (also protects coach venue privacy per
REQ-C-010).

### REQ-P-025 — Premium coaches ranked to the top *(Phase 2)*
A tier-based ranking boost pushes Premium-subscribed coaches up results. Distinct from the admin manual
`is_featured` flag — automatic and tier-driven. Ranking weights admin-configurable. Depends on the
subscription engine being live.

### REQ-P-026 — Search entry inside the parent dashboard
The dashboard gets a "Find a coach" entry that opens the same discovery experience as the public site —
one shared search + results component, two entry points. No second search build.

### REQ-P-027 — Empty state widens, never dead-ends
When no coaches match the immediate area, the radius widens automatically and shows nearest available
coaches with honest distance labels plus a light "we're growing in your area" line.

### REQ-P-028 — Save / favourite a coach *(Phase 2)*
Deferred. "Saved coaches" view in the dashboard.

### REQ-P-029 — Group programmes in search
Search returns coaches and group programmes in one scroll with **All · 1-on-1 · Group** filter chips
(default All). Group cards carry a distinct "Group" tag. Group programmes also remain visible on each
coach's own profile (REQ-C-052).

---

## Block 5 — Coach Public Profile (demand-side)  `[SHR]`

> The coach public profile is already built and live (`/coaches/[id]`), anonymous-viewable.

### REQ-P-030 — Persistent Book CTA → booking flow
Primary "Book a session" action on the profile (sticky on mobile), routing to `/book/[coachId]`. Present
on the live build.

### REQ-P-031 — Availability preview on profile *(as-built)*
7-day slot strip with inline available slots, next-session indicator, and response-time line. Confirmed
live — no rebuild.

### REQ-P-032 — Reviews on profile *(built)*
Most recent first, rating average + count pinned, with a "See all reviews" expander. Confirmed built.

---

## Block 6 — Booking Flow — 1-on-1  `[SHR]`

> Same build event as the coach-side bookable widget (CG-BookableWidget-01) — built together. Entry exists
> at `/book/[coachId]`.

### REQ-P-033 — Booking flow skeleton (generic)
Select the bookable item (1-on-1 slot / session type / group programme) → "who's it for?" (child select or
add-child inline, REQ-P-004) → review summary → Confirm & Pay (auth wall here). Same skeleton across 1-on-1
and group; summary content adapts per type.

### REQ-P-034 — Transparent cost breakdown before payment
The review summary shows itemised cost — e.g. "Session £60 · Service fee £6 · Total £66" — before the card
step. The 10% commission (BR-01) is never hidden.

### REQ-P-035 — Multi-child via named programmes
1-on-1 is strictly single-child. "A few kids together" is served by enrolling multiple children into a
**named programme (Model A)** — which is built — each taking a spot, per-participant pricing. The ad-hoc
shared-slot route (Model B) is **deferred** (coach-side gap — see VERIFY-P-01).

### REQ-P-036 — Manual-approval: authorise now, capture on approval, with clear messaging
For manual-approval coaches (REQ-C-045): authorise the card at Confirm & Pay; capture only on coach
approval; release on decline/timeout — never charged for a declined booking. Parent-facing messaging is
explicit at every step (won't be charged until accepted / waiting / confirmed-and-taken / not-charged).
→ 🔴 payments gate at build.

### REQ-P-037 — Slot taken mid-checkout
Soft-hold the slot during checkout; if genuinely gone at confirm, show "that slot was just taken" with
nearest alternatives.

### REQ-P-043 — Duration selection in the booking flow
A coach can offer multiple durations with different prices. When booking a 1-on-1, the parent selects the
duration as part of step 1; price and available slots both reflect that choice. Single duration →
auto-selected.

---

## Block 7 — Booking Flow — Group Programmes  `[SHR]`

> **Build verdict (VERIFY-P-01):** buildable now for **named programmes (Model A)** — the full stack
> (`group_programmes`, `group_programme_sessions`, `group_programme_enrolments`, create flow, enrolment +
> roster routes) exists. Model B (shared slot) has no creation path and is deferred.

### REQ-P-038 — The parent module consumes coach configuration *(governing principle)*
Pricing, payment model, schedule, late-join, cancellation, and no-show policy are all set by the coach at
creation. The parent side reads them, displays them transparently, and charges accordingly — it defines no
new commercial rules of its own.

### REQ-P-039 — Multi-child enrolment pricing
Phase 1: per-participant price × N (each child consumes one spot). Flexible pricing ("same price" /
surcharge) requires COACH-ENH-01's additional-child field — **deferred** (confirmed: no incremental
pricing column exists).

### REQ-P-040 — Payment model is coach-configured, parent-displayed
"£15 per session" vs "£90 for all 6 sessions" shown plainly before pay (REQ-C-048).

### REQ-P-041 — Late join *(for now)*
Per coach config (REQ-C-051): pay remaining/pro-rata shown clearly, or "closed to new joiners."

### REQ-P-042 — Roster privacy (parent side)
A parent enrolling sees only the spot count ("4 of 8 spots"), never other children's names or photos
(mirrors REQ-C-054).

---

## Block 8 — Payment & Checkout  `[SHR]`

> Touches Stripe — 🔴 build gate. UK payments require SCA/3-D Secure; Stripe handles the challenge via
> PaymentIntents, the flow accommodates the extra step.

### REQ-P-044 — Saved cards for one-tap re-booking
After a successful first payment, the card is saved on a Stripe Customer for one-tap repeat bookings
(shown as "Visa ••42"), add/remove in settings. Card data never touches Crikly (SAQ-A). → 🔴 gate.

### REQ-P-045 — Promo / discount codes
"Have a code?" field on the review summary, applied to the total before payment. The code-generation
engine belongs to the Admin module (deferred); Phase 1 codes seedable via DB.

### REQ-P-046 — Declined card
Plain-English error; parent stays on the payment step to retry or switch card; slot held briefly during
retry.

### REQ-P-047 — Booking confirmation + email receipt
After payment: an in-app "Booking confirmed" screen plus an email receipt via Resend (`bookings@crikly.app`)
with the booking reference (CRK-YYYY-NNNN, BR-12), coach, date/time/duration, sport, cost breakdown,
the now-revealed venue (REQ-C-010), and the cancellation policy.

---

## Block 9 — Bookings Management & Cancellations  `[SHR]`

### REQ-P-048 — Bookings list
Three tabs — Upcoming · Past · Cancelled. Pending-approval bookings sit in Upcoming with a "Pending
approval" badge. The dashboard child-switcher (Overview / per-child) filters the list.

### REQ-P-049 — Cancellation with refund preview
On cancel, show a clear refund preview before confirming, driven by the coach's cancellation window
(REQ-C-043): full refund vs "inside the window — no refund." Explicit confirm.

### REQ-P-050 — Reschedule in MVP (price-neutral slot move)
Reschedule = moving an existing booking to a different slot, same coach, same session type, same duration,
same price → no money moves. (Different duration/price = cancel + rebook.)

### REQ-P-051 — Reschedule rules
1-on-1 only (group = cancel, not reschedule); into any same-coach, same-type, same-price slot; allowed up
to the coach's cancellation cutoff; **max 2 reschedules** per booking (admin-configurable later);
manual-approval coaches re-approve the new slot, auto-approval is instant. Build note: reschedule frees the
old slot, locks the new one, and notifies the coach.

### REQ-P-052 — Booking detail (parent view)
Coach (name, photo), date/time/duration, sport, session type, the child, venue + map pin (post-booking),
booking reference, amount paid, cancellation policy + remaining window, and actions: Cancel · Reschedule ·
Add to calendar · Contact coach.

### REQ-P-053 — Add to calendar
.ics / add-to-calendar action on confirmation and booking detail (iOS/Android/Google).

### REQ-P-054 — Contact unlock (BR-07)
On a confirmed booking, both parties' name + email (phone if provided) appear on the booking detail and in
the confirmation email. No in-app messaging in Phase 1. *(BR-07 should be updated to specify these exact
fields.)*

### REQ-P-055 — Group programme cancelled / minimum not met
Parent is notified and auto-refunded for undelivered sessions; booking moves to Cancelled with a clear
reason (parent-side view of REQ-C-056/058).

### REQ-P-056 — No-show outcome
Parent notified, refund applied per the coach's no-show policy (full/partial/none, REQ-C-070).

---

## Block 10 — Training Passport / Player Passport  `[PAR]` `[PL]`

> **Ownership model ("immigration officer"):** the passport belongs to the child (parent-managed) or the
> player. Coaches stamp it (add entries for their own sessions) and read it subject to permission; they
> never own or delete it. Spine already exists (`passport_entries` per `sport_id`, `performance_reports`,
> `passport_privacy`).

### REQ-P-057 — Passport ownership
The passport belongs to the child/player. Coaches contribute entries for their own sessions and read
subject to the owner's privacy settings; they never own or delete it.

### REQ-P-058 — Per-sport structure & entry contents
Organised by sport, reverse-chronological; each entry shows date, coach, duration, and the coach's shared
notes / report.

### REQ-P-059 — Base privacy
`open` / `booking_only` / `private`; owner-set; default `booking_only`. (open = any coach; booking_only =
confirmed-booking coach; private = basic profile only.)

### REQ-P-060 — Cross-coach visibility control
A second privacy dimension: the owner opts in/out of letting a viewing coach see *other coaches'* entries
(esp. same-sport, multi-coach). **Default OFF** — a coach sees only their own stamps unless the owner opts
in. → **GAP-P-05**.

### REQ-P-061 — Owner sees shared content only
Parent/player sees shared reports + basic notes, never coach-private notes (`coach_notes` / internal
`session_notes`, REQ-C-065).

### REQ-P-062 — Progress visualisation *(Phase 1)*
Per sport: sessions-completed count, rating trend (from Premium `performance_reports.overall_rating`),
skill-level progression. Degrades gracefully to session count + activity where only free-tier notes exist.

### REQ-P-063 — Export / share *(Phase 1)*
PDF export of the per-sport history, plus a revocable, privacy-governed shareable read-only link.
→ infra (PDF generation + link tokens).

### REQ-P-064 — Programme reports → passport (hybrid)
On group-session completion: auto-create one passport entry per enrolled child + a shared session summary
applied to all + optional per-child individual report (Premium). Each child's passport shows their entry +
the shared summary + their own report if written. → **GAP-P-06**.

---

## Block 11 — Reviews, Notifications & Settings  `[SHR]`

### REQ-P-065 — Review prompt after completion
Prompt appears after the coach marks the session complete (REQ-C-066), via To-Do + notification.

### REQ-P-066 — Review optional
Star required if reviewing; comment optional (matches `reviews`: `rating` required, `comment` nullable).

### REQ-P-067 — 24-hour edit window
Editable for 24h, then locked. → small schema/RLS tweak (current schema disallows UPDATE).

### REQ-P-068 — Coach responses displayed
Coach review responses already exist on the coach side; the parent/public profile view displays the
coach's reply beneath each review. *(Verify where coach responses are stored — not in the v1.1 schema
doc.)*

### REQ-P-069 — Reviewer identity
Shown as first name + last initial ("Sarah W.").

### REQ-P-070 — Notification triggers
Booking confirmed · session reminder · cancellation · reschedule · pending-approval outcome · review
prompt · programme cancelled / min-not-met · no-show outcome · contact unlocked.

### REQ-P-071 — Channels & marketing
Per-category email/push toggles, transactional default on; marketing a separate opt-in, default off
(GDPR). Maps to existing `notification_preferences` columns.

### REQ-P-072 — Reminder timing
24 hours before + a 1-hour nudge.

### REQ-P-073 — Settings sections
Profile · Children · Payment methods · Passport privacy · Notifications · Switch role · Legal · Delete
account · Sign out.

### REQ-P-074 — Delete account (GDPR)
Resolve upcoming bookings first; personal data soft-deleted/anonymised; financial records retained
(anonymised, legally required); child passport removed with the child profile while the coach's anonymised
financial record persists.

### REQ-P-075 — Profile editing
Name, contact, location, avatar freely editable; email change requires re-verification.

---

## Schema Gap Analysis

Baseline: schema v1.1 + applied coach gaps. **All GAP-P items must be verified against live staging before
any migration is written.**

### GAP-P-01 — Parent To-Do / action centre
**Requirement:** REQ-P-009. Either a derived query layer (over `notifications` + booking/conversion states)
or a small dedicated structure. Assess against staging in Block 11 build.

### GAP-P-02 — `child_sports` / `player_sports` (per-sport skill)
**Requirement:** REQ-P-015, REQ-P-021. New tables holding `(child_profile_id|player_profile_id, sport_id,
skill_level)`. `skill_level` moves off `child_profiles`/`player_profiles`; `sport_ids[]` becomes derived.
Mirrors `coach_sports`.

### GAP-P-03 — Child gender
**Requirement:** REQ-P-012. Add `gender text` to `child_profiles` (and optionally `player_profiles` for
parity). Values: male / female / other / prefer_not_to_say.

### GAP-P-04 — `platform_config.adult_age`
**Requirement:** REQ-P-017, REQ-P-019. `adult_age integer NOT NULL DEFAULT 18`. Drives player eligibility,
conversion trigger, child/adult boundary.

### GAP-P-05 — Cross-coach passport visibility
**Requirement:** REQ-P-060. A setting on `child_profiles`/`player_profiles` controlling whether a viewing
coach sees other coaches' passport entries. Default OFF.

### GAP-P-06 — Group per-participant passport entries + shared summary
**Requirement:** REQ-P-064. On group-session completion, generate one `passport_entries` row per enrolled
child; add a shared-session-summary field (likely on `group_programme_sessions`). Per-child reports use
existing `performance_reports` (one per entry).

### Minor schema tweaks
- Player minimum age 16 → 18 (constraint + schema doc) — REQ-P-017.
- Reviews 24-hour edit window — relax the current "UPDATE not permitted" RLS — REQ-P-067.
- Passport export/share infrastructure (PDF + revocable link tokens) — REQ-P-063.
- Confirm where coach review responses are stored (live schema is ahead of the v1.1 doc) — REQ-P-068.

---

## Coach Module Alignment Map

| Coach capability | Status | Parent/Player consumption |
|---|---|---|
| 1-on-1 session types + durations | ✅ Built | Parent selects type + duration (REQ-P-043) |
| Named group programmes (Model A) | ✅ Built | Parent enrols, multi-child (REQ-P-035/039) |
| Shared slot (Model B) | ❌ Not built | Deferred — siblings route via Model A |
| Availability templates | ✅ Built | Slot picker (REQ-P-031/033) |
| Booking policy (cancellation, manual approval) | ✅ Built | Refund preview, pending state (REQ-P-036/049) |
| No-show policy | ✅ Built | Outcome shown to parent (REQ-P-056) |
| "Mark complete" → passport entry | ✅ Built | Auto passport entry (REQ-P-057+) |
| Performance reports (Premium, 7-day) | ✅ Built | Shown if `is_shared_with_parent` (REQ-P-061) |
| Training Passport privacy | ✅ Built | Owner sets it (REQ-P-059/060) |
| Contact details post-booking (BR-07) | ✅ Built | Shown on confirmation (REQ-P-054) |
| Booking reference (CRK-YYYY-NNNN) | ✅ Built | Shown in detail/receipt (REQ-P-047/052) |
| Coach public profile | ✅ Built | Whole discovery experience (Block 5) |
| Reviews + coach response | ✅ Built | Displayed (REQ-P-068) |
| Bookable widget (CG-BookableWidget-01) | ⚠️ Pending | Same build event as booking flow (Block 6) |
| Additional-child pricing | ❌ Not built | COACH-ENH-01 — deferred |
| "Group" checkbox on Sport screen | ⚠️ Dead UI | Captures no price/size; clean up coach-side |

---

## Admin Config Backlog

Items surfacing during parent/player elicitation that the Admin module must expose (inherits the Jan 2026
admin PRD plus these):

- `adult_age` (default 18) — REQ-P-019 / GAP-P-04
- Reschedule max-count (default 2) — REQ-P-051
- Search ranking weights (premium boost, featured boost, distance/rating balance) — REQ-P-025
- Promo / discount code engine — REQ-P-045
- *(Existing coach-side: commission per sport/user, payout delay, cancellation window, performance-report
  window, tax-year start.)*

---

## Phase 2 Backlog

- Save / favourite a coach (heart + "Saved coaches" view) — REQ-P-028
- Map search view — REQ-P-024
- Premium-coach ranking boost (needs subscription engine) — REQ-P-025
- Model B shared-slot enrolment (needs coach-side build)
- Additional-child pricing (COACH-ENH-01)
- In-app messaging (BR-07 — Phase 1 is email + push only)

---

## Open Items, Verifications & Alignment Flags

- **VERIFY-P-01 — closed.** Group enrolment buildable now for Model A (named programmes). Model B not
  built (deferred). The "Group" checkbox on the Sport & pricing onboarding is dead UI (captures
  `price_group_pence: null`, `max_group_size: null`, unlocks nothing) — clean up coach-side. Additional-
  child pricing absent. Dependency tables (`group_programmes`, `group_programme_sessions`,
  `group_programme_enrolments`) confirmed in code/migrations; staging row population unverified.
- **INFRA flag — Supabase MCP wrong account.** Claude Code's Supabase MCP only has access to unrelated
  projects ("AI Investor Agent", "AI Stock Agent"), not the Crikly org — `get_project` and `execute_sql`
  against `gzehxfnlfogkhadejowo` were denied. Reconnect the Supabase MCP to the org holding staging/prod
  before any DB-touching Claude Code task. (Read-only verification SQL from VERIFY-P-01 can then confirm
  group table population.)
- **COACH-ENH-01** — add `additional_participant_price_pence` to programmes (default = base = per-child)
  for flexible multi-child pricing. Built coach-side first.
- **ALIGN-P-01** — landing persona CTAs ("Find a coach for my child") currently route to `/register`;
  per REQ-P-001 they should route into browse, with the auth wall at Confirm & Pay.
- **Coach-side cleanup** — remove or wire the dead "Group" checkbox on the Sport & pricing screen.

---

## Documentation Drift to Fix

- **BR-06** in `docs/05_BUSINESS_RULES.md` contradicts REQ-C-045's manual-approval mode — rewrite.
- **BR-16 to BR-19** absent from the v1.0 business rules doc — add (manual approval, group refund, block
  late-joiner pro-rata, no-show refund).
- **BR-07** should specify the exact contact fields shared post-booking (name + email, phone if provided)
  — REQ-P-054.
- Schema doc baselines against v1.1 pre-Migration 014; all GAP-P analysis baselines against v1.1 + applied
  coach gaps, verified against live staging.

---

## Requirements Index

| Block | Requirements | Status |
|---|---|---|
| 1 — Registration & Onboarding | REQ-P-001 to REQ-P-005 | ✅ |
| Child → Player Conversion | REQ-P-006 to REQ-P-009 (+006a/b) | ✅ |
| 2 — Child Profiles | REQ-P-010 to REQ-P-015 | ✅ |
| Age & Legal Model | REQ-P-016 to REQ-P-019 | ✅ |
| 3 — Player Onboarding & Self-Profile | REQ-P-020 to REQ-P-021 | ✅ |
| 4 — Coach Search & Discovery | REQ-P-022 to REQ-P-029 | ✅ |
| 5 — Coach Public Profile (demand-side) | REQ-P-030 to REQ-P-032 | ✅ |
| 6 — Booking Flow — 1-on-1 | REQ-P-033 to REQ-P-037, REQ-P-043 | ✅ |
| 7 — Booking Flow — Group | REQ-P-038 to REQ-P-042 | ✅ (Model A; Model B deferred) |
| 8 — Payment & Checkout | REQ-P-044 to REQ-P-047 | ✅ |
| 9 — Bookings Management & Cancellations | REQ-P-048 to REQ-P-056 | ✅ |
| 10 — Training / Player Passport | REQ-P-057 to REQ-P-064 | ✅ |
| 11 — Reviews, Notifications & Settings | REQ-P-065 to REQ-P-075 | ✅ |

**Total: 75 requirements. All Parent & Player elicitation complete.**

---

*Crikly Parent & Player Requirements v1.0 — 19 June 2026*
*Elicited by Lasith Jayarathne. Documented by Claude.*
*Demand-side counterpart to docs/14_COACH_REQUIREMENTS.md. Read before building any parent/player screen,
schema change, or API route.*
