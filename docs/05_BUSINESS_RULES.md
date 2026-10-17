# Crikly — Business Rules

**Version:** 1.1
**Last Updated:** 17 October 2026
**Changed:** New BR-21 — Coach Payout: Stripe Fee Deduction (the Notion "BR-02" fee rule renumbered; BR-02 stays the commission rate) (T-17); BR-01 reduced to the commission-on-top calculation; BR-02 notes the 0% pilot commission (Decision T-18); BR-03 split by booking type — bookings paid 48h after auto-completion, programme enrolments paid immediately (T-16, not yet implemented, TECH-06); BR-04 implementation status added (TECH-07). Previous: Added BR-20 — Coach Scheduling Conflict Rules (BUG-16/17/18).

These rules MUST be enforced in code, not just documented.
Every rule has an ID. Reference it in code comments and commits.

---

## BR-01 — Commission Calculation

Commission is added ON TOP of the coach's price. Never deducted from it.

```
parent_total   = coach_price + (coach_price × commission_rate)
platform_earns = coach_price × commission_rate
```

**Example** (standard 10% rate; the pilot runs at 0% — see BR-02):
```
coach_price  = 6000p (£60.00)
commission   = 10% = 600p
parent_pays  = 6600p (£66.00)
platform_earns = 600p
```

**Implementation rules:**
- Commission rate always read from `platform_config` or `countries` — NEVER hardcoded
- Commission rate snapshot stored on `bookings.commission_rate` at booking time; never changes after
- All amounts stored as integers in pence

The Stripe processing fee is deducted from the coach payout; see BR-21.

---

## BR-02 — Default Commission Rate

Default commission rate is 10% (0.1000).
Stored in `platform_config.default_commission_rate`.
Admin can change this at any time — takes effect on new bookings only.
Country-specific rates stored in `countries.default_commission_rate`.

Standard rate 10%. The pilot runs at 0% (`platform_config.default_commission_rate` set to 0 in Aug 2026; Decision T-18). The rate is a setting, read at runtime, never hardcoded.

---

## BR-03 — Payout Schedule

Payout timing depends on the type of booking (Decision T-16, 15 Oct 2026).

**1-to-1 and group bookings (rows in `bookings`): paid 48 hours after the session completes.**
- `completed_at` is set automatically after the session ends (session end + `platform_config.default_autocomplete_delay_hours`, applied by the hourly auto-complete job). The coach does NOT tap "Mark as complete". This supersedes REQ-C-066.
- `payout_eligible_at` = `booking.completed_at` + `platform_config.default_payout_delay_hours`
- Default 48 hours; admin configurable (24h, 72h, 7 days); read from `platform_config`, never hardcoded
- Payout triggers only when the session is completed AND `payout_eligible_at` has passed
- Method: Stripe Connect transfer tied to the original charge (`source_transaction`). Amount: per BR-21.

**Programme enrolments (rows in `group_programme_enrolments`): paid immediately.**
- The coach is paid as soon as the parent's enrolment payment succeeds. NO 48-hour hold.
- Same method and amount rule (`source_transaction`, coach price minus the Stripe fee per BR-21).
- Accepted risk: the coach is paid before sessions are delivered. If a programme is cancelled or a parent is refunded (BR-04, REQ-C-056, BR-17), the platform must reverse the Stripe transfer. A reversal fails if the coach has already withdrawn the money, and the platform carries that loss. Programme refunds are handled manually by an admin until built.
- STATUS: decided, NOT YET IMPLEMENTED. Live code creates no payout for a programme enrolment. Tracked as TECH-06.

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

**Implementation status (15 Oct 2026):** Scenarios A and B are implemented for bookings. Scenario C is NOT implemented: no coach cancellation path exists for a paid booking (TECH-07).

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

## BR-06 — Booking Confirmation

Default booking confirmation is instant (auto-confirmed on payment). Coaches may opt into manual approval mode via their booking policy settings. When manual approval is enabled, bookings enter `pending_approval` status and the coach must approve before the booking is confirmed.

```
Instant mode (default): Payment succeeds → booking.status = 'confirmed' → coach notified
Manual mode (opt-in):   Payment succeeds → booking.status = 'pending_approval' → coach approves → 'confirmed'
```

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
Format: CRK-YYYY-XXXXXX
Example: CRK-2026-7F3A9K

YYYY   = year of booking
XXXXXX = 6 random characters from an unambiguous base32 alphabet
         (Crockford-style, excludes 0/O/1/I)
```

**Why random, not sequential:** a per-year sequence requires a race-safe counter
and leaks total booking volume to anyone holding a reference. A 6-char random
suffix (~1.07e9 combinations/year) avoids both. Uniqueness is not enforced at the
DB level — collisions are astronomically unlikely and references are a
human-facing convenience, not a primary key (`bookings.id` is the UUID PK).

Generated in the booking creation API route via
`generateBookingReference()` in `src/lib/booking/guest-checkout.ts`.

> Changed P-00c-API (2026-06-24): was `CRK-YYYY-NNNN` sequential. Approved by
> Lasith in the P-00c-API plan gate.

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

## BR-16 — Manual Approval Booking Flow

When `requires_manual_approval = true` on a coach profile:

```
Payment captured → booking.status = 'pending_approval'
Coach has approval_window_hours to approve or decline
Coach approves → status = 'confirmed' → parent notified
Coach declines → status = 'declined' → full refund → parent notified
No response within window → auto-approved → status = 'confirmed'
```

Default approval window: 24 hours (coach configurable via `coach_profiles.approval_window_hours`).

**Implementation rules:**
- Manual approval is OFF by default (`requires_manual_approval = false`)
- Coach opts in via booking settings
- Payment is captured immediately but booking remains pending
- Auto-approval triggers if coach doesn't respond within window
- Full refund processed automatically on decline via Stripe

**Source:** REQ-C-045 in docs/14_COACH_REQUIREMENTS.md

---

## BR-17 — Group Programme Cancellation Refund

When coach cancels entire programme mid-run:

**Per-session model:**
```
refund = sum of price_per_session_pence for all future sessions not yet delivered
```

**Block payment model:**
```
refund = block_amount_pence × (sessions_remaining / sessions_total)
```

**Implementation rules:**
- All refunds automatic via Stripe
- `booking.status = 'cancelled_coach'` for all participants
- All participants notified immediately via push + email
- Repeated programme cancellations → `is_flagged = true`
  (same threshold as BR-13: 3 cancellations in 30 days)

**Source:** REQ-C-056 in docs/14_COACH_REQUIREMENTS.md

---

## BR-18 — Block Payment Late Joiner Pro-Rata

When a participant joins a fixed programme mid-run (`late_joining_allowed = true` on `group_programmes`):

**Block payment model:**
```
amount_due = price_per_session_pence × sessions_remaining
```

**Per-session model:**
```
parent pays forward only — no catch-up for missed sessions
```

**Implementation rules:**
- `joined_at_session_number` recorded on `group_programme_enrolments`
- This enables accurate refund calculation if they later cancel
- Late joiner only pays for sessions they can attend
- No retroactive charges for sessions already completed

**Source:** REQ-C-051 in docs/14_COACH_REQUIREMENTS.md

---

## BR-19 — No-Show Refund Calculation

Coach sets `no_show_policy` per sport on `coach_sports` table.

Refund logic when coach marks a booking as no-show:

**no_show_policy = 'full_refund':**
```
refund = parent_total_pence
coach earns 0
```

**no_show_policy = 'partial_refund':**
```
refund = parent_total_pence × (no_show_refund_percentage / 100)
coach earns parent_total_pence − refund − commission_pence
```

**no_show_policy = 'no_refund':**
```
refund = 0
coach earns coach_price_pence (normal payout)
```

**Implementation rules:**
- Refund processed automatically via Stripe on coach marking no-show
- `booking.status = 'no_show'`
- `payout_eligible_at` set normally for coach earned portion
- Coach configures policy when setting up each sport's booking settings

**Source:** REQ-C-070 in docs/14_COACH_REQUIREMENTS.md

---

## BR-20 — Coach Scheduling Conflict Rules

A coach's committed time on any calendar date is the union of: active
recurring availability blocks (by weekday), ad-hoc availability slots (by
`specific_date`), group-programme sessions (persisted `group_programme_sessions`
rows, or — for programmes with no session rows — the recurring `day_of_week`/
`days_of_week` pattern expanded within `starts_at`/`ends_at`), and confirmed
1-on-1 bookings (any status except `cancelled_parent`/`cancelled_coach`/
`no_show`, and not soft-deleted). Overlap is half-open — a slot ending exactly
when another begins does not conflict.

**Precedence (read side — public calendar):** when a programme session and a
1-on-1 availability slot overlap on a date, the **programme always wins**. The
colliding 1-on-1 start slot is suppressed entirely for that date (BUG-16) — it
does not render, and its calendar dot is not shown.

**Creation guard (write side):** a coach is blocked (HTTP 409) from creating
anything that overlaps their existing commitments on that date:
- **Ad-hoc availability slot** — checked against the full commitment set on its
  `specific_date` (BUG-17). `specific_date` is mandatory for ad-hoc blocks.
- **Programme session** (create or edit, while the programme is unlocked /
  `current_spots = 0`) — each session date checked against the full commitment
  set (BUG-18).
- **Recurring availability slot** — checked only against other *recurring*
  blocks on the same weekday, sport-agnostic (Decision B, 30 Jun 2026). It is
  deliberately NOT blocked against programmes or bookings, since the read-side
  suppression above already hides any programme collision.

The check is sport-agnostic throughout: a busy interval occupies the coach
regardless of which sport it belongs to.

**Out of scope (tracked separately as BUG-19):** the cross-table race where two
parents pay simultaneously via two independent booking paths (1-on-1 vs
programme enrolment). BR-20 covers single-actor, single-action conflicts only.

**Implementation:** `src/lib/availability/commitments.ts`
(`getCoachCommitments`, `findFirstConflict`) + `src/lib/availability/overlap.ts`.
Consumed by `POST`/`PATCH /api/coaches/availability`,
`POST`/`PATCH /api/coaches/programmes`, and (read side) the coach availability
calendar's `bookableSlots`.

**Source:** BUG-16 / BUG-17 / BUG-18 (Bug & Fix Log). Decisions A + B confirmed
by Lasith, 30 Jun 2026.

---

## BR-21 — Coach Payout: Stripe Fee Deduction

Locked 22 Jul 2026 in Notion; reaffirmed 15 Oct 2026. (Formerly labelled "BR-02" in Notion and in some code comments; BR-02 in this repo is the commission rate.)

```
coach_receives = coach_price − stripe_fee
stripe_fee     = the ACTUAL fee from the charge's balance transaction, read at transfer time, never estimated
```

- The coach bears the Stripe fee.
- The platform keeps the full commission (zero at 0%) and has no Stripe exposure on the commission.
- `payouts.amount_pence` stores the NET amount transferred to the coach.
- `payment_intents.coach_transfer_amount_pence` stores the GROSS coach price (audit figure; differs from the transfer by the Stripe fee).
- Coaches see the net figure as an estimate before the payout (payout-estimate).

**Example** (illustrative, standard 10%):
```
coach_price  = 6000p
commission   = 600p
parent_pays  = 6600p
stripe_fee   = 119p
coach_gets   = 5881p
```

**Pilot example** (illustrative, 0% commission; same Stripe fee figure reused for comparison):
```
coach_price  = 6000p
parent_pays  = 6000p
stripe_fee   = 119p
coach_gets   = 5881p
```

---

## Adding New Business Rules

When a new business rule is agreed:
1. Add it here with the next BR number
2. Add corresponding test in tests/ folder
3. Reference `// BR-XX` in the implementation code
4. Update Notion Decision Log if it was a deliberate product decision
5. Commit: `docs(rules): add BR-XX [description]`

---

*Crikly Business Rules v1.1 — 17 October 2026 (BR-21 Stripe fee deduction added; pilot commission 0%, standard 10%)*
*These rules must be enforced in code. Reference by ID in commits and comments.*
