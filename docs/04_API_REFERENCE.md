# Crikly — API Reference

**Version:** 1.5
**Last Updated:** 22 July 2026
**Changed:** BUG-38 — coach slug derivation documented on POST /api/coaches/profile: display_name is the slug source, full_name only as fallback when display_name is unset; full_name edits no longer regenerate the slug while a display_name exists. Previous (1.4): BUG-45 — GET /api/payments/connect/onboard now returns `bank_name` + `bank_last4` from Stripe external_accounts (real payout destination for the Get Paid page). Previous (1.3): BUG-44 — new POST /api/webhooks/stripe-connect route for connected-account events (`account.updated` → `stripe_onboarding_complete`; transfer/payout events log-only for Block 0), verified with `STRIPE_CONNECT_WEBHOOK_SECRET`. Previous (1.2): BUG-23 — camp slot granularity: slot-selection wire format (`uuid` / `uuid.N`) + per-slot pricing/capacity on POST /api/guest/programme-enrolments (new 400 `camp_block_unsupported`, 409 `slot_full`); camp branch (`confirm_camp_slot_spots()`) + email session lines in the Stripe webhook; `camp_mode` on programme list/POST responses; roster session lines. Previous (1.1): BUG-19 Phase 1 — `booked_slots` on GET /api/coaches/[id]/availability; slot-validation 409s on POST /api/guest/bookings

This document is the single source of truth for all API routes.
Update this file in the same commit as every new or modified route.

---

## Conventions

```
Base URL:     https://crikly.app/api
Auth:         Supabase JWT token in Authorization header
Content-Type: application/json
Errors:       { error: string, details?: object }
Money:        Always in pence (integers). Never decimals.
```

### HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success — GET, PATCH |
| 201 | Created — POST |
| 400 | Bad request — validation error |
| 401 | Unauthenticated — no valid session |
| 403 | Forbidden — authenticated but not authorised |
| 404 | Not found |
| 409 | Conflict — e.g. slot already booked |
| 500 | Internal server error |

---

## Auth Routes

### POST /api/auth/register
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "full_name": "John Smith"
}
```

**Response 201:**
```json
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "session": { "access_token": "..." }
}
```

---

### POST /api/auth/roles
Add a role to the authenticated user's account.

**Request:**
```json
{ "role": "parent" }
```

**Response 201:**
```json
{ "role": "parent", "created_at": "..." }
```

---

### POST /api/auth/reset-password
Save a new password for a user holding a recovery session (BUG-33). The
session is established by `/auth/callback?type=recovery` from the reset-email
link; this route calls `supabase.auth.updateUser({ password })` on that
session and returns the same profile-state-gated redirect as login.

**Request:**
```json
{ "password": "new password, min 8 chars" }
```

**Response 200:**
```json
{ "success": true, "redirectTo": "/coach/dashboard" }
```

**Errors:** 400 `VALIDATION_ERROR` (missing/short password), 401
`SESSION_EXPIRED` (no recovery session — user should request a new link),
422 `SAME_PASSWORD` (new password equals the old one), 500 `UNKNOWN_ERROR`.

---

## Coach Routes

### GET /api/coaches
Search for coaches. Supports filtering and sorting.
**Status: Implemented — CG-01a**
**Auth: Public — no token required**

**Query params:**
```
sport_id        UUID
location_lat    float
location_lng    float
radius_km       integer (default: 10, max: 500)
session_type    'individual' | 'group'
skill_level     'beginner' | 'intermediate' | 'advanced'
min_price       integer (pence)
max_price       integer (pence)
dbs_verified    boolean
gender          'male' | 'female' | 'other'
min_rating      float (0–5)
sort            'nearest' | 'rating' | 'price_asc' | 'available'
page            integer (default: 1)
limit           integer (default: 20, max: 50)
```

**Notes:**
- `location_lat` and `location_lng` must be supplied together or not at all
- `sort=nearest` requires location params; coaches without coordinates sort last
- Featured coaches (`is_featured=true`) always appear before organic results, sorted by rating
- Only coaches where `is_profile_live=true` and `is_suspended=false` are returned

**Response 200:**
```json
{
  "coaches": [
    {
      "id": "uuid",
      "slug": "james-wright",
      "full_name": "James Wright",
      "bio": "ECB Level 2 coach with 8 years experience...",
      "location_city": "Birmingham",
      "location_lat": 52.4862,
      "location_lng": -1.8904,
      "rating_avg": 4.8,
      "rating_count": 23,
      "sessions_completed": 47,
      "dbs_status": "verified",
      "is_featured": false,
      "gender": "male",
      "distance_km": 3.2,
      "sports": [
        {
          "sport_id": "uuid",
          "sport_name": "Cricket",
          "sport_slug": "cricket",
          "session_types": ["individual", "group"],
          "skill_levels": ["beginner", "intermediate"],
          "min_price_pence": 4500
        }
      ],
      "primary_photo": "https://gzehxfnlfogkhadejowo.supabase.co/storage/v1/..."
    }
  ],
  "total": 42,
  "page": 1,
  "pages": 3
}
```

**Error 400:** Validation failure — invalid param types or out-of-range values

---

### GET /api/coaches/[id]
Get a single coach's full public profile. Accepts either a UUID or a human-readable slug (L-UX01).
- UUID: `/api/coaches/18369fae-ad5b-4dbe-9108-3bd150c90df8`
- Slug: `/api/coaches/james-wright`
**Status: Implemented — CG-01b, L-UX01**
**Auth: Public — no token required**

> BUG-37: `full_name` in this response is the coach's PUBLIC name —
> `coach_profiles.display_name`, falling back to `user_profiles.full_name`
> when no display name is set. Same precedence as GET /api/public/coaches
> and the booking-confirmation emails. The key name is kept as `full_name`
> for backward compatibility.

**Response 200:**
```json
{
  "id": "uuid",
  "slug": "james-wright",
  "full_name": "James Wright",
  "bio": "ECB Level 2 coach...",
  "years_experience": 8,
  "location_city": "Birmingham",
  "location_lat": 52.4862,
  "location_lng": -1.8904,
  "gender": "male",
  "languages": ["English"],
  "dbs_status": "verified",
  "dbs_verified_at": "2025-09-01T00:00:00Z",
  "is_featured": false,
  "rating_avg": 4.8,
  "rating_count": 23,
  "sessions_completed": 47,
  "cancellation_window_hours": 24,
  "min_advance_hours": 24,
  "max_advance_days": 56,
  "sports": [
    {
      "sport_id": "uuid",
      "sport_name": "Cricket",
      "sport_slug": "cricket",
      "session_types": ["individual", "group"],
      "skill_levels": ["beginner", "intermediate"],
      "price_individual_pence": 4500,
      "price_group_pence": 2500,
      "max_group_size": 6,
      "session_duration_minutes": 60,
      "currency": "GBP"
    }
  ],
  "qualifications": [
    {
      "id": "uuid",
      "name": "ECB Level 2",
      "issuing_body": "ECB",
      "issued_date": "2022-06-01",
      "expiry_date": "2027-06-01",
      "status": "active",
      "notes": null,
      "certificate_url": null
    }
  ],
  "photos": [
    { "id": "uuid", "photo_url": "https://...", "is_primary": true, "sort_order": 0 }
  ],
  "availability": [
    { "id": "uuid", "sport_id": null, "day_of_week": 6, "start_time": "09:00", "end_time": "12:00" }
  ]
}
```

**Error 404:** Coach not found or not live

---

### POST /api/coaches/profile
Create or update the authenticated coach's profile.

**Request:** Coach profile fields (see database schema section 3.4)
- BUG-37: `display_name` must be non-empty (after trim) when provided — a
  blank display name would render as a blank coach name on public surfaces.

**Response 201/200:** Updated coach profile object
- BUG-37: GET and POST responses now include `display_name: string | null`
  (`coach_profiles.display_name`) alongside `full_name` (the private
  account name, shown only in Settings as "Account name").

**Slug derivation (BUG-38):** the public URL slug is generated from the
**effective public name** — `display_name`, falling back to `full_name` only
when `display_name` is unset (mirrors how public pages render
`display_name ?? full_name`; the private account name must never leak into
the URL). Regeneration triggers: `display_name` edited, OR `full_name`
edited *while `display_name` is null*, OR slug missing. Editing `full_name`
while a `display_name` exists does NOT touch the slug. Collisions get a
`-2`/`-3`… suffix (`findUniqueSlug`). Regenerating changes the public URL —
old slug URLs 404 (no slug-history redirect exists; UUID URLs still resolve
and redirect to the canonical slug).

---

### GET /api/coaches/[id]/availability
Get availability templates, blocked dates, and booking policy for a coach.
**Status: Implemented — CG-01b**
**Auth: Public — no token required**

**Query params:**
```
from_date   date (YYYY-MM-DD, optional)
to_date     date (YYYY-MM-DD, optional)
sport_id    UUID (optional) — filters to templates for this sport or all-sport templates
```

**Response 200:**
```json
{
  "availability": [
    {
      "id": "uuid",
      "sport_id": null,
      "day_of_week": 6,
      "start_time": "09:00",
      "end_time": "12:00",
      "price_override_pence": 7500,
      "venue_name": "Kingston Hospital"
    }
  ],
  "blocked_dates": ["2026-04-19", "2026-04-20"],
  "booked_slots": [
    { "date": "2026-07-20", "start_time": "10:00", "end_time": "11:00" }
  ],
  "booking_policy": {
    "cancellation_window_hours": 24,
    "min_advance_hours": 24,
    "max_advance_days": 56
  }
}
```

**Notes:**
- `availability` contains weekly recurring templates (active only)
- `blocked_dates` are expanded from ranges to individual YYYY-MM-DD strings
- `booked_slots` (BUG-14 / BUG-19 Phase 1) are the coach's live bookings as busy intervals so the calendar suppresses booked slots. Statuses `pending_payment`/`confirmed`/`completed` hold a slot; cancelled/no-show/soft-deleted rows are excluded (mirrors migration 034's slot-holding predicate). Window: today → the coach's max-advance horizon, intersected with `from_date`/`to_date`. Privacy: intervals ONLY — no booking id, participant data, or status is ever returned. Read server-side via the admin client (`bookings` has no public SELECT policy) — a deliberate, Lasith-approved exception (BUG-19 Phase 1 Step 0)
- `sport_id` filter matches templates for that sport OR templates with no sport (applies to all)
- `price_override_pence` is the per-block price override in pence, or `null` to use the coach's sport default. Display only — the booking server re-derives the authoritative price (BUG-08 / BUG-09)
- `venue_name` is the block's resolved venue label — the free-text `venue_name`, else the `coach_venues.name` referenced by `coach_venue_id`, else `null`. Display only (UX-09)

**Error 400:** Validation failure — invalid date format or from_date > to_date
**Error 404:** Coach not found or not live

---

### POST /api/coaches/[id]/availability
Create availability template blocks.

### DELETE /api/coaches/[id]/availability/[blockId]
Remove an availability template block.

### POST /api/coaches/[id]/blocked-dates
Add a blocked date.

### DELETE /api/coaches/[id]/blocked-dates/[date]
Remove a blocked date.

### GET /api/coaches/reviews
**STUB endpoint** — returns hardcoded dummy reviews for the authenticated coach. Auth via `requireCoachContext`. Replace with real `bookings + reviews + coach_replies` joins when `API-COACH-REVIEWS-REAL-WIRING` lands. Response: `{ reviews: Review[], rating_avg, rating_count, rating_change_30d, positive_share }`. Pagination follow-up tracked as `API-COACH-REVIEWS-PAGINATION`. Reply persistence (POST) tracked as `BUG-REVIEWS-REPLY-PERSIST`. See CF-REVIEWS-01.

---

### GET /api/coaches/programme-sessions
Get the authenticated coach's scheduled group programme sessions within a date range. Powers the purple "programme" blocks on `/coach/schedule`.
**Status: Implemented — SCHEDULE-PROG-SESSIONS**
**Auth: Coach role required (`requireCoachContext`)**

**Query params:**
```
from   date (YYYY-MM-DD, required)
to     date (YYYY-MM-DD, required)
```

**Response 200:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "session_date": "2026-06-07",
      "start_time": "10:00:00",
      "end_time": "11:00:00",
      "programme_id": "uuid",
      "programme_title": "Saturday morning batting",
      "current_spots": 3,
      "max_spots": 8,
      "venue_name": "Kennington Oval"
    }
  ]
}
```

**Notes:**
- Returns one row per scheduled session for any `group_programmes` row where `coach_profile_id` matches the caller, `status = 'active'`, and `deleted_at IS NULL`.
- Filters to `group_programme_sessions.status = 'scheduled'` — completed and cancelled sessions are excluded.
- `venue_name` resolution: per-session `coach_venue_id → coach_venues.name` takes precedence; falls back to `group_programmes.venue_name` when the session has no override.
- Camp-mode `group_programme_sessions.slots` jsonb is intentionally NOT projected — the grid renders one block per session row using the row's `start_time` / `end_time`. Multi-slot camp days will need a separate visual design (follow-up).
- No nested PostgREST joins — three explicit reads (programmes, sessions, venues) merged in application code, mirroring the Fix-65-1 pattern used by `GET /api/coaches/programmes/[programmeId]`.

**Error 400:** Validation failure — missing/malformed `from` or `to`, or `from > to`. Response body: `{ error: "Validation failed", details: string[] }`.
**Error 401 / 403 / 404 / 500:** Standard auth + DB-error responses from `requireCoachContext` and the adminSupabase reads.

---

## Child Profile Routes

### GET /api/children
Get all child profiles for the authenticated parent.

### POST /api/children
Create a new child profile.

**Request:** Child profile fields (see database schema section 3.2)

### GET /api/children/[id]
Get a single child profile.

### PATCH /api/children/[id]
Update a child profile.

---

## Booking Routes

### POST /api/bookings
Create a new booking. Triggers payment intent creation.

**Request:**
```json
{
  "coach_profile_id": "uuid",
  "sport_id": "uuid",
  "session_date": "2026-04-12",
  "session_start_time": "09:00",
  "session_end_time": "10:00",
  "session_type": "individual",
  "child_profile_id": "uuid",
  "promo_code": "LAUNCH50"
}
```

**Response 201:**
```json
{
  "booking": { "id": "uuid", "booking_reference": "CRK-2026-0001", ... },
  "payment_intent": { "client_secret": "pi_..._secret_..." }
}
```

**Business rules applied:**
- BR-01: Commission added on top of coach price
- BR-06: Booking auto-confirmed on successful payment
- BR-07: messaging_unlocked set to true

---

### POST /api/guest/bookings
Guest (logged-out) checkout. Creates a provisional user, a `pending_payment` booking, and a Stripe PaymentIntent, then returns the client secret so the browser can confirm payment with the Stripe Payment Element. The booking is flipped to `confirmed` by the `payment_intent.succeeded` webhook (BR-06).
**Status: Implemented — P-00c-API**
**Auth: None (public). Uses the service-role client — provisional users have no Supabase Auth credentials.**

**Request:**
```json
{
  "coachId": "uuid",
  "sportId": "uuid",
  "sessionType": "individual",
  "date": "2026-06-27",
  "startTime": "10:00",
  "pricePence": 4000,
  "participantName": "Yuwin",
  "participantAge": 10,
  "idempotencyToken": "client-generated-uuid",
  "guest": {
    "fullName": "Alex Parent",
    "email": "alex@example.com",
    "phone": "07700 900000",
    "address": "1 High St",
    "townCity": "London",
    "postcode": "SW1A 1AA"
  }
}
```

**Response 200:**
```json
{
  "clientSecret": "pi_..._secret_...",
  "bookingReference": "CRK-2026-7F3A9K",
  "bookingId": "uuid"
}
```
On a retry carrying the same `idempotencyToken`, the existing booking + PaymentIntent are returned (no new rows created).

**Participant (UX-16):** `participantName` is REQUIRED (trimmed, ≤100 chars) — who the session is for (a parent's child, or an adult player booking for themselves). `participantAge` is optional (integer 1–99). Both are persisted on `bookings.participant_name`/`participant_age` and stashed in the PaymentIntent metadata (`participant_name`, `participant_age` as a string) so the confirmation email can show a "Booking for" row.

**Error responses:**
```
400 invalid_body              malformed/missing fields
400 sport_unavailable         coach does not offer this sport (or inactive)
400 session_type_unavailable  no price set for the requested session type
400 invalid_session_time      start time + duration is malformed / crosses midnight
404 coach_unavailable         coach not found, not live, paused, or suspended
409 price_mismatch            client pricePence ≠ server canonical price (tamper/stale)
409 date_blocked              the coach blocked this date (blocked_dates)
409 outside_booking_window    past date, beyond max_advance_days, or inside min_advance_hours
409 slot_taken                slot held by a live booking or programme session (`reason`
                              names the conflict); also the migration-034 unique-index
                              race backstop at insert time
409 slot_not_available        time is not inside any active availability block that date
502 payment_init_failed       Stripe PaymentIntent could not be created
500 internal_error            DB failure (rolls back via soft-delete — no orphan rows)
```

**Slot validation (BUG-19 Phase 1 / BUG-21):** before any money object is created, the requested slot must be one the public calendar would offer — computed with the same `bookableSlots()` function (`src/lib/availability/slots.ts`): inside an active availability block (recurring or ad-hoc; deliberately sport-unfiltered, matching the calendar), not on a blocked date, inside the coach's advance windows, and not overlapping a programme session (persisted or legacy recurring pattern) or a live booking — including overlapping-but-unequal start times, which the unique index alone cannot catch. All four slot 409s fire before the provisional user, booking row, and PaymentIntent exist.

**Business rules applied:**
- BR-01: Commission read from `platform_config`, added on top of the coach price. The client `pricePence` is re-verified server-side and never trusted for the charge. The canonical coach price is the `coach_sports` sport default, except for `individual` sessions where the matching `availability_templates` block (the one whose window contains `startTime`) supplies a `price_override_pence` — overrides apply to 1-on-1 bookings only; group bookings always use the sport default (BUG-09).
- BR-10: All amounts integer pence; Stripe charged `parent_total_pence`.
- BR-12: `booking_reference` is `CRK-YYYY-XXXXXX` (random base32).
- Funds (P-00c-API MVP): plain PaymentIntent captured by the platform for the full total; the coach/commission split is recorded on `payment_intents` for the payout system. No Connect destination charge — coaches need not have completed Stripe onboarding.

---

### POST /api/guest/programme-enrolments
Guest (logged-out) group-programme enrolment checkout. Same shape as `/api/guest/bookings`: creates a provisional user, a `payment_status='pending'` enrolment, and a Stripe PaymentIntent, then returns the client secret. The `payment_intent.succeeded` webhook flips `payment_status` to `succeeded` and atomically claims a spot — via `increment_programme_spots()` for regular programmes, or `confirm_camp_slot_spots()` per (session, slot) for camps (BR-06; BUG-23).
**Status: Implemented — P-00c-ENROL; camp slot granularity BUG-23**
**Auth: None (public). Uses the service-role client — provisional users have no Supabase Auth credentials.**

**Request:**
```json
{
  "coachId": "uuid",
  "programmeId": "uuid",
  "paymentType": "per_session",
  "selectedSessionIds": ["uuid", "uuid"],
  "idempotencyToken": "client-generated-uuid",
  "guest": {
    "fullName": "Alex Parent",
    "email": "alex@example.com",
    "phone": "07700 900000",
    "address": "1 High St",
    "townCity": "London",
    "postcode": "SW1A 1AA"
  }
}
```
`selectedSessionIds` is required and non-empty for `paymentType: "per_session"`; ignored for `"block_upfront"`.

**Slot-selection wire format (BUG-23):** each entry is `"uuid"` (slot 0 — the only block of a non-camp session; unchanged) or `"uuid.N"` (block N of a camp-mode session, ordinal into `group_programme_sessions.slots`). Entries are validated per PAIR server-side (session in programme, scheduled, not past, `N` < the session's real block count; non-camp rejects `N > 0`) and deduped by pair. **Each pair is one session at the per-session price** — a full camp day (both slots) = 2 pairs = 2×, commission on top (BR-01). Camp junction rows are written via `reserve_camp_slot_sessions()` — an atomic per-slot capacity reservation, so a losing racer 409s BEFORE any Stripe intent exists; occupancy counts succeeded enrolments + pending holds under 15 minutes. Camp programmes are `per_session` only (approved ruling).

**Response 200:**
```json
{
  "clientSecret": "pi_..._secret_...",
  "enrolmentReference": "CRK-2026-7F3A9K",
  "enrolmentId": "uuid"
}
```
On a retry carrying the same `idempotencyToken`, the existing enrolment + PaymentIntent are returned (no new rows created).

**Error responses:**
```
400 invalid_body              malformed/missing fields, empty session list, or a malformed slot entry
400 payment_type_mismatch     paymentType ≠ programme.payment_type
400 session_price_unavailable per_session with no price_per_session_pence set
400 block_price_unavailable   block_upfront with no block_price_pence set
400 camp_block_unsupported    block_upfront requested for a camp-mode programme (BUG-23 ruling)
404 coach_unavailable         coach not found, not live, paused, or suspended
404 programme_unavailable     programme not found, not active, or not owned by the coach
409 invalid_sessions          a selected pair is missing/not scheduled/past/not in this programme/slot out of range
409 spots_taken               regular programme already full at create (soft check; camps use slot_full)
409 slot_full                 camp only — a selected (session, slot) has no spots left (atomic, pre-charge; body lists the full pairs)
502 payment_init_failed       Stripe PaymentIntent could not be created
500 internal_error            DB failure (rolls back: enrolment soft-failed, provisional user soft-deleted)
```

**Business rules applied:**
- BR-01: Commission read from `platform_config`, added on top of the re-derived coach price (per_session = `price_per_session_pence × n`; block = `block_price_pence`). Client amounts are never trusted.
- BR-10: All amounts integer pence; Stripe charged `parent_total_pence`.
- BR-12: `enrolment_reference` is `CRK-YYYY-XXXXXX` (random base32).
- Capacity: soft-checked at create; the authoritative atomic guard runs at webhook confirm via `increment_programme_spots()`. A full-at-confirm race logs `MANUAL REFUND NEEDED` (P-00c-ENROL S0 decision 3).
- Funds: same MVP shape as `/api/guest/bookings` — `payment_intents` audit row keyed on `enrolment_id` (not `booking_id`).

---

### GET /api/bookings
Get bookings for the authenticated user.

**Query params:**
```
status    'confirmed' | 'completed' | 'cancelled_parent' | 'cancelled_coach'
role      'parent' | 'player' | 'coach'
page      integer
```

---

### GET /api/bookings/[id]
Get a single booking's full details.

---

### POST /api/bookings/[id]/cancel
Cancel a booking.

**Request:**
```json
{ "reason": "Optional cancellation reason" }
```

**Business rules:**
- BR-04: Refund logic based on who cancels and when

**Response 200:**
```json
{
  "booking": { "status": "cancelled_parent", ... },
  "refund": { "amount_pence": 6600, "status": "pending" }
}
```

---

### POST /api/bookings/[id]/complete
Coach marks a session as complete.

**Response 200:** Updated booking + triggers review request notification

---

## Payment Routes

### Stripe Webhook
See **`## Webhook Routes → POST /api/webhooks/stripe`** below. (The path `/api/payments/webhook` was a pre-CF planning placeholder; the real endpoint lives at `/api/webhooks/stripe`. The events that planning entry listed — `payment_intent.succeeded`, `payment_intent.payment_failed`, `transfer.created`, `customer.subscription.updated` — are NOT implemented yet; they will land when the booking-payments work begins.)

---

### GET /api/payments/connect/onboard
Returns the authenticated coach's current Stripe Connect status.

**Auth:** Required (coach session)

**Response 200 — no account linked:**
```json
{ "connected": false }
```

**Response 200 — account linked:**
```json
{
  "connected": true,
  "charges_enabled": true,
  "payouts_enabled": true,
  "details_submitted": true,
  "bank_name": "Monzo Bank",
  "bank_last4": "5678"
}
```

`bank_name` / `bank_last4` (BUG-45): the coach's real payout destination from
Stripe `external_accounts` — the `default_for_currency` bank account, falling
back to the first bank account; both `null` when onboarding hasn't attached a
bank account yet. Only the bank name and last4 ever leave this route — never
full account or routing numbers. Consumed by the Get Paid page
(`src/components/coach/GetPaid.tsx`), which shows truthful fallbacks
("Payouts via Stripe" / "Connected via Stripe") when null.

**Errors:** 401 Unauthorised, 404 coach profile not found, 500 internal

---

### POST /api/payments/connect/onboard
Creates a Stripe Express account (if not already linked) and returns an
account link URL to redirect the coach through Stripe onboarding.
On subsequent calls, generates a fresh account link for the existing account.

**Auth:** Required (coach session)

**Response 200:**
```json
{ "onboarding_url": "https://connect.stripe.com/..." }
```

**Return URLs:**
- Success: `NEXT_PUBLIC_APP_URL/coach/get-paid?success=true`
- Refresh: `NEXT_PUBLIC_APP_URL/coach/get-paid?refresh=true`

**Errors:** 401 Unauthorised, 404 coach profile not found, 500 internal

---

### POST /api/subscriptions/upgrade
Upgrade coach to Premium subscription.

**Request:**
```json
{ "billing_period": "monthly" | "annual" }
```

---

## Review Routes

### POST /api/reviews
Submit a review after a session.

**Request:**
```json
{
  "booking_id": "uuid",
  "rating": 5,
  "comment": "Excellent coach, very patient."
}
```

---

### GET /api/coaches/[id]/reviews
Get all reviews for a coach.

---

### GET /api/coaches/earnings
Returns earnings summary and payout history for the authenticated coach.
**Status: Implemented — CD-09-api**
**Auth: Required (coach session)**

**Response 200:**
```json
{
  "summary": {
    "total_earned_pence": 245000,
    "pending_pence": 5500,
    "this_month_pence": 82500,
    "last_month_pence": 77500,
    "currency": "GBP"
  },
  "payouts": [
    {
      "id": "uuid",
      "booking_id": "uuid",
      "booking_reference": "CRK-2026-0012",
      "session_date": "2026-04-10",
      "session_type": "individual",
      "amount_pence": 5500,
      "currency": "GBP",
      "status": "paid",
      "scheduled_at": "2026-04-12T10:00:00Z",
      "processed_at": "2026-04-12T10:05:00Z"
    }
  ]
}
```

**Notes:**
- `summary.total_earned_pence` — lifetime sum of all `paid` payouts (BR-03: coach receives full `amount_pence`)
- `summary.pending_pence` — sum of payouts with status `pending` or `processing`
- `summary.this_month_pence` — paid payouts where `processed_at` ≥ first day of current UTC month
- `summary.last_month_pence` — paid payouts in the prior calendar month
- `payouts` — max 50 rows, ordered by `scheduled_at DESC`, joined to bookings for reference/date/type
- All money values in pence integers — never decimals

**Errors:** 401 Unauthorised, 403 coach role required, 404 coach profile not found

---

## Notification Routes

### PATCH /api/notifications/preferences
Update notification preferences for the authenticated user.

### GET /api/notifications
Get in-app notifications for the authenticated user.

### PATCH /api/notifications/[id]/read
Mark a notification as read.

### POST /api/notifications/test
Send a test email to the authenticated user. Development/staging use only.

**Auth:** Required

**Request body:**
```json
{ "type": "booking_confirmation" | "new_booking" }
```

**Response:**
```json
{ "success": true, "sentTo": "user@example.com", "type": "booking_confirmation" }
```

Sends a dummy email via Resend to verify delivery. Uses fixed stub data (coach "Test Coach", sport "Cricket", £55.00 parent total / £50.00 coach earnings).

---

## Webhook Routes

### POST /api/webhooks/stripe
Receive and process Stripe webhook events. Handles `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled`; every other event type is acknowledged with 200 and ignored.
**Status: Implemented — BUG-STRIPE-ONBOARDING-COMPLETE-WIRING + P-00c-API + BUG-13b**
**Auth: Stripe signature (no Crikly auth — `STRIPE_WEBHOOK_SECRET` is the trust root)**

**Headers:**
```
stripe-signature   required — verified against STRIPE_WEBHOOK_SECRET
```

**Body:** raw JSON event payload — must NOT be re-serialised before signature verification. The route reads `await request.text()` and passes the unmodified bytes to `stripe.webhooks.constructEvent`.

**Events handled:**

| `event.type` | Action |
|---|---|
| `account.updated` | Computes `isComplete = charges_enabled && payouts_enabled` from `event.data.object` (Stripe.Account) and `UPDATE coach_profiles SET stripe_onboarding_complete = isComplete WHERE stripe_account_id = account.id`. Both directions written, so a Stripe-side capability revocation flips the flag back to `false`. |
| `payment_intent.succeeded` | Branches on metadata. **Programme enrolment (P-00c-ENROL):** `metadata.enrolment_id` present → sets `payment_intents.status = 'succeeded'`, then calls `confirm_programme_enrolment()` (migration 041, BUG-15) — ONE transaction that flips `payment_status` `pending → succeeded` AND claims the spot (**camps** → `confirm_camp_slot_spots()` per BUG-23 ruling 3; **regular** → `increment_programme_spots()`); `{confirmed:false}` = redelivery no-op; `{spot_claimed:false}` = a durable `payment_alerts` (needs_refund) row was written in the same transaction, the **confirmation email is suppressed**, and the ops email fires. Otherwise sends `sendProgrammeConfirmation` — for camps the email lists the exact slots bought (`sessionLines`: "Tue 4 Aug — Morning (9:00am – 12:00pm)"). **1-to-1 booking (P-00c-API):** `metadata.booking_id` → `UPDATE bookings SET status = 'confirmed', messaging_unlocked = true WHERE id = booking_id AND status = 'pending_payment'` (BR-06, BR-07), then `sendBookingConfirmation`; the succeeded-after-release restore-conflict path writes a `payment_alerts` (restore_conflict) row and suppresses the email. Email failure is swallowed and never affects the response. |
| `payment_intent.payment_failed` | Sets `payment_intents.status = 'failed'` with `stripe_error_code` / `stripe_error_message`. A booking stays `pending_payment` — for Crikly's card-only intents a failed attempt is retryable, never definitive (BUG-13b); the update also bumps the audit row's `updated_at`, which the reaper reads as activity so a retrying payer keeps their slot. A programme enrolment is marked `payment_status = 'failed'` (only while still `pending`). Truly abandoned rows are released by `GET /api/cron/release-expired-bookings`. |
| `payment_intent.canceled` | **BUG-13b.** Definitive — a cancelled intent can never be charged. Sets `payment_intents.status = 'failed'` / `stripe_status = 'canceled'` (never downgrading a `succeeded` row). Booking intents: **releases the slot** — soft-deletes the booking (`deleted_at` + `cancelled_at` + `cancellation_reason = 'payment_intent_cancelled'`, status stays `pending_payment`) scoped to live `pending_payment` rows (idempotent), and soft-deletes the provisional guest profile. Enrolment intents: audit mark only (`payment_status = 'failed'` while `pending`) — a pending enrolment holds no spot. |
| any other | `console.info` log only, no DB writes, returns 200. |

**Succeeded-after-release backstop (BUG-13b):** if `payment_intent.succeeded` arrives for a booking the release path already freed (soft-deleted, status still `pending_payment`, release `cancellation_reason`), the handler restores it — undelete + `confirmed` + email; the migration-034 partial unique index re-checks on UPDATE so Postgres arbitrates whether the slot is still free. If restore fails (23505 — slot re-booked), it logs `MANUAL REFUND NEEDED` loudly. Unreachable by design (the reaper cancels the intent before releasing); auto-refund deferred to Phase 2 hardening.

**Response 200:** `{ "received": true }` — processed, replayed (ledger hit), in-flight duplicate, poison-bounded, unhandled type, or a PERMANENT handler outcome (durable `payment_alerts` row wherever money needs a human — BUG-15 refund policy B).

**Response 500 (BUG-15):** TRANSIENT failure — the `stripe_webhook_events` ledger is unavailable (returned before any side effect) or a handler hit a transient DB error (`RetryableWebhookError`). Stripe redelivers within its ~72h window; every handler is idempotent under redelivery (status-scoped writes + the atomic `confirm_programme_enrolment`). Events failing repeatedly are poison-bounded at 8 attempts: marked processed + a `payment_alerts` (webhook_poisoned) row — never silently lost.

**Idempotency ledger:** every event that passes signature verification is recorded in `stripe_webhook_events` (docs/03 §7.4) BEFORE any handler runs — replays return 200 immediately; rows older than 30 days are pruned by the reaper cron.

**Response 400:**
- Missing `stripe-signature` header.
- Signature verification fails (`stripe.webhooks.constructEvent` threw).
- `request.text()` failed to read the body.

**Response 500:** `STRIPE_WEBHOOK_SECRET` is not set in the runtime environment. Configuration error — Stripe will retry until the env is fixed.

**Setup notes:**
- The endpoint must be registered in the Stripe Dashboard for both **test** and **live** modes (Developers → Webhooks → Add endpoint). Subscribe to `account.updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, and `payment_intent.canceled` (BUG-13b) — every event is a billable round-trip.
- Webhook receivers have no Crikly user session — the route uses `createAdminClient()` to write to `coach_profiles`; ownership is implicit in the `stripe_account_id` match.
- **Card data is never touched.** This route only reads booleans (`charges_enabled`, `payouts_enabled`) from `Stripe.Account`. PCI scope unchanged.
- Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `stripe trigger account.updated`.

### POST /api/webhooks/stripe-connect
Receive and process Stripe webhook events from **connected accounts** (coach Stripe accounts). Handles `account.updated`; acknowledges `transfer.created`, `transfer.failed`, `payout.created`, `payout.paid`, and `payout.failed` with a log-only 200 (Block 0 — full payout reconciliation is post-Block-0); every other event type is acknowledged with 200 and ignored.
**Status: Implemented — BUG-44**
**Auth: Stripe signature (no Crikly auth — `STRIPE_CONNECT_WEBHOOK_SECRET` is the trust root; never `STRIPE_WEBHOOK_SECRET`)**

**Headers:**
```
stripe-signature   required — verified against STRIPE_CONNECT_WEBHOOK_SECRET
```

**Body:** raw JSON event payload — must NOT be re-serialised before signature verification. The route reads `await request.text()` and passes the unmodified bytes to `stripe.webhooks.constructEvent`.

**Events handled:**

| `event.type` | Action |
|---|---|
| `account.updated` | Computes `isComplete = charges_enabled && payouts_enabled` from `event.data.object` (Stripe.Account) and `UPDATE coach_profiles SET stripe_onboarding_complete = isComplete WHERE stripe_account_id = account.id`. Both directions written, so a Stripe-side capability revocation flips the flag back to `false` (BUG-44 ruling A — identical semantics to the platform route's handler; `details_submitted` alone is NOT sufficient). Zero matching rows is an info-log no-op (env mismatch / soft-deleted coach). |
| `transfer.created` / `transfer.failed` / `payout.created` / `payout.paid` / `payout.failed` | `console.info` log only (event type, `event.account`, object id), no DB writes, returns 200. |
| any other | `console.info` log only, no DB writes, returns 200. |

**Response 200:** `{ "received": true }` — processed, log-only, or unhandled type.

**Response 400:** missing `stripe-signature` header; signature verification failed; body read failed.

**Response 500:** `STRIPE_CONNECT_WEBHOOK_SECRET` (or the Stripe API key) is not set — configuration error; or the `account.updated` DB update hit a transient failure — Stripe redelivers, and the boolean write is idempotent so retries are always safe.

**Idempotency (BUG-44 ruling B):** no `stripe_webhook_events` ledger on this route for Block 0 — the only DB write is an idempotent boolean update, so redeliveries are harmless by construction. Adopting the shared ledger is a logged follow-up.

**Setup notes:**
- Register in the Stripe Dashboard (Tekly Solutions, `acct_1TF06pPDhbWKSHdt`) as a **Connect** endpoint — "Listen to events on Connected accounts" — for both test and live modes. Subscribe to `account.updated`, `transfer.created`, `transfer.failed`, `payout.created`, `payout.paid`, `payout.failed`.
- Webhook receivers have no Crikly user session — the route uses `createAdminClient()`; ownership is implicit in the `stripe_account_id` match.
- **Card data is never touched.** PCI scope unchanged.
- Local testing: `stripe listen --forward-connect-to localhost:3000/api/webhooks/stripe-connect --project-name tekly` (prints the `whsec_...` for `STRIPE_CONNECT_WEBHOOK_SECRET` in `.env.local`).
- Follow-up (logged in BUG-44 Step 0): remove the platform route's duplicate `account.updated` handler once this endpoint is live.

---

## Cron Routes

### GET /api/cron/release-expired-bookings
The `pending_payment` reaper (BUG-13b). Releases guest bookings whose checkout was abandoned with no definitive Stripe signal, so their slots stop blocking the public calendar and the write side.
**Status: Implemented — BUG-13b**
**Auth: `Authorization: Bearer $CRON_SECRET`** — Vercel sends this automatically for cron invocations when the env var is set; 401 otherwise, 500 if `CRON_SECRET` is unconfigured.

**Schedule:** `*/10 * * * *` via `vercel.json`. Repo config only — activates when deployed with `CRON_SECRET` set (Lasith-owned). Local testing: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/release-expired-bookings`.

**TTL policy (BUG-13b Step 0, soft TTL tightened to 15 min pre-push by Lasith):** soft TTL 15 min from booking creation; 15 min activity grace on `payment_intents.updated_at` (an actively retrying payer is never reaped); 2 h hard cap after which even `processing`/`requires_action` intents get a cancel attempt. Batch cap 50 rows/run, oldest first.

**Race safety — cancel-first arbitration:** a row is released ONLY after `stripe.paymentIntents.cancel()` succeeds (a cancelled intent can never be charged). A PI found `succeeded` is never released (loud log — webhook delivery problem). A refused cancel (raced to success) skips the row. Bookings with no `payment_intents` row (creation crashed mid-flight; the intent's secret never left the server) release directly.

**Release:** soft delete + `cancellation_reason = 'expired_pending_payment'` (see `src/lib/booking/release.ts`) + provisional guest profile soft-deleted alongside. Frees the slot atomically across the migration-034 unique index, the public calendar read, and the write-side commitments guard.

**Response 200:** `{ "checked": n, "released": n, "skipped_active": n, "skipped_stripe": n, "errors": n, "claims_reconciled": n, "ledger_pruned": n }` — `claims_reconciled` (BUG-19 P2) counts drift-released coach_time_claims (expected 0); `ledger_pruned` (BUG-15) counts stripe_webhook_events rows older than 30 days deleted this run.

**Phase 2 (BUG-19):** `coach_time_claims` expiry joins this route as a second sweep — same cadence, same cancel-first arbitration for money-bearing holds.

---

## Admin Routes

All admin routes require `admin` role with appropriate permission level.

### GET /api/admin/dashboard
Platform overview metrics.

### GET /api/admin/users
List all users. Supports filtering and search.

### PATCH /api/admin/users/[id]/suspend
Suspend a user account.

### GET /api/admin/dbs-verifications
List pending DBS verification requests.

### PATCH /api/admin/dbs-verifications/[id]
Approve or reject a DBS verification.

### POST /api/admin/refunds
Issue a manual refund for a dispute.

### GET /api/admin/disputes
List all disputes.

### PATCH /api/admin/disputes/[id]
Update a dispute status and resolution.

---

## Adding New Routes

When adding a new route:
1. Add it to this document in the same commit
2. Include: method, path, request body, response, business rules applied
3. Write integration tests in `src/app/api/[route]/route.test.ts`
4. Tag: `docs(api): add [route name] v[version]`

---

*Crikly API Reference v1.0 — March 2026*
*Placeholder — routes documented as they are built.*
*Every new route must be added here before merging to develop.*
