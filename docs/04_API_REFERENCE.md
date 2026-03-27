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

**Query params:**
```
sport_id        UUID
location_lat    float
location_lng    float
radius_km       integer (default: 10)
session_type    'individual' | 'group'
skill_level     'beginner' | 'intermediate' | 'advanced'
min_price       integer (pence)
max_price       integer (pence)
dbs_verified    boolean
gender          'male' | 'female' | 'other'
min_rating      float
sort            'nearest' | 'rating' | 'price_asc' | 'available'
page            integer (default: 1)
limit           integer (default: 20, max: 50)
```

**Response 200:**
```json
{
  "coaches": [...],
  "total": 42,
  "page": 1,
  "pages": 3
}
```

---

### GET /api/coaches/[id]
Get a single coach's full public profile.

**Response 200:**
```json
{
  "id": "uuid",
  "full_name": "...",
  "bio": "...",
  "rating_avg": 4.8,
  "rating_count": 47,
  "sessions_completed": 47,
  "dbs_status": "verified",
  "sports": [...],
  "qualifications": [...],
  "photos": [...],
  "availability": [...]
}
```

---

### POST /api/coaches/profile
Create or update the authenticated coach's profile.

**Request:** Coach profile fields (see database schema section 3.4)

**Response 201/200:** Updated coach profile object

---

### GET /api/coaches/[id]/availability
Get available slots for a coach.

**Query params:**
```
from_date   date (YYYY-MM-DD)
to_date     date (YYYY-MM-DD)
sport_id    UUID (optional)
```

**Response 200:**
```json
{
  "slots": [
    {
      "date": "2026-04-12",
      "day_of_week": 6,
      "start_time": "09:00",
      "end_time": "10:00",
      "available": true
    }
  ]
}
```

---

### POST /api/coaches/[id]/availability
Create availability template blocks.

### DELETE /api/coaches/[id]/availability/[blockId]
Remove an availability template block.

### POST /api/coaches/[id]/blocked-dates
Add a blocked date.

### DELETE /api/coaches/[id]/blocked-dates/[date]
Remove a blocked date.

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

### POST /api/payments/webhook (Stripe)
Stripe webhook handler. Verifies signature, processes events.

**Events handled:**
- `payment_intent.succeeded` → confirm booking
- `payment_intent.payment_failed` → cancel booking
- `transfer.created` → log payout
- `customer.subscription.updated` → update coach tier

---

### POST /api/payments/connect/onboard
Generate Stripe Connect onboarding URL for coach.

**Response 200:**
```json
{ "onboarding_url": "https://connect.stripe.com/..." }
```

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

## Notification Routes

### PATCH /api/notifications/preferences
Update notification preferences for the authenticated user.

### GET /api/notifications
Get in-app notifications for the authenticated user.

### PATCH /api/notifications/[id]/read
Mark a notification as read.

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
