# Crikly — Business Rules

**Version:** 1.0
**Last Updated:** March 2026

These rules MUST be enforced in code, not just documented.
Every rule has an ID. Reference it in code comments and commits.

---

## BR-01 — Commission Calculation

Commission is added ON TOP of the coach's price. Never deducted from it.

```
parent_total = coach_price + (coach_price × commission_rate)
coach_receives = coach_price (full amount, unchanged)
platform_earns = coach_price × commission_rate
```

**Example:**
```
coach_price  = 6000 pence (£60.00)
commission   = 10% → 600 pence (£6.00)
parent_pays  = 6600 pence (£66.00)
coach_gets   = 6000 pence (£60.00)
platform_net = 600 pence minus Stripe fees
```

**Implementation rules:**
- Commission rate always read from `platform_config` or `countries` table — NEVER hardcoded
- Commission rate snapshot stored on `bookings.commission_rate` at time of booking
- Once booked, commission rate on that booking never changes
- All amounts stored as integers in pence — never decimals

---

## BR-02 — Default Commission Rate

Default commission rate is 10% (0.1000).
Stored in `platform_config.default_commission_rate`.
Admin can change this at any time — takes effect on new bookings only.
Country-specific rates stored in `countries.default_commission_rate`.

---

## BR-03 — Payout Schedule

Coach is paid 48 hours after session completion.

```
payout_eligible_at = booking.completed_at + platform_config.default_payout_delay_hours
```

- Default: 48 hours
- Admin configurable: 24hrs, 72hrs, 7 days
- Read from `platform_config.default_payout_delay_hours` — never hardcoded
- Payout only triggers when: session is completed AND payout_eligible_at has passed
- Payout method: Stripe Connect transfer to coach's bank account

---

## BR-04 — Cancellation Policy

Three scenarios — each has a distinct outcome:

**Scenario A: Parent cancels BEFORE cancellation window**
```
Condition: current_time < (session_start - cancellation_window_hours)
Outcome:   Full refund to parent
           Coach earns nothing
           booking.status = 'cancelled_parent'
```

**Scenario B: Parent cancels WITHIN cancellation window**
```
Condition: current_time >= (session_start - cancellation_window_hours)
Outcome:   No refund — coach keeps full payment
           booking.status = 'cancelled_parent'
```

**Scenario C: Coach cancels (any time)**
```
Condition: Cancellation initiated by coach
Outcome:   Full refund to parent regardless of timing
           Coach earns nothing
           booking.status = 'cancelled_coach'
           If repeated cancellations → coach_profiles.is_flagged = true
```

**Cancellation window:**
- Default: 24 hours before session
- Coach configurable: stored in `coach_profiles.cancellation_window_hours`
- Snapshot of window stored on `bookings.cancellation_window_hours` at booking time

---

## BR-05 — Booking Window

Coaches control how far in advance parents can book.

```
Minimum advance: parents cannot book sessions starting in less than min_advance_hours
Maximum advance: parents cannot book sessions more than max_advance_days in the future
```

- Default min: 24 hours (`platform_config.default_min_advance_hours`)
- Default max: 56 days / 8 weeks (`platform_config.default_max_advance_days`)
- Coach overrides stored in `coach_profiles.min_advance_hours` and `coach_profiles.max_advance_days`
- Enforced in booking API route — reject bookings outside window

---

## BR-06 — Auto-Confirmed Bookings

Bookings are confirmed instantly on successful payment. No coach approval step.

```
Payment succeeds → booking.status = 'confirmed' → coach notified
```

No manual approval queue. Like booking a hotel — instant on payment.

---

## BR-07 — Messaging Lock

Messaging between parent/player and coach is only unlocked after a confirmed booking.

```
Before confirmed booking: messaging_unlocked = false
After confirmed booking:  messaging_unlocked = true
```

Phase 1: messaging_unlocked = true means contact details shared via email/push.
Phase 2: messaging_unlocked = true opens the in-app messaging inbox.

---

## BR-08 — Child Data Access

Medical notes and Training Passport visibility is strictly controlled.

```
Child medical notes:
  → Always visible to coach with a confirmed booking
  → Never visible to coaches without a booking
  → Never visible in public API responses

Training Passport:
  → privacy = 'open'         → All coaches can view
  → privacy = 'booking_only' → Only coaches with confirmed booking
  → privacy = 'private'      → No coach can view — basic profile only
```

---

## BR-09 — Child → Player Transition

When a child profile holder turns 16:

1. Platform detects birthday from `child_profiles.date_of_birth`
2. Parent receives email + in-app notification
3. Invite sent to child's email
4. Parent approves data transfer
5. Full Training Passport migrated to new Player account
6. Parent loses access — player owns their own data (GDPR)
7. 30-day window to complete before child profile is locked
8. If child already has a player account → passports merged

---

## BR-10 — Multi-Currency

All prices stored with ISO currency code. Phase 1 = GBP only.

```
Every price field has a paired currency field:
  price_pence + currency (e.g. 6000, 'GBP')

Never hardcode 'GBP' in application logic.
Always reference from user's country or config.
```

---

## BR-11 — Age Gate (Player)

Player registration requires the user to be 16 or older.

```
player_profiles.date_of_birth must be at least 16 years before today
Enforced in API route — reject if under 16
```

---

## BR-12 — Booking Reference Format

Every booking gets a human-readable reference number.

```
Format: CRK-YYYY-NNNN
Example: CRK-2026-0042

YYYY = year of booking
NNNN = sequential number within that year (zero-padded to 4 digits)
```

Generated in booking creation API route.

---

## BR-13 — Coach Repeated Cancellation Flagging

If a coach cancels more than a threshold number of bookings, their account is flagged.

```
Threshold: admin configurable (default: 3 cancellations in 30 days)
Action: coach_profiles.is_flagged = true
Admin notification: triggered immediately
Coach notification: sent informing them of the flag
```

---

## BR-14 — Promo Code Validation

Before applying a promo code at checkout:

1. Check `promo_codes.code` exists and matches (case-insensitive)
2. Check `promo_codes.is_active = true`
3. Check `promo_codes.valid_from <= now()`
4. Check `promo_codes.valid_until IS NULL OR valid_until >= now()`
5. Check `promo_codes.max_uses IS NULL OR current_uses < max_uses`
6. Check `promo_codes.min_booking_value_pence IS NULL OR booking_value >= min_booking_value`
7. Check `promo_codes.sport_id IS NULL OR sport matches`

If all pass → apply discount, increment `current_uses`.

---

## BR-15 — Free Tier Usage Limits

Free tier coaches have configurable limits enforced at runtime.

```
Check: SELECT tier_features WHERE tier_id = coach.tier AND feature_key = 'group_sessions'
If usage_limit IS NOT NULL:
  Check tier_usage WHERE coach_id AND feature_key AND usage_month = current_month
  If usage_count >= usage_limit → reject with 403
```

Limits read from `tier_features` table — never hardcoded.
Current usage tracked in `tier_usage` table.

---

## Adding New Business Rules

When a new business rule is agreed:
1. Add it here with the next BR number
2. Add corresponding test in tests/ folder
3. Reference `// BR-XX` in the implementation code
4. Update Notion Decision Log if it was a deliberate product decision
5. Commit: `docs(rules): add BR-XX [description]`

---

*Crikly Business Rules v1.0 — March 2026*
*These rules must be enforced in code. Reference by ID in commits and comments.*
