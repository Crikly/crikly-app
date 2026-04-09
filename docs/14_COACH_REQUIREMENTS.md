# Crikly — Coach Module Requirements

**Version:** 1.1
**Last Updated:** March 2026
**Status:** Blocks 1–8 (Onboarding, Profile, Sports, Qualifications, Stripe, Tiers, Availability, Booking Policy) — ✅ Complete. Group Sessions, Bookings, Earnings — 🟡 Pending elicitation.
**Elicited by:** Lasith Jayarathne
**Documented by:** Claude
**Applies to:** Build tasks C-01 through C-24

This document is the single source of truth for all Coach module product requirements.
No coach screen, schema change, or API route should be built without tracing back to a requirement here.
It supersedes any assumptions made in earlier design sessions.

---

## Table of Contents

1. [Registration & Onboarding Flow](#1-registration--onboarding-flow)
2. [Coach Identity & Profile](#2-coach-identity--profile)
3. [Sports & Coaching Offer](#3-sports--coaching-offer)
4. [Qualifications & Trust](#4-qualifications--trust)
5. [Stripe & Payment Setup](#5-stripe--payment-setup)
6. [Going Live & Subscription Tiers](#6-going-live--subscription-tiers)
7. [Availability & Sessions](#7-availability--sessions)
8. [Booking Policy](#8-booking-policy)
9. [Schema Gap Analysis](#9-schema-gap-analysis)
10. [New Build Plan Tasks Required](#10-new-build-plan-tasks-required)
11. [Pending Elicitation Areas](#11-pending-elicitation-areas)

---

## 1. Registration & Onboarding Flow

### REQ-C-001 — Dashboard-first entry
When a user selects the Coach role for the first time, they land on the coach dashboard —
not a wizard. A profile completion prompt is shown immediately on the dashboard.
The onboarding wizard is accessed from this prompt.

### REQ-C-002 — Profile completion percentage
The dashboard shows a profile completion percentage (e.g. 60% complete).
It updates in real time as the coach completes each section.
The percentage is calculated from required fields only — optional fields do not affect it.

### REQ-C-003 — Minimum required to go live
A coach profile can go live with all sections complete **except** Stripe Connect.
Stripe is the only section that is optional for going live.
All other sections (profile, sport & pricing, qualifications, availability, booking policy)
must be complete before the "Go live" button becomes active.

### REQ-C-004 — Resume from where you left off
If a coach leaves the onboarding wizard mid-way and returns later, they resume from
the last incomplete step — not from step 1.
Progress is persisted to the database, not browser state.

### REQ-C-005 — Multi-role accounts
A coach can simultaneously hold parent and/or player roles on the same account.
Role switching is handled via the existing context switcher.
Each role maintains independent profile data.

---

## 2. Coach Identity & Profile

### REQ-C-006 — Display name only at onboarding; legal name only at DBS
The coach profile uses a single **display name** shown publicly on their profile,
search results, bookings, and all parent-facing surfaces.
A separate **legal full name** is only collected when a coach applies for DBS verification.
Legal name is never shown publicly and is used only for identity verification.

**Schema note:** `coach_profiles.display_name` (new column — see GAP-07).
Legal name stored in `dbs_verifications` table (already exists) at DBS application time.

### REQ-C-007 — Profile photo is mandatory; gallery model
A profile photo is **required** before a coach can go live.
It is the first (primary) item in the coach photo gallery.
- Free tier: 1 photo maximum (enforced via `tier_features` limit)
- Premium tier: unlimited photos

The gallery supports ordering — primary photo is always shown first in search results.

### REQ-C-008 — Bio is free text with a guiding prompt
Bio is a free-text field with a 500-character limit.
A placeholder prompt guides coaches:
*"Tell parents about your coaching style, experience, and what to expect from a session with you."*
Character count displayed as coach types.

### REQ-C-009 — Base location for search proximity
Coaches set a **base location** using Google Places autocomplete.
Input accepts town, city, or postcode.
Used for proximity-based search — parents searching nearby will surface this coach.
Stored as: city/town name, postcode, latitude, longitude (existing fields on `user_profiles`).
Shown on public profile as a general area (e.g. "Oval, London") — not full postcode.

### REQ-C-010 — Session location set per session
When creating availability blocks or sessions, coaches set a **specific coaching venue**
using Google Places autocomplete.
This is separate from their base location.
Venue name, address, and a map pin are shown to parents **after** a booking is confirmed.
Not shown to parents before booking (privacy — exact location revealed post-payment).

### REQ-C-011 — Travel radius
Coaches can optionally set a **travel radius** from their base location.
Expressed in miles (e.g. "I coach within 10 miles of SW8").
Used as a search filter — parents can find coaches willing to travel to their area.
Default: no travel radius set (coach only coaches at their set venues).

**Schema note:** `coach_profiles.travel_radius_miles` integer column (new — see GAP-03).

### REQ-C-012 — Gender field (optional, public, filterable)
Gender is an optional field on the coach profile.
Values: Male / Female / Other / Prefer not to say.
Shown publicly on the coach profile.
Used as a search filter — parents can filter for a specific gender preference.
Existing field on `coach_profiles.gender` — already in schema.

### REQ-C-013 — Years of experience (range picker)
Years of experience is collected as a range selection, not a free-number input.
Options: 0–2 years / 3–5 years / 6–10 years / 10+ years.
Shown on the public coach profile.

**Schema note:** Current schema uses `coach_profiles.years_experience` as integer.
Store the minimum of the range (e.g. "6–10 years" = store 6) and display as range in UI.
Or change column to text — decision for M-14.

### REQ-C-014 — Languages spoken (optional)
Coaches can optionally list languages they speak.
Multi-select from a predefined list (English, Sinhala, Tamil, Urdu, Hindi, Punjabi, Bengali,
Arabic, French, Spanish — admin expandable).
Shown on the public profile.
**Not** filterable in search for Phase 1 (display only).

**Schema note:** `coach_profiles.languages` text[] column (new — see GAP-06).

### REQ-C-015 — Shareable public profile URL
Every coach gets a shareable public profile URL:
`crikly.app/coach/[slug]`
Slug auto-generated from display name (e.g. `ravi-sharma`).
If slug already exists, append a number (e.g. `ravi-sharma-2`).
Coaches **cannot** customise the slug in Phase 1.
A "Copy profile link" button is shown on the coach dashboard.

---

## 3. Sports & Coaching Offer

### REQ-C-016 — Multiple sports, fully separate per sport
A coach can offer multiple sports (e.g. cricket AND football).
Each sport is configured **independently** with its own:
- Pricing
- Availability template
- Qualifications
- Session types, skill levels, age groups

Adding a second sport does not share or inherit settings from the first.
Each sport maps to a separate row in `coach_sports`.

### REQ-C-017 — Per-sport configuration fields
For each sport a coach offers, they must configure:
| Field | Required | Notes |
|---|---|---|
| Sport | Yes | From `sports` table |
| Session types | Yes | Individual / Group / Both |
| Skill levels | Yes | Multi-select: Beginner / Intermediate / Advanced |
| Age groups | Yes | Multi-select — see REQ-C-018 |
| Session durations & pricing | Yes | See REQ-C-019 |
| Max group size | If group sessions offered | Integer |
| Qualifications for this sport | No | Linked from qualifications section |

### REQ-C-018 — Age groups (separate field from skill level)
Coaches specify which **age groups** they coach as a separate field per sport.
Age group options (multi-select):
- Under 8
- Under 10
- Under 12
- Under 14
- Under 16
- Adults (17+)

Parents can filter search results by age group.
This is separate from skill level — a coach might coach "Beginner Adults" but not "Beginner Under 8s".

**Schema note:** `coach_sports.age_groups` text[] column (new — see GAP-02).

### REQ-C-019 — Multiple session durations at different prices per sport
For each sport, a coach can offer **multiple session durations** at different prices.
This creates a **pricing matrix** per sport.

Example:
| Duration | Individual price | Group price (per person) |
|---|---|---|
| 30 min | £30 | £15 |
| 60 min | £50 | £25 |
| 90 min | £70 | £35 |

A coach must offer at least one duration.
Maximum durations per sport: no hard limit for Phase 1.

**Schema note:** New table `coach_session_types` required (see GAP-01).
This replaces the single `price_individual_pence` / `price_group_pence` / `session_duration_minutes`
approach on `coach_sports`. Those columns should be deprecated or removed in M-14.

### REQ-C-020 — Max group size per sport
For each sport where group sessions are offered, the coach sets a maximum group size.
Enforced at booking time — a group session slot closes when max participants is reached.
Existing field: `coach_sports.max_group_size`.

### REQ-C-021 — Specific coaching venues on profile
Beyond their base location, coaches can list **specific venues** they regularly coach at.
Added via Google Places autocomplete.
Multiple venues supported.
One venue can be marked as the primary/default venue.
These venues appear on the coach's public profile as an information list.
Used as the default venue when creating availability blocks (overridable per block).

**Schema note:** New table `coach_venues` required (see GAP-04).

---

## 4. Qualifications & Trust

### REQ-C-022 — Qualifications: structured list + free-text custom entries
Coaches add qualifications in two ways:
1. **Structured:** pick from admin-configured `qualification_types` list
   (ECB Level 1, ECB Level 2, FA Level 2, LTA Level 3, First Aid, Safeguarding, etc.)
2. **Custom:** add a free-text entry if their qualification is not in the list

Both types are displayed identically on the public profile.
No limit on number of qualifications a coach can add.

### REQ-C-023 — Qualification fields shown publicly
For each qualification, the following are collected:

| Field | Required | Public | Notes |
|---|---|---|---|
| Name | Yes | Yes | From list or custom text |
| Issuing body | Yes | Yes | e.g. ECB, FA, LTA, St John Ambulance |
| Year issued | No | Yes | Display as issued year |
| Expiry date | No | Yes | Display as "Expires [month year]" if set |
| Certificate photo | No | No | Stored in Supabase Storage — admin review only |

Expired qualifications (expiry_date < today) are shown with an "Expired" indicator.
Coaches should be nudged to renew before expiry (notification — not in scope for Phase 1).

### REQ-C-024 — DBS: admin manual override for Phase 1
Full DBS payment integration is Phase 2. For Phase 1:
- The DBS badge **does exist** as a feature
- Admin can manually mark a coach as DBS verified via the admin panel
- This is used for coaches Crikly onboards directly in person
- The DBS badge then appears on the coach's public profile and search card
- Coaches cannot self-apply for DBS in Phase 1

The `coach_profiles.dbs_status` field already exists in the schema.
Admin sets it to `'verified'` manually. No payment flow in Phase 1.

### REQ-C-025 — Additional trust signals
| Trust signal | How handled | Phase |
|---|---|---|
| First aid certificate | Added as a qualification entry — no separate field | Phase 1 |
| Club affiliation | Free-text field on coach profile — optional (e.g. "Surrey Cricket Club") | Phase 1 |
| Public liability insurance | Not required — not in Phase 1 | Phase 2 |
| Enhanced CRB check | Not required — not in Phase 1 | Phase 2 |

**Schema note:** `coach_profiles.club_affiliation` text column (new — see GAP-05).

---

## 5. Stripe & Payment Setup

### REQ-C-026 — Stripe not required to go live
Coaches can complete their profile and appear in search results without connecting Stripe.
Stripe Connect is optional at onboarding and can be set up at any time from their dashboard.

### REQ-C-027 — Booking blocked if Stripe not connected
If a parent attempts to book a coach who has not connected Stripe:
- The booking is **blocked** — payment cannot be taken
- Parent sees: *"This coach isn't set up to accept online payments yet."*
- The coach remains fully visible in search results (not hidden)
- The coach is nudged via notification to complete Stripe setup

### REQ-C-028 — Profile incomplete state: percentage + checklist
The coach dashboard shows both:
1. A **completion percentage bar** at the top of the profile prompt
2. A **checklist** showing exactly which sections are incomplete, each with a direct link

Checklist items (required only):
- [ ] Profile photo
- [ ] Bio
- [ ] Base location
- [ ] At least one sport configured
- [ ] Availability template set
- [ ] Booking policy confirmed
- [ ] Set up payments (Stripe Connect) — *"Required to accept bookings"*

Stripe is listed last to signal it is optional for going live but needed for payments.

### REQ-C-029 — Payment setup confirmation
Once Stripe Connect is successfully completed, the dashboard shows:
*"Payment setup complete ✓"*
The Stripe checklist item is marked complete.
The profile completion percentage updates to reflect this.

---

## 6. Going Live & Subscription Tiers

### REQ-C-030 — Coach manually taps 'Go live'
When all required fields are complete (excluding Stripe), the *"Go live"* button becomes
active on the dashboard. The coach must deliberately tap it to publish their profile.
This gives them a deliberate review moment before appearing in search.
Admin approval is **not required** — it is instant on tap.

### REQ-C-031 — Go live confirmation screen
After tapping *"Go live"*, coach sees a confirmation screen:
- *"Your profile is now live."*
- *"Parents searching for [sport] coaches near [location] can now find and book you."*
- Link to preview their public profile
- Single callout for Premium upgrade (see REQ-C-032)

`coach_profiles.is_profile_live` is set to `true` at this moment.

### REQ-C-032 — No Premium upsell during onboarding wizard
The onboarding wizard is kept clean — no Premium hints, upgrade prompts, or feature
comparisons during any of the onboarding steps.
Premium is mentioned only once: as a single callout on the *"Go live"* confirmation screen.

### REQ-C-033 — Premium upgrade via dedicated settings page
Coaches upgrade to Premium from a dedicated upgrade page.
Access route: sidebar → Settings → Upgrade to Premium.
There is **no persistent banner** on the coach dashboard.
The upgrade page is accessible at any time after going live.

---

## 7. Schema Gap Analysis

All gaps below require **Migration 014** before C-05 (coach API routes) is started.

### GAP-01 — Session duration + pricing matrix
**Requirement:** REQ-C-019
**Current state:** `coach_sports` has single `price_individual_pence`, `price_group_pence`, `session_duration_minutes`
**Gap:** No support for multiple durations at different prices
**Fix:** New table `coach_session_types`:
```
coach_session_types
  id uuid PK
  coach_sport_id uuid FK → coach_sports(id)
  duration_minutes integer NOT NULL
  price_individual_pence integer NULL
  price_group_pence integer NULL
  currency text NOT NULL DEFAULT 'GBP'
  is_active boolean NOT NULL DEFAULT true
  created_at timestamptz
  updated_at timestamptz
  UNIQUE(coach_sport_id, duration_minutes)
```
RLS: SELECT public (when coach live), INSERT/UPDATE/DELETE coach only.

### GAP-02 — Age groups
**Requirement:** REQ-C-018
**Current state:** No age group field anywhere
**Fix:** Add `age_groups text[]` column to `coach_sports`
Options stored as: 'u8', 'u10', 'u12', 'u14', 'u16', 'adults'

### GAP-03 — Travel radius
**Requirement:** REQ-C-011
**Current state:** No travel radius field
**Fix:** Add `travel_radius_miles integer NULL` to `coach_profiles`
NULL = no travel (coaches only at their set venues)

### GAP-04 — Coach venues
**Requirement:** REQ-C-021
**Current state:** No coach venue listing (Phase 3 has full venue table — separate concern)
**Fix:** New table `coach_venues`:
```
coach_venues
  id uuid PK
  coach_profile_id uuid FK → coach_profiles(id)
  venue_name text NOT NULL
  venue_address text NOT NULL
  lat numeric(10,7) NULL
  lng numeric(10,7) NULL
  is_primary boolean NOT NULL DEFAULT false
  created_at timestamptz
  updated_at timestamptz
```
RLS: SELECT public (when coach live), INSERT/UPDATE/DELETE coach only.

### GAP-05 — Club affiliation
**Requirement:** REQ-C-025
**Current state:** No club affiliation field
**Fix:** Add `club_affiliation text NULL` to `coach_profiles`

### GAP-06 — Languages spoken
**Requirement:** REQ-C-014
**Current state:** No languages field
**Fix:** Add `languages text[] NULL` to `coach_profiles`

### GAP-07 — Display name
**Requirement:** REQ-C-006
**Current state:** `user_profiles.full_name` is the only name field — always public
**Fix:** Add `display_name text NULL` to `coach_profiles`
When NULL, display name defaults to `user_profiles.full_name`.
When set, all coach-facing surfaces use `coach_profiles.display_name` instead.
Legal name collected only in `dbs_verifications` at DBS application time.

---

## 8. New Build Plan Tasks Required

Add the following to `docs/10_BUILD_PLAN.md` before starting C-05:

| ID | Task | Agent | Risk | Must precede |
|---|---|---|---|---|
| F-17 | Create docs/14_COACH_REQUIREMENTS.md | Manual | 🟢 | C-01 |
| M-14 | Migration 014 — coach schema additions (coach_session_types, coach_venues, age_groups, travel_radius_miles, club_affiliation, languages, display_name) | @DatabaseArchitect | 🟡 | C-05 |
| F-18 | Requirements elicitation — Group Sessions | Manual | 🟢 | C-14, C-16 |
| F-19 | Requirements elicitation — Coach Bookings & Schedule | Manual | 🟢 | C-21 |
| F-20 | Requirements elicitation — Coach Earnings | Manual | 🟢 | C-21 |

---

## 9. Pending Elicitation Areas

The following areas of the Coach module have **not yet been elicited**.
No design or build work should start on these until the relevant session is complete.

| Area | Task ID | Blocks |
|---|---|---|
| Group sessions — creation, management, pricing, booking flow | F-18 | C-14, C-16, C-23, C-24 |
| Coach bookings — today's view, upcoming, past, session notes | F-19 | C-21, C-22 |
| Coach schedule — calendar view, availability management post-onboarding | F-19 | C-16, C-17, C-21 |
| Coach earnings — payout history, pending payouts, financial dashboard | F-20 | C-21 |
| Coach notifications — preferences, push, email | F-19 | C-21 |

---

*Crikly Coach Requirements v1.0 — March 2026*
*Elicited by Lasith Jayarathne. Documented by Claude.*
*Review before building any coach screen or API route.*
*Next elicitation session: Group Sessions (F-18)*

---

## 7. Availability & Sessions

### REQ-C-034 — Availability template is per sport
Each sport a coach offers has its own independent availability template.
A cricket booking only shows cricket availability; football shows football availability.
`availability_templates.sport_id` already exists — becomes effectively required for multi-sport coaches.

### REQ-C-035 — Continuous blocks, platform slices into slots automatically
A coach sets continuous open time blocks (e.g. Mon 9am–12pm for cricket).
The platform automatically slices each block into bookable slots based on session durations configured for that sport.
Example: 3-hour block + 60-min sessions = 3 slots (9–10, 10–11, 11–12).
Example: 3-hour block + 30-min AND 60-min sessions = both durations available per slot start time.
The coach never creates individual session slots manually.

### REQ-C-036 — Multiple blocks per day supported
A coach can have multiple availability blocks on the same day for the same sport.
Example: Monday cricket 9am–12pm AND 2pm–5pm.
API enforces no overlapping blocks per coach per sport per day.

### REQ-C-037 — Venue assigned per availability block (optional, defaults to profile venue)
When creating an availability block the coach can assign a specific coaching venue.
Defaults to their primary profile venue. Overridable per block.
Example: Monday = Oval Cricket Ground, Saturday = Kennington Park.

**Schema gap GAP-08:** Add `coach_venue_id uuid NULL FK → coach_venues(id)` to `availability_templates`.

### REQ-C-038 — Both recurring (weekly) and one-off blocks supported
When adding an availability block, coach chooses:
- **Repeat weekly** — appears every week until removed or date is blocked
- **This date only** — one-off block for a specific calendar date

**Schema gap GAP-09:** Add `is_recurring boolean NOT NULL DEFAULT true` and
`specific_date date NULL` to `availability_templates`.
Constraint: specific_date NULL when is_recurring = true; NOT NULL when is_recurring = false.

### REQ-C-039 — Blocked dates apply to the entire day, all sports
Blocking a date removes all availability for all sports that day.
No per-sport or per-slot blocking in Phase 1. Existing `blocked_dates` table supports this.

### REQ-C-040 — No buffer time between sessions for Phase 1
Back-to-back sessions allowed with no enforced gap.
Coaches manage gaps by designing their availability blocks accordingly.

### REQ-C-041 — Group sessions created separately from availability template
Group sessions are NOT drawn from the 1-on-1 availability template.
Coaches create specific group session slots independently.
Full architecture to be resolved in F-18 (Group Sessions elicitation) before C-06 or C-14 is built.

### REQ-C-042 — Schedule view: calendar + list, colour coded, responsive
Post-onboarding Schedule tab provides two views toggled by the coach:

**Web (desktop):**
- Primary view: week-ahead calendar grid
- Individual sessions: brand blue (#0077CC)
- Group sessions: teal (#0099AA)
- Booked slots visually distinct from open availability
- "Next up" session featured at top of page

**Mobile:**
- Primary view: today's sessions as a featured card, then upcoming list below
- "Next up" session card always at top
- Week calendar accessible via toggle

Colour coding consistent across both platforms. No schema change — display concern only.

---

## 8. Booking Policy

### REQ-C-043 — Cancellation window configurable per sport
Cancellation window is set per sport, not as a single coach-wide setting.
Example: cricket = 48 hours, football = 24 hours.

**Schema gap GAP-10:** Add `cancellation_window_hours integer NOT NULL DEFAULT 24`
to `coach_sports`. Keep existing `coach_profiles.cancellation_window_hours` as fallback default.

### REQ-C-044 — Booking window (min/max advance) configurable per sport
Min advance notice and max advance booking days are set per sport.
Example: cricket min = 48hrs, max = 8 weeks. Football min = 24hrs, max = 4 weeks.

**Schema gap GAP-10 (same):** Add `min_advance_hours integer NOT NULL DEFAULT 24`
and `max_advance_days integer NOT NULL DEFAULT 56` to `coach_sports`.
Keep coach-level columns on `coach_profiles` as fallback defaults.

### REQ-C-045 — Manual approval mode (optional, opt-in per coach)
Coaches can switch from instant booking to manual approval mode.

**Instant booking (default):**
Payment → booking.status = 'confirmed' → coach notified

**Manual approval mode (opt-in):**
Payment captured → booking.status = 'pending_approval' → coach notified
Coach approves → status = 'confirmed' → parent notified
Coach declines → status = 'declined' → full refund → parent notified
No response within approval window → auto-approved → status = 'confirmed'

Default approval window: 24 hours (coach configurable).
Manual approval is OFF by default. Coach opts in via booking settings.

**Schema gap GAP-11:**
- Add `requires_manual_approval boolean NOT NULL DEFAULT false` to `coach_profiles`
- Add `approval_window_hours integer NOT NULL DEFAULT 24` to `coach_profiles`
- Add `'pending_approval'` and `'declined'` to `bookings.status` allowed values
- New BR-16 required in `docs/05_BUSINESS_RULES.md` before C-05

---

## 9. Schema Gap Analysis (Complete — all gaps)

### GAP-01 — Session duration + pricing matrix
**Req:** REQ-C-019 | **Fix:** New table `coach_session_types`
```
coach_session_types
  id uuid PK
  coach_sport_id uuid FK → coach_sports(id)
  duration_minutes integer NOT NULL
  price_individual_pence integer NULL
  price_group_pence integer NULL
  currency text NOT NULL DEFAULT 'GBP'
  is_active boolean NOT NULL DEFAULT true
  created_at / updated_at
  UNIQUE(coach_sport_id, duration_minutes)
```
RLS: SELECT public (when coach live), INSERT/UPDATE/DELETE coach only.
Deprecates: `coach_sports.price_individual_pence`, `price_group_pence`, `session_duration_minutes`

### GAP-02 — Age groups per sport
**Req:** REQ-C-018 | **Fix:** Add `age_groups text[] NULL` to `coach_sports`
Values: 'u8', 'u10', 'u12', 'u14', 'u16', 'adults'

### GAP-03 — Travel radius
**Req:** REQ-C-011 | **Fix:** Add `travel_radius_miles integer NULL` to `coach_profiles`

### GAP-04 — Coach venues
**Req:** REQ-C-021 | **Fix:** New table `coach_venues`
```
coach_venues
  id uuid PK
  coach_profile_id uuid FK → coach_profiles(id)
  venue_name text NOT NULL
  venue_address text NOT NULL
  lat numeric(10,7) NULL
  lng numeric(10,7) NULL
  is_primary boolean NOT NULL DEFAULT false
  created_at / updated_at
```
RLS: SELECT public (when coach live), INSERT/UPDATE/DELETE coach only.

### GAP-05 — Club affiliation
**Req:** REQ-C-025 | **Fix:** Add `club_affiliation text NULL` to `coach_profiles`

### GAP-06 — Languages spoken
**Req:** REQ-C-014 | **Fix:** Add `languages text[] NULL` to `coach_profiles`

### GAP-07 — Display name
**Req:** REQ-C-006 | **Fix:** Add `display_name text NULL` to `coach_profiles`
NULL defaults to user_profiles.full_name in all display logic.

### GAP-08 — Venue per availability block
**Req:** REQ-C-037 | **Fix:** Add `coach_venue_id uuid NULL FK → coach_venues(id)` to `availability_templates`
Dependency: GAP-04 (coach_venues) must exist first.

### GAP-09 — One-off availability blocks
**Req:** REQ-C-038 | **Fix:** Add to `availability_templates`:
- `is_recurring boolean NOT NULL DEFAULT true`
- `specific_date date NULL`
- Constraint: CHECK (is_recurring = true AND specific_date IS NULL) OR (is_recurring = false AND specific_date IS NOT NULL)

### GAP-10 — Booking policy at sport level
**Req:** REQ-C-043, REQ-C-044 | **Fix:** Add to `coach_sports`:
- `cancellation_window_hours integer NULL` (NULL = fall back to coach_profiles value)
- `min_advance_hours integer NULL`
- `max_advance_days integer NULL`
Existing `coach_profiles` columns kept as fallback defaults. No breaking change.

### GAP-11 — Manual approval mode
**Req:** REQ-C-045 | **Fix:**
- Add `requires_manual_approval boolean NOT NULL DEFAULT false` to `coach_profiles`
- Add `approval_window_hours integer NOT NULL DEFAULT 24` to `coach_profiles`
- Add `'pending_approval'` and `'declined'` to `bookings.status` CHECK constraint
- Document new BR-16 in `docs/05_BUSINESS_RULES.md`

---

## 10. New Build Plan Tasks Required

| ID | Task | Agent | Risk | Must precede |
|---|---|---|---|---|
| F-17 | Create docs/14_COACH_REQUIREMENTS.md | Manual | 🟢 | C-01 |
| M-14 | Migration 014 — all schema gaps GAP-01 through GAP-11 | @DatabaseArchitect | 🟡 | C-05 |
| BR-16 | Document manual approval business rule in docs/05_BUSINESS_RULES.md | Manual | 🟡 | C-05 |
| F-18 | Requirements elicitation — Group Sessions | Manual | 🟢 | C-14, C-16 |
| F-19 | Requirements elicitation — Coach Bookings & Schedule | Manual | 🟢 | C-21 |
| F-20 | Requirements elicitation — Coach Earnings | Manual | 🟢 | C-21 |

---

## 11. Pending Elicitation Areas

| Area | Task ID | Blocks before build |
|---|---|---|
| Group sessions — creation, management, pricing, booking flow | F-18 | C-14, C-16, C-23, C-24 |
| Coach bookings — today's view, upcoming, past, session notes, mark complete | F-19 | C-21, C-22 |
| Coach earnings — payout history, pending payouts, financial dashboard | F-20 | C-21 |
| Coach notifications — preferences, push, email triggers | F-19 | C-21 |

---

*Crikly Coach Requirements v1.1 — March 2026*
*Elicited by Lasith Jayarathne. Documented by Claude.*
*Review before building any coach screen or API route.*
*Next elicitation session: Group Sessions (F-18)*

---

## 12. Group Sessions (F-18)

> **Decision confirmed:** Group sessions are commercially critical for Phase 1. Most cricket coaches run group sessions — without this feature, coaches won't switch from WhatsApp. Full model built now.

---

### Block A — Core Model

### REQ-C-046 — Both session models supported; coach chooses per session type
Crikly supports two group session models. A coach can use either or both:

**Model A — Named Programme (class model)**
Coach creates a named programme (e.g. "Saturday Beginner Cricket, 10am–12pm").
Parents discover it and join. The programme has its own identity, roster, dates, and lifecycle.
Examples: weekly cricket academy, 6-week batting course, holiday camp.

**Model B — Shared Slot (ad-hoc model)**
Coach has standard availability slots that multiple parents can book independently.
Multiple bookings land on the same slot up to the max group size.
No programme name or fixed schedule — just a slot that fills up.

When creating a group session, the coach chooses which model to use.
Both models coexist on the same platform and same coach profile.

### REQ-C-047 — Both schedule types supported per programme
For Model A (named programmes), the coach chooses the schedule type:
- **Fixed schedule** — coach sets number of sessions and specific dates upfront (e.g. 6 sessions, every Saturday from 5 April)
- **Rolling / open-ended** — programme runs indefinitely until the coach stops it

For Model B (shared slots), schedule is determined by the coach's availability template — no separate schedule setting.

### REQ-C-048 — Both payment models supported; coach decides per programme
For each group programme, the coach chooses the payment model:
- **Per session** — parent pays each time; can drop in or out (subject to cancellation policy)
- **Block upfront** — parent pays for all sessions in the programme at once at time of enrolment

For Model B (shared slots), payment is always per session — no block payment for ad-hoc slots.
Block payment applies to Model A (named programmes) only.

### REQ-C-049 — Different price per programme
Group session pricing is set per programme, not per sport.
A coach can have "Saturday Beginner Cricket" at £15/person and "Advanced Cricket Academy" at £30/person.
This pricing is independent of the `coach_session_types` pricing matrix used for 1-on-1 sessions.

**Schema note:** Price is stored on the `group_programmes` table, not `coach_sports`. See GAP-12.

### REQ-C-050 — Minimum participants: optional per programme
Coach can optionally set a minimum participant count for a programme to go ahead.
If set: coach is notified when minimum is met. If minimum is not met by session time,
the coach decides whether to cancel or run it anyway.
If the coach cancels: full automatic refunds issued to all enrolled participants.
If the coach runs it: session proceeds, no refunds.
The platform does NOT auto-cancel — the decision is always the coach's.

### REQ-C-051 — Late joining: coach decides per programme
For each programme, the coach sets whether late joining is allowed.
If allowed: parent can join at any point; they pay for remaining sessions only
(per-session model) or a pro-rata amount of the block price (block payment model).
If not allowed: the programme is closed to new participants once it starts.

---

### Block B — Visibility & Discovery

### REQ-C-052 — Group programmes appear both in search and on coach profile
Group programmes surface in two places:
1. **Coach profile page** — a dedicated "Group sessions" tab or section shows all active programmes
2. **Search results** — group programmes appear as separate bookable items alongside coach profiles in search

Parents can search specifically for group sessions by filtering by session type = Group.
A group programme card in search shows: programme name, sport, skill level, age group,
coach name + rating, price per session, spots remaining, next session date, location.

### REQ-C-053 — Full programme information shown before joining
Before a parent joins a group programme, they see all of the following:
- Programme name and description
- Sport, skill level, age group
- Session dates and times (all upcoming dates for fixed; next session + frequency for rolling)
- Price per session AND total cost if block payment
- Spots remaining (e.g. "4 of 8 spots taken")
- Coach name, photo, rating, DBS badge (if verified)
- Specific venue with map pin
- Session duration

### REQ-C-054 — Participant roster is private; spots count shown
The participant roster is private — parents cannot see other children's names or photos.
Only the spots count is shown publicly (e.g. "4 of 8 spots taken").
The full participant list (names, child profiles) is visible to the coach only, in real time.

### REQ-C-055 — Coach sees participant list immediately on enrolment
As soon as a parent enrols their child, the coach sees the participant in their programme
management view in real time. No waiting for session confirmation.
Participant details shown to coach: child name, age, skill level, medical notes (if any),
parent name, booking reference.

---

### Block C — Cancellation & Refunds

### REQ-C-056 — Coach cancels entire programme: full automatic refunds
If a coach cancels an entire programme (mid-run or before it starts):
- Full automatic refunds for all remaining/upcoming sessions issued to all participants
- For block payment: refund = total paid minus sessions already completed
- For per-session: refund = any prepaid sessions not yet delivered
- All participants notified immediately via push + email
- Booking status for all participants set to `cancelled_coach`
- Coach flagged if repeated programme cancellations occur (same BR-13 logic)

**Business rule:** This is an extension of BR-04 Scenario C to group programmes.
Requires update to BR-04 and potentially new BR-17 for group-specific refund calculations.

### REQ-C-057 — Parent cancels from group programme: coach decides per programme
Each group programme has its own cancellation policy set by the coach.
This is separate from the per-sport 1-on-1 cancellation window.
The coach sets the cancellation policy when creating the programme:
- Number of hours before the session within which no refund applies
- Whether the parent can leave a rolling programme entirely with pro-rata refund

**Schema note:** `cancellation_window_hours` stored on `group_programmes` table.

### REQ-C-058 — Minimum not met: coach decides, manual refunds if cancelled
If minimum participants is not met by session time:
- Coach receives notification: "Minimum not met for [programme name]"
- Coach decides to cancel or proceed
- If coach cancels: full refunds issued automatically to all participants
- If coach proceeds: session runs normally, no refunds
- No automatic cancellation by the platform

---

### Block D — Coach Management of Group Programmes

### REQ-C-059 — Dedicated "Programmes" section for group management
Group programmes are managed in a separate "Programmes" section in the coach's sidebar/navigation.
This is distinct from the Schedule tab (which shows sessions chronologically).
In the Programmes section, the coach sees:
- All active programmes (with enrolment count, next session, status)
- All past/completed programmes
- A "Create programme" action

The Schedule tab still shows group sessions chronologically alongside 1-on-1 sessions
for day-to-day visibility — but management (edit, cancel, view roster) happens in Programmes.

### REQ-C-060 — Core programme fields locked once participants have joined
Once at least one participant has enrolled, the coach can only edit:
- Programme name and description
- Programme photo/cover image

The following fields are **locked** and cannot be changed after first enrolment:
- Session date(s) and time(s)
- Session location / venue
- Price per session / block price
- Session duration
- Max group size
- Payment model (per-session vs block)
- Schedule type (fixed vs rolling)

If a coach needs to change a locked field, they must cancel the programme (triggering full refunds)
and create a new one.

### REQ-C-061 — Manual participant addition (offline payment)
A coach can add a participant to a group programme manually, outside the normal booking flow.
Use case: a parent who paid cash directly to the coach.
The manually added participant is marked as "Offline payment" — no Stripe transaction is created.
The platform records them as enrolled for session management (roster, notifications, passport).
Revenue from offline payments is NOT tracked in the coach's Crikly earnings dashboard.

### REQ-C-062 — Coach navigation addition: Programmes section
The coach navigation must add a "Programmes" item to the sidebar (desktop) and bottom tab bar (mobile).
Updated coach navigation:
- Mobile tabs: Home · Schedule · **Programmes** · Bookings · Earnings · Profile
- Desktop sidebar: Home, Schedule, Programmes, Bookings, Earnings, Settings

**Note:** This changes the navigation from the 5-tab model in `docs/11_UX_PRINCIPLES.md`.
UX Principles doc must be updated to reflect 6 tabs for coach role.

---

### Group Sessions — Schema Gap Analysis

### GAP-12 — New table: group_programmes
**Requirements:** REQ-C-046 through REQ-C-062
**Current state:** `group_bookings` table exists but only models the ad-hoc shared slot approach.
It cannot support named programmes, fixed schedules, block payments, or programme lifecycle.

**Fix:** New table `group_programmes`:
```
group_programmes
  id uuid PK
  coach_profile_id uuid FK → coach_profiles(id)
  sport_id uuid FK → sports(id)
  name text NOT NULL                          -- e.g. "Saturday Beginner Cricket"
  description text NULL
  model text NOT NULL                         -- 'programme' (Model A) | 'shared_slot' (Model B)
  schedule_type text NOT NULL                 -- 'fixed' | 'rolling' (Model A only)
  session_count integer NULL                  -- NULL if rolling
  skill_level text NOT NULL                   -- 'beginner' | 'intermediate' | 'advanced'
  age_groups text[] NOT NULL
  duration_minutes integer NOT NULL
  max_participants integer NOT NULL
  min_participants integer NULL               -- NULL = no minimum
  price_per_session_pence integer NOT NULL
  currency text NOT NULL DEFAULT 'GBP'
  payment_model text NOT NULL                 -- 'per_session' | 'block' (Model A only)
  late_joining_allowed boolean NOT NULL DEFAULT false
  cancellation_window_hours integer NOT NULL DEFAULT 24
  coach_venue_id uuid NULL FK → coach_venues(id)
  status text NOT NULL DEFAULT 'draft'        -- 'draft' | 'active' | 'paused' | 'completed' | 'cancelled'
  starts_at timestamptz NULL                  -- NULL for rolling programmes
  ends_at timestamptz NULL                    -- NULL for rolling programmes
  deleted_at timestamptz NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
```
RLS: SELECT public (when status = 'active'), INSERT/UPDATE/DELETE coach only.

### GAP-13 — New table: group_programme_sessions
Individual session occurrences within a programme.

**Fix:** New table `group_programme_sessions`:
```
group_programme_sessions
  id uuid PK
  group_programme_id uuid FK → group_programmes(id)
  session_date date NOT NULL
  start_time time NOT NULL
  end_time time NOT NULL
  coach_venue_id uuid NULL FK → coach_venues(id)  -- can differ from programme default
  status text NOT NULL DEFAULT 'scheduled'         -- 'scheduled' | 'completed' | 'cancelled'
  cancelled_at timestamptz NULL
  cancellation_reason text NULL
  completed_at timestamptz NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
```

### GAP-14 — New table: group_programme_enrolments
Tracks each participant's enrolment in a programme.

**Fix:** New table `group_programme_enrolments`:
```
group_programme_enrolments
  id uuid PK
  group_programme_id uuid FK → group_programmes(id)
  child_profile_id uuid NULL FK → child_profiles(id)    -- NULL if player booking
  player_profile_id uuid NULL FK → player_profiles(id)  -- NULL if parent booking
  booked_by_user_id uuid FK → user_profiles(id)
  payment_type text NOT NULL                             -- 'platform' | 'offline'
  payment_model text NOT NULL                            -- 'per_session' | 'block'
  block_amount_pence integer NULL                        -- set if block payment
  sessions_paid_for integer NULL                         -- set if block payment
  joined_at_session_number integer NOT NULL DEFAULT 1    -- for late joiners
  status text NOT NULL DEFAULT 'active'                  -- 'active' | 'cancelled' | 'completed'
  cancelled_at timestamptz NULL
  cancellation_reason text NULL
  refund_amount_pence integer NULL
  created_at timestamptz NOT NULL
  updated_at timestamptz NOT NULL
```
RLS: SELECT coach (own programmes), SELECT parent/player (own enrolments).

### GAP-15 — group_bookings table deprecation / repurposing
**Current state:** `group_bookings` table models ad-hoc shared slots only.
**Decision needed:** Either repurpose `group_bookings` as the per-session payment records
linking `group_programme_enrolments` to individual `group_programme_sessions`,
or deprecate it entirely and use the new tables above.
**Recommendation:** Repurpose as `group_session_bookings` — one row per participant per session.
This links to `payment_intents` for individual session payments (per-session model)
and to a block `payment_intent` (block model).
**Requires:** DatabaseArchitect decision in M-14 before any group session API routes are written.

### GAP-16 — coach navigation update
**Requirement:** REQ-C-062
**Impact:** `docs/11_UX_PRINCIPLES.md` Navigation Structure section must be updated.
Coach mobile tabs change from 5 to 6: Home · Schedule · Programmes · Bookings · Earnings · Profile.

---

### New Business Rules from Group Sessions

**BR-17 — Group programme cancellation refund calculation**
When a coach cancels a programme mid-run:
- Per-session payment: refund = sum of per-session prices for all future sessions not yet delivered
- Block payment: refund = block_amount_pence × (sessions_remaining / sessions_total)
- All refunds processed automatically via Stripe
- Coach earns nothing for cancelled sessions
- Repeated programme cancellations trigger is_flagged = true (same threshold as BR-13)

**BR-18 — Block payment late joiner pro-rata calculation**
When a participant joins a fixed programme that has already started (late joining enabled):
- Block payment: amount_due = price_per_session_pence × sessions_remaining
- Per-session: parent pays only for future sessions, no catch-up payment
- joined_at_session_number recorded on enrolment for refund calculation

---

### Updated Build Plan Tasks for Group Sessions

| ID | Task | Agent | Risk | Must precede |
|---|---|---|---|---|
| M-14 | Updated — now includes GAP-12 through GAP-15 in addition to GAP-01 to GAP-11 | @DatabaseArchitect | 🟡 | C-05 |
| BR-17 | Document group programme cancellation refund rule | Manual | 🔴 | C-05 |
| BR-18 | Document block payment late joiner pro-rata rule | Manual | 🔴 | C-05 |
| UX-01 | Update docs/11_UX_PRINCIPLES.md — coach nav from 5 to 6 tabs | Manual | 🟢 | C-01 |
| C-01a | Design group programme creation flow (part of C-01 redesign) | @UIUXDesigner | 🟢 | C-13 |
| C-01b | Design Programmes management section | @UIUXDesigner | 🟢 | C-13 |


---

## 13. Coach Bookings & Schedule (F-19)

### REQ-C-063 — Booking detail screen contents
When a coach opens a confirmed booking, they see all of the following:
- Date, time, duration, sport
- Session type (1-on-1 or group)
- Child name, age, skill level
- Child medical notes (safety critical — always shown to confirmed coach)
- Child Training Passport summary (subject to REQ-C-064)
- Parent name and contact details (unlocked on confirmed booking per BR-07)
- Booking reference number (CRK-YYYY-NNNN format per BR-12)
- Amount they will earn + expected payout date (completed_at + 48hrs)
- Cancellation policy reminder (hours remaining in window)
- Session notes field (always accessible — see REQ-C-065)

### REQ-C-064 — Training Passport visibility follows parent privacy setting
A coach can see the child's Training Passport as soon as the booking is confirmed,
subject to the parent's privacy setting (BR-08):
- privacy = 'open' → full passport visible immediately on booking confirmation
- privacy = 'booking_only' → full passport visible immediately on booking confirmation
- privacy = 'private' → passport not visible — basic child profile only

This allows the coach to prepare for the session in advance.

### REQ-C-065 — Session notes always editable
Session notes can be added or edited at any time — before, during, and after the session.
Notes are never locked. The coach may want to update notes days after a session.
Notes are internal to the coach — not shown to the parent.
Stored on `session_notes` table (already exists in schema).

### REQ-C-066 — Payout triggered by coach manually marking complete
The 48hr payout countdown starts when the coach manually taps "Mark as complete."
Sessions are NOT auto-marked complete at session end time.
This is a deliberate choice — it ensures the coach has delivered the session before payment is released,
and gives them a moment to add notes or a performance report first.

**Impact on schema:** `bookings.completed_at` is set at the moment the coach taps "Mark as complete."
`bookings.payout_eligible_at` = completed_at + platform_config.default_payout_delay_hours.

### REQ-C-067 — Performance reports: configurable window with notification
Performance reports (Premium feature) can be written within a configurable time window
after the session is marked complete.
- Default window: admin configurable (suggested default: 7 days)
- Coach is notified when the window is about to close (e.g. "48hrs left to add report for Ravi's session")
- After the window closes, the report field is locked — no further entries allowed
- Notification trigger: to be fully specified in the notifications elicitation session (backlog)

**Schema note:** Add `performance_report_window_hours integer NOT NULL DEFAULT 168`
(7 days = 168 hours) to `platform_config`. Add `report_locked_at timestamptz NULL`
to `session_notes` or `performance_reports` table. See GAP-17.

### REQ-C-068 — Coach cancellation flow
When a coach cancels a booking, the following steps occur in sequence:
1. Confirmation prompt shown: "Are you sure you want to cancel this session?"
2. Coach selects a cancellation reason (required — from a predefined list + free text option)
3. Full refund issued automatically to parent (per BR-04 Scenario C)
4. Parent notified immediately via push + email
5. Booking status set to 'cancelled_coach' and moves to Cancelled tab in booking history
6. Repeated cancellations tracked — flagging logic applies per BR-13

Note: Repeated cancellation warning is internal (admin sees it) — no separate on-screen
warning shown to the coach for Phase 1.

### REQ-C-069 — Booking list tabs
The coach Bookings screen has the following tabs:
- **Today** — sessions scheduled for today (confirmed or pending approval)
- **Upcoming** — all future confirmed sessions beyond today
- **Pending approval** — bookings awaiting manual approval (only shown when coach has manual approval mode enabled)
- **Past** — completed sessions (marked complete by coach)
- **Cancelled** — all cancelled bookings (cancelled by coach or parent)

No "All" tab — the tabbed structure is sufficient and keeps each view focused.

### REQ-C-070 — No-show policy: coach configures per session type
When a parent does not show up for a confirmed session, the coach decides the outcome.
The no-show refund policy is configurable by the coach when setting up each sport's booking policy.

Coach options for no-show policy (set per sport):
- **Full refund** — parent receives full refund (coach earns nothing)
- **Partial refund** — coach sets a percentage the parent receives (e.g. 50%)
- **No refund** — coach keeps full payment (same as late cancellation)

When a parent no-shows:
- Coach taps "Mark as no-show" on the booking detail screen
- The configured refund amount is applied automatically
- Parent notified of outcome
- Booking status set to 'no_show'

**Schema note:** Add `no_show_policy text NOT NULL DEFAULT 'no_refund'` and
`no_show_refund_percentage integer NOT NULL DEFAULT 0` to `coach_sports`.
Add 'no_show' to `bookings.status` allowed values. See GAP-18.

**Business rule:** New BR-19 required — no-show refund calculation and processing.

---

## 14. Coach Earnings (F-20)

### REQ-C-071 — Free tier earnings: basic view
Free tier coaches see:
- Total earned all-time (single headline figure)
- List of all payouts received (date, amount, status — most recent first)
- Pending payouts section (sessions completed, payout not yet released)
- Simple "Next payout" amount and date

Free tier does NOT see: breakdown by sport, breakdown by session type,
per-booking line items, commission breakdown, or tax filing tools.

### REQ-C-072 — Premium tier earnings: full breakdown
Premium coaches see everything in REQ-C-071 plus:
- Breakdown by sport (e.g. cricket £1,200 / football £340 this month)
- Breakdown by session type (1-on-1 vs group earnings)
- Per-booking line items (each session listed individually with date, child name, sport, amount)
- Commission paid to platform shown separately per booking (deductible expense for tax)
- Gross vs net earnings distinguished (gross = coach_price, net = after any adjustments)

### REQ-C-073 — Time period views
Both Free and Premium coaches can filter earnings by:
- This week
- This month
- This tax year (UK April–April, aligned to platform_config.tax_year_start_month)
- Custom date range (date picker)

"Last 30 days" and "All time" are not required — custom date range covers these.

### REQ-C-074 — Pending payouts clearly separated
Earnings screen has two distinct sections:
1. **Pending** — sessions marked complete, payout_eligible_at in the future (within 48hr window)
   Shows: session date, child name, sport, amount, expected payout date
2. **Received** — payouts already transferred to bank account via Stripe
   Shows: transfer date, amount, Stripe transfer reference

The distinction is critical for coach trust — they need to know their money is coming
and exactly when.

### REQ-C-075 — Payout history access
- **Free tier:** Last 3 payouts visible in Received section
- **Premium tier:** Full payout history — every Stripe transfer ever made

### REQ-C-076 — Payout failed: prominent error state
When a Stripe payout fails (e.g. invalid bank details):
- Earnings screen shows a prominent error state at the top: "Payout failed — check your bank details"
- Clear CTA to fix the issue: links to Stripe Connect settings
- Affected payout shown with 'Failed' status in payout list
- Push notification + email also sent (per existing notification triggers)
- Error persists until resolved — not dismissible

### REQ-C-077 — Tax filing (Premium only)
Premium coaches can access a tax filing section showing:
- Financial year summary aligned to UK tax year (April–April)
- Total gross income from coaching for the year
- Total platform commission paid (deductible expense for HMRC)
- Downloadable CSV of all transactions
- Downloadable PDF summary report

Tax year alignment uses `platform_config.tax_year_start_month` (default: 4 for April).
HMRC-ready format — no accountant translation required.

### REQ-C-078 — Offline payments excluded from earnings dashboard
Cash payments from manually added group participants (REQ-C-061) are excluded entirely
from the earnings dashboard. The earnings screen reflects only platform-processed payments.
This keeps accounting clean and avoids mixing Stripe data with unverified cash records.

---

## 15. Schema Gaps from F-19 and F-20

### GAP-17 — Performance report window
**Requirement:** REQ-C-067
**Fix:**
- Add `performance_report_window_hours integer NOT NULL DEFAULT 168` to `platform_config`
- Add `report_deadline_at timestamptz NULL` to `performance_reports` table
  (set when booking is marked complete: completed_at + performance_report_window_hours)

### GAP-18 — No-show policy per sport
**Requirement:** REQ-C-070
**Fix:**
- Add `no_show_policy text NOT NULL DEFAULT 'no_refund'` to `coach_sports`
  Values: 'full_refund' | 'partial_refund' | 'no_refund'
- Add `no_show_refund_percentage integer NOT NULL DEFAULT 0` to `coach_sports`
  Only used when no_show_policy = 'partial_refund'. Range: 0–100.
- Add 'no_show' to `bookings.status` CHECK constraint allowed values

### GAP-19 — No-show business rule
**Requirement:** REQ-C-070
**Fix:** New BR-19 in `docs/05_BUSINESS_RULES.md`:
```
No-show refund calculation:
  no_show_policy = 'full_refund'    → refund = parent_total_pence, coach earns 0
  no_show_policy = 'partial_refund' → refund = parent_total_pence × (no_show_refund_percentage / 100)
                                      coach earns parent_total_pence - refund - commission_pence
  no_show_policy = 'no_refund'      → refund = 0, coach earns coach_price_pence (normal payout)
```
Refund processed automatically via Stripe on coach marking no-show.
booking.status = 'no_show'. payout_eligible_at set normally for coach's earned portion.

---

## 16. Complete New Build Plan Tasks (All Sessions)

| ID | Task | Agent | Risk | Must precede |
|---|---|---|---|---|
| F-17 | Create docs/14_COACH_REQUIREMENTS.md | Manual | 🟢 | C-01 |
| UX-01 | Update docs/11_UX_PRINCIPLES.md — coach nav 5 to 6 tabs (add Programmes) | Manual | 🟢 | C-01 |
| BR-16 | Document manual approval flow in docs/05_BUSINESS_RULES.md | Manual | 🟡 | C-05 |
| BR-17 | Document group programme cancellation refund rule | Manual | 🔴 | C-05 |
| BR-18 | Document block payment late joiner pro-rata rule | Manual | 🔴 | C-05 |
| BR-19 | Document no-show refund calculation rule | Manual | 🟡 | C-05 |
| M-14 | Migration 014 — all GAP-01 through GAP-19 | @DatabaseArchitect | 🟡 | C-05 |
| C-01 | Design coach onboarding flow — restart with full requirements | @UIUXDesigner | 🟢 | C-13 |

---

## 17. Backlog (Deferred to Later Elicitation)

| Item | Reason deferred | Affects |
|---|---|---|
| Performance report notification window spec | Needs notifications elicitation session | C-21, C-22 |
| Coach notification preferences | Dedicated notifications session needed | C-21 |
| Coach messaging (post-booking contact details) | Covered in Phase 1 bookings elicitation | C-21 |

---

## 18. Complete Requirements Index

| Block | Requirements | Status |
|---|---|---|
| 1 — Registration & Onboarding | REQ-C-001 to REQ-C-005 | ✅ |
| 2 — Identity & Profile | REQ-C-006 to REQ-C-015 | ✅ |
| 3 — Sports & Coaching Offer | REQ-C-016 to REQ-C-021 | ✅ |
| 4 — Qualifications & Trust | REQ-C-022 to REQ-C-025 | ✅ |
| 5 — Stripe & Payments | REQ-C-026 to REQ-C-029 | ✅ |
| 6 — Going Live & Tiers | REQ-C-030 to REQ-C-033 | ✅ |
| 7 — Availability & Sessions | REQ-C-034 to REQ-C-042 | ✅ |
| 8 — Booking Policy | REQ-C-043 to REQ-C-045 | ✅ |
| 9 — Group Sessions | REQ-C-046 to REQ-C-062 | ✅ |
| 10 — Bookings & Schedule | REQ-C-063 to REQ-C-070 | ✅ |
| 11 — Earnings | REQ-C-071 to REQ-C-078 | ✅ |

**Total: 78 requirements. All Coach module elicitation complete.**

---

*Crikly Coach Requirements v1.3 — March 2026*
*Elicited by Lasith Jayarathne. Documented by Claude.*
*All 78 requirements locked. Ready for C-01 design restart.*
