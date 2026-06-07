# Crikly — API Reference

**Version:** 1.0
**Last Updated:** March 2026

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

**Response 200:**
```json
{
  "id": "uuid",
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

**Response 201/200:** Updated coach profile object

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
      "end_time": "12:00"
    }
  ],
  "blocked_dates": ["2026-04-19", "2026-04-20"],
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
- `sport_id` filter matches templates for that sport OR templates with no sport (applies to all)

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
  "details_submitted": true
}
```

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
Receive and process Stripe webhook events. Currently handles `account.updated` only; every other event type is acknowledged with 200 and ignored.
**Status: Implemented — BUG-STRIPE-ONBOARDING-COMPLETE-WIRING**
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
| any other | `console.info` log only, no DB writes, returns 200. |

**Response 200:** `{ "received": true }` — sent for every event Stripe successfully signed, including unhandled types and post-error paths. Stripe retries on any non-2xx, so the route MUST NOT 5xx on DB errors.

**Response 400:**
- Missing `stripe-signature` header.
- Signature verification fails (`stripe.webhooks.constructEvent` threw).
- `request.text()` failed to read the body.

**Response 500:** `STRIPE_WEBHOOK_SECRET` is not set in the runtime environment. Configuration error — Stripe will retry until the env is fixed.

**Setup notes:**
- The endpoint must be registered in the Stripe Dashboard for both **test** and **live** modes (Developers → Webhooks → Add endpoint). Subscribe to event `account.updated` only — every event is a billable round-trip.
- Webhook receivers have no Crikly user session — the route uses `createAdminClient()` to write to `coach_profiles`; ownership is implicit in the `stripe_account_id` match.
- **Card data is never touched.** This route only reads booleans (`charges_enabled`, `payouts_enabled`) from `Stripe.Account`. PCI scope unchanged.
- Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `stripe trigger account.updated`.

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
