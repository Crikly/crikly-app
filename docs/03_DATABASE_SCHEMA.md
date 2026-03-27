# Crikly — Database Schema

**Version:** 1.1
**Version:** 1.1
**Last Updated:** March 2026
**Changed:** Added child photo, coach gender, is_featured, admin roles, content pages, session notes, terms acceptance, GDPR deletion flag, OneSignal ID, review tracking, auth provider
**Maintainer:** Lasith Jayarathne
**Single source of truth for all database tables.**

Read this file before touching any database table.
Every migration must update this document in the same commit.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Module 1 — Identity & Auth](#2-module-1--identity--auth)
3. [Module 2 — Profiles](#3-module-2--profiles)
4. [Module 3 — Platform Config](#4-module-3--platform-config)
5. [Module 4 — Availability & Scheduling](#5-module-4--availability--scheduling)
6. [Module 5 — Bookings](#6-module-5--bookings)
7. [Module 6 — Payments & Payouts](#7-module-6--payments--payouts)
8. [Module 7 — Training Passport & Reviews](#8-module-7--training-passport--reviews)
9. [Module 8 — Subscriptions & Tiers](#9-module-8--subscriptions--tiers)
10. [Module 9 — Notifications & Messaging](#10-module-9--notifications--messaging)
11. [Module 10 — Admin & Governance](#11-module-10--admin--governance)
12. [Entity Relationships](#12-entity-relationships)

---

## 1. Design Principles

```
Every table has: id (uuid), created_at, updated_at
Every table has RLS enabled — no exceptions
Soft deletes only: deleted_at timestamp — never hard DELETE
All prices stored as integers in pence (£9.99 = 999)
Currency stored as ISO code alongside every price field
All timestamps in UTC
UUIDs for all primary keys — never sequential integers
Foreign keys always explicitly defined
No orphaned records — referential integrity enforced
```

---

## 2. Module 1 — Identity & Auth

### 2.1 user_profiles

One row per registered user. Extends Supabase auth.users.

**Purpose:** Stores shared identity data used across all roles.
**Owner:** The user themselves.
**Migration:** 001_create_user_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| auth_user_id | uuid | NO | — | FK → auth.users(id) ON DELETE CASCADE |
| full_name | text | NO | — | Display name |
| avatar_url | text | YES | null | Supabase Storage URL |
| phone | text | YES | null | Optional — for SMS Phase 2 |
| whatsapp_number | text | YES | null | Optional — for WhatsApp Phase 3 |
| location_city | text | YES | null | Used as default search location |
| location_postcode | text | YES | null | Used for geo search |
| location_lat | numeric(10,7) | YES | null | Coordinates for distance search |
| location_lng | numeric(10,7) | YES | null | Coordinates for distance search |
| country_code | text | NO | 'GB' | ISO country code |
| active_role | text | NO | 'parent' | Currently active role in app |
| auth_provider | text | NO | 'email' | 'email', 'google', 'apple' |
| terms_accepted_at | timestamptz | YES | null | When user accepted T&Cs — required before use |
| deletion_requested_at | timestamptz | YES | null | GDPR right to deletion request |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**RLS Policies:**
- SELECT: Own record only (auth.uid() = auth_user_id)
- INSERT: Own record only
- UPDATE: Own record only
- DELETE: Not permitted (soft delete via deleted_at)

**Indexes:**
- auth_user_id_idx (unique)
- deleted_at_idx (partial — where deleted_at is null)

---

### 2.2 user_roles

Tracks which roles a user has activated. One row per role per user.

**Purpose:** Multi-role account support.
**Migration:** 001_create_user_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) |
| role | text | NO | — | 'parent', 'player', 'coach', 'admin' |
| is_active | boolean | NO | true | Can deactivate a role without deleting |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(user_profile_id, role) — one row per role per user

**RLS Policies:**
- SELECT: Own records only
- INSERT: Own records only
- UPDATE: Own records only

---

## 3. Module 2 — Profiles

### 3.1 parent_profiles

Exists only for users with the 'parent' role.

**Purpose:** Parent-specific data for booking sessions for their children.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) |
| preferred_sport_ids | uuid[] | YES | null | Array of sport IDs from sports table |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Own record only
- INSERT: Own record only
- UPDATE: Own record only

---

### 3.2 child_profiles

Children attached to a parent account. Unlimited per parent.

**Purpose:** Stores child details visible to confirmed coaches.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| parent_profile_id | uuid | NO | — | FK → parent_profiles(id) |
| full_name | text | NO | — | Child's full name |
| date_of_birth | date | NO | — | Used for age gate and 16→player transition |
| sport_ids | uuid[] | NO | — | Sports the child is interested in |
| skill_level | text | NO | — | 'beginner', 'intermediate', 'advanced' |
| medical_notes | text | YES | null | Safety critical — visible to confirmed coaches |
| notes_for_coach | text | YES | null | Context for coaching sessions |
| transition_status | text | NO | 'child' | 'child', 'transition_pending', 'transitioned' |
| transitioned_player_id | uuid | YES | null | FK → player_profiles(id) after transition |
| transition_initiated_at | timestamptz | YES | null | When 16th birthday transition started |
| passport_privacy | text | NO | 'booking_only' | 'open', 'booking_only', 'private' |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- ALL: Parent only (auth matches parent_profile_id.user_profile_id.auth_user_id)
- SELECT (coach): Only coaches with a confirmed booking for this child

**Indexes:**
- parent_profile_id_idx
- date_of_birth_idx (for birthday transition cron job)

---

### 3.3 player_profiles

Adult players (16+) who book coaching for themselves.

**Purpose:** Player-specific data including their own Training Passport.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) |
| date_of_birth | date | NO | — | Must be 16+ to register as player |
| sport_ids | uuid[] | NO | — | Sports the player is interested in |
| skill_level | text | NO | — | 'beginner', 'intermediate', 'advanced' |
| medical_notes | text | YES | null | Shared with confirmed coaches |
| passport_privacy | text | NO | 'booking_only' | 'open', 'booking_only', 'private' |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT/UPDATE: Own record only
- SELECT (coach): Only coaches with a confirmed booking for this player

---

### 3.4 coach_profiles

Verified sports coaches offering sessions.

**Purpose:** All coach-specific data for their public profile and business settings.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) |
| bio | text | YES | null | Public biography |
| years_experience | integer | YES | null | Years of coaching experience |
| stripe_account_id | text | YES | null | Stripe Connect account ID |
| stripe_onboarding_complete | boolean | NO | false | Has completed Stripe Connect setup |
| dbs_status | text | NO | 'none' | 'none', 'pending', 'verified', 'expired' |
| dbs_verified_at | timestamptz | YES | null | When DBS badge was approved |
| dbs_expires_at | timestamptz | YES | null | Annual renewal date |
| is_profile_live | boolean | NO | false | Visible in search results |
| subscription_tier_id | uuid | YES | null | FK → subscription_tiers(id) |
| cancellation_window_hours | integer | NO | 24 | Min hours before session to cancel |
| min_advance_hours | integer | NO | 24 | Min hours ahead parents can book |
| max_advance_days | integer | NO | 56 | Max days ahead parents can book (8 weeks) |
| rating_avg | numeric(3,2) | YES | null | Cached average rating (updated on review) |
| rating_count | integer | NO | 0 | Total number of reviews |
| gender | text | YES | null | 'male', 'female', 'other', 'prefer_not_to_say' — for search filter |
| is_featured | boolean | NO | false | Admin can manually feature coach in search results |
| is_suspended | boolean | NO | false | Account suspended by admin |
| is_flagged | boolean | NO | false | Flagged for admin review |
| sessions_completed | integer | NO | 0 | Total completed sessions (trust signal) |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Public (profile is publicly visible when is_profile_live = true)
- SELECT: Own profile (always, even when not live)
- INSERT/UPDATE: Own record only

**Indexes:**
- user_profile_id_idx (unique)
- is_profile_live_idx (partial — where is_profile_live = true)
- dbs_status_idx
- rating_avg_idx

---

### 3.5 coach_sports

Sports a coach offers, with per-sport pricing and settings.

**Purpose:** A coach can offer multiple sports with different rates.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| sport_id | uuid | NO | — | FK → sports(id) |
| session_types | text[] | NO | — | ['individual', 'group', 'both'] |
| skill_levels | text[] | NO | — | ['beginner', 'intermediate', 'advanced'] |
| price_individual_pence | integer | YES | null | Price in pence for 1-on-1 session |
| price_group_pence | integer | YES | null | Price in pence per person for group |
| max_group_size | integer | YES | null | Max participants in a group session |
| session_duration_minutes | integer | NO | 60 | Default session length |
| currency | text | NO | 'GBP' | ISO currency code |
| is_active | boolean | NO | true | Coach can deactivate a sport |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(coach_profile_id, sport_id)

**RLS Policies:**
- SELECT: Public (when coach profile is live)
- INSERT/UPDATE/DELETE: Coach only

---

### 3.6 coach_qualifications

Qualifications and certifications a coach holds.

**Purpose:** Structured + free text qualifications for trust building.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| qualification_type_id | uuid | YES | null | FK → qualification_types(id) — NULL if custom |
| custom_name | text | YES | null | Free text if not in structured list |
| issuing_body | text | YES | null | e.g. 'ECB', 'FA', 'LTA' |
| issued_date | date | YES | null | |
| expiry_date | date | YES | null | |
| notes | text | YES | null | Additional context |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Public (when coach profile is live)
- INSERT/UPDATE/DELETE: Coach only

---

### 3.7 coach_photos

Multiple photos for a coach profile. Premium coaches can upload more.

**Purpose:** Coach gallery — builds trust with parents through visual presence.
**Migration:** 002_create_profiles.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| photo_url | text | NO | — | Supabase Storage URL |
| sort_order | integer | NO | 0 | Display order (0 = first) |
| is_primary | boolean | NO | false | Main profile photo shown in search |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Business Rules:**
- Free tier: max 1 photo (enforced via tier_features limit)
- Premium tier: unlimited photos
- One photo must be primary at all times (is_primary = true)

**RLS Policies:**
- SELECT: Public (when coach profile is live)
- INSERT/UPDATE/DELETE: Coach only

---

## 4. Module 3 — Platform Config

### 4.1 sports

Admin-configured list of sports and activities available on the platform.

**Purpose:** Generic sport table — adding a new sport is one row, zero code changes.
**Migration:** 003_create_platform_config.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| name | text | NO | — | 'Cricket', 'Football', 'Tennis' |
| slug | text | NO | — | 'cricket', 'football', 'tennis' |
| icon_url | text | YES | null | Sport icon for UI |
| is_active | boolean | NO | true | Admin can disable a sport |
| sort_order | integer | NO | 0 | Display order in UI |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(slug)

**RLS Policies:**
- SELECT: Public
- INSERT/UPDATE/DELETE: Admin only

---

### 4.2 qualification_types

Admin-defined list of coaching qualifications coaches can select.

**Purpose:** Structured qualification list for filtering and trust.
**Migration:** 003_create_platform_config.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| sport_id | uuid | YES | null | FK → sports(id) — null means applies to all sports |
| name | text | NO | — | 'ECB Level 1', 'FA Level 2' |
| issuing_body | text | NO | — | 'ECB', 'FA', 'LTA' |
| is_active | boolean | NO | true | |
| sort_order | integer | NO | 0 | |
| created_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Public
- INSERT/UPDATE/DELETE: Admin only

---

### 4.3 countries

Admin-configured list of countries the platform operates in.

**Purpose:** Multi-country support — adding a new country is config, not code.
**Migration:** 003_create_platform_config.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| code | text | NO | — | 'GB', 'LK', 'AU' — ISO 3166-1 alpha-2 |
| name | text | NO | — | 'United Kingdom' |
| currency_code | text | NO | — | 'GBP', 'LKR', 'AUD' — ISO 4217 |
| default_commission_rate | numeric(5,4) | NO | 0.1000 | 10% default |
| payout_delay_hours | integer | NO | 48 | Hours after session before coach payout |
| default_cancellation_hours | integer | NO | 24 | Default cancellation window |
| default_min_advance_hours | integer | NO | 24 | Default min booking advance |
| default_max_advance_days | integer | NO | 56 | Default max booking window (8 weeks) |
| tax_year_start_month | integer | NO | 4 | UK = April (4), others vary |
| is_active | boolean | NO | false | Must be explicitly activated |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(code)

**RLS Policies:**
- SELECT: Public
- INSERT/UPDATE/DELETE: Admin only

**Seed Data:**
```sql
INSERT INTO countries (code, name, currency_code, is_active)
VALUES ('GB', 'United Kingdom', 'GBP', true);
```

---

### 4.4 platform_config

Global platform configuration values. Single row table.

**Purpose:** Admin-configurable business rules that affect the whole platform.
**Migration:** 003_create_platform_config.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| default_commission_rate | numeric(5,4) | NO | 0.1000 | 10% — overridden per country |
| default_payout_delay_hours | integer | NO | 48 | Hours before coach payout |
| default_cancellation_hours | integer | NO | 24 | Default cancellation window |
| default_min_advance_hours | integer | NO | 24 | Min hours before booking |
| default_max_advance_days | integer | NO | 56 | Max days ahead to book |
| dbs_verification_fee_pence | integer | NO | 2999 | £29.99 in pence |
| dbs_fee_currency | text | NO | 'GBP' | |
| max_featured_coaches_per_page | integer | NO | 3 | Featured slots in search results |
| child_transition_age | integer | NO | 16 | Age at which child becomes player |
| child_transition_window_days | integer | NO | 30 | Days to complete transition |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Authenticated users
- UPDATE: Admin only

---

### 4.5 feature_flags

Admin-controlled feature toggles. No deployment needed to enable/disable features.

**Purpose:** Enable gradual rollouts, A/B testing, rapid response to issues.
**Migration:** 003_create_platform_config.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| key | text | NO | — | 'training_passport', 'group_sessions' |
| enabled | boolean | NO | false | Toggle this to enable/disable |
| description | text | YES | null | What this flag controls |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(key)

**RLS Policies:**
- SELECT: Authenticated users
- INSERT/UPDATE/DELETE: Admin only

---

## 5. Module 4 — Availability & Scheduling

### 5.1 availability_templates

Weekly recurring availability pattern for a coach per sport.

**Purpose:** Coach sets their schedule once — it repeats automatically.
**Migration:** 004_create_availability.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| sport_id | uuid | YES | null | FK → sports(id) — null means all sports |
| day_of_week | integer | NO | — | 0=Sunday, 1=Monday...6=Saturday |
| start_time | time | NO | — | e.g. '09:00:00' |
| end_time | time | NO | — | e.g. '12:00:00' |
| is_active | boolean | NO | true | Coach can pause availability |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Business Rules:**
- No overlapping blocks on the same day for the same coach
- end_time must be after start_time
- Minimum slot duration = 30 minutes

**RLS Policies:**
- SELECT: Public (used to show availability in search)
- INSERT/UPDATE/DELETE: Coach only

**Indexes:**
- coach_profile_id_idx
- (coach_profile_id, day_of_week) composite index

---

### 5.2 blocked_dates

Specific dates a coach is unavailable despite their weekly template.

**Purpose:** Holidays, personal time, events — override the recurring template.
**Migration:** 004_create_availability.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| blocked_date | date | NO | — | The specific date blocked |
| reason | text | YES | null | Optional — internal only, not shown to parents |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(coach_profile_id, blocked_date)

**RLS Policies:**
- SELECT: Coach only (blocked dates are private)
- INSERT/UPDATE/DELETE: Coach only

---

## 6. Module 5 — Bookings

### 6.1 bookings

The core transaction record. Created on successful payment.

**Purpose:** Every confirmed session between a parent/player and a coach.
**Migration:** 005_create_bookings.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_reference | text | NO | — | Human-readable reference e.g. 'CRK-2026-001' |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| sport_id | uuid | NO | — | FK → sports(id) |
| booked_by_user_id | uuid | NO | — | FK → user_profiles(id) — parent or player |
| child_profile_id | uuid | YES | null | FK → child_profiles(id) — null if player booking |
| player_profile_id | uuid | YES | null | FK → player_profiles(id) — null if parent booking |
| session_type | text | NO | — | 'individual', 'group' |
| session_date | date | NO | — | Date of session |
| session_start_time | time | NO | — | Start time |
| session_end_time | time | NO | — | End time |
| coach_price_pence | integer | NO | — | Coach's fee in pence |
| commission_rate | numeric(5,4) | NO | — | Commission rate applied at time of booking |
| commission_pence | integer | NO | — | Commission amount in pence |
| parent_total_pence | integer | NO | — | coach_price + commission in pence |
| currency | text | NO | 'GBP' | ISO currency code |
| status | text | NO | 'confirmed' | 'confirmed', 'completed', 'cancelled_parent', 'cancelled_coach', 'no_show' |
| messaging_unlocked | boolean | NO | false | True after booking confirmed |
| promo_code_id | uuid | YES | null | FK → promo_codes(id) — if discount applied |
| discount_applied_pence | integer | YES | null | Actual discount amount in pence |
| cancellation_window_hours | integer | NO | 24 | Snapshot of coach's policy at booking time |
| cancelled_at | timestamptz | YES | null | When cancellation occurred |
| cancelled_by | text | YES | null | 'parent', 'coach', 'admin' |
| cancellation_reason | text | YES | null | Optional reason |
| completed_at | timestamptz | YES | null | When coach marked session complete |
| payout_eligible_at | timestamptz | YES | null | When payout can be processed (completed_at + delay) |
| review_requested_at | timestamptz | YES | null | When review reminder was sent to parent/player |
| group_booking_id | uuid | YES | null | FK → group_bookings(id) if group session |
| notes_for_coach | text | YES | null | Snapshot from child/player profile at time of booking |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Business Rules:**
- booking_reference generated as: CRK-YYYY-NNNN (year + sequential)
- commission_rate = snapshot from platform_config at booking time (never changes after booking)
- payout_eligible_at = completed_at + payout_delay_hours from platform_config
- messaging_unlocked = true immediately on creation (booking is auto-confirmed)
- Only ONE booking can exist for a given coach/date/time slot

**RLS Policies:**
- SELECT: Own bookings (parent/player who booked OR coach being booked)
- INSERT: Authenticated parent or player only
- UPDATE: Limited — only status fields, by relevant party
- DELETE: Not permitted (soft delete only)

**Indexes:**
- coach_profile_id_idx
- booked_by_user_id_idx
- session_date_idx
- status_idx
- payout_eligible_at_idx (for payout cron job)
- (coach_profile_id, session_date, session_start_time) unique constraint

---

### 6.2 group_bookings

Container for group sessions. Multiple bookings link to one group booking.

**Purpose:** Tracks group sessions created by coaches, with capacity management.
**Migration:** 005_create_bookings.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| coach_sport_id | uuid | NO | — | FK → coach_sports(id) |
| sport_id | uuid | NO | — | FK → sports(id) |
| title | text | NO | — | Group session name e.g. 'Saturday Morning Cricket' |
| description | text | YES | null | What the session covers |
| session_date | date | NO | — | Date of group session |
| session_start_time | time | NO | — | Start time |
| session_end_time | time | NO | — | End time |
| max_participants | integer | NO | — | Maximum spots |
| current_participants | integer | NO | 0 | Current confirmed bookings |
| price_per_person_pence | integer | NO | — | Price in pence per participant |
| currency | text | NO | 'GBP' | |
| status | text | NO | 'open' | 'open', 'full', 'cancelled', 'completed' |
| created_by | text | NO | — | 'coach' or 'admin' |
| deleted_at | timestamptz | YES | null | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Public (parents can see open group sessions)
- INSERT: Coach only
- UPDATE: Coach who created it, or admin

---

## 7. Module 6 — Payments & Payouts

### 7.1 payment_intents

Tracks Stripe payment intents for every booking.

**Purpose:** Audit trail and reconciliation for all payment activity.
**Migration:** 006_create_payments.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| stripe_payment_intent_id | text | NO | — | Stripe PI id e.g. 'pi_...' |
| amount_pence | integer | NO | — | Total charged to parent |
| currency | text | NO | 'GBP' | |
| status | text | NO | 'pending' | 'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded' |
| stripe_status | text | YES | null | Raw Stripe status |
| application_fee_pence | integer | NO | — | Platform's commission pence |
| coach_transfer_amount_pence | integer | NO | — | Amount to transfer to coach |
| idempotency_key | text | NO | — | Prevents duplicate charges |
| stripe_error_code | text | YES | null | If payment failed |
| stripe_error_message | text | YES | null | If payment failed |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(stripe_payment_intent_id)
- UNIQUE(idempotency_key)

**RLS Policies:**
- SELECT: Parent who made payment, or coach receiving payment, or admin
- INSERT/UPDATE: Service role only (via API routes)

---

### 7.2 payouts

Tracks payouts to coaches after session completion.

**Purpose:** Full audit trail of every coach payout.
**Migration:** 006_create_payments.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| stripe_transfer_id | text | YES | null | Stripe Transfer id 'tr_...' |
| amount_pence | integer | NO | — | Amount paid to coach in pence |
| currency | text | NO | 'GBP' | |
| status | text | NO | 'pending' | 'pending', 'processing', 'paid', 'failed' |
| scheduled_at | timestamptz | NO | — | When payout is due (booking.payout_eligible_at) |
| processed_at | timestamptz | YES | null | When payout was actually sent |
| failure_reason | text | YES | null | If payout failed |
| retry_count | integer | NO | 0 | Number of retry attempts |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Coach who receives payout, or admin
- INSERT/UPDATE: Service role only

**Indexes:**
- status_idx (partial — where status = 'pending')
- scheduled_at_idx (for payout cron job)
- coach_profile_id_idx

---

### 7.3 refunds

Tracks refunds issued for cancelled bookings.

**Purpose:** Audit trail for all refunds — parent-initiated or coach-initiated.
**Migration:** 006_create_payments.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| payment_intent_id | uuid | NO | — | FK → payment_intents(id) |
| stripe_refund_id | text | YES | null | Stripe Refund id 'rfu_...' |
| amount_pence | integer | NO | — | Amount refunded in pence |
| currency | text | NO | 'GBP' | |
| reason | text | NO | — | 'coach_cancelled', 'parent_cancelled_before_window', 'admin_manual' |
| status | text | NO | 'pending' | 'pending', 'succeeded', 'failed' |
| initiated_by | text | NO | — | 'parent', 'coach', 'admin', 'system' |
| processed_at | timestamptz | YES | null | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Parent who received refund, or admin
- INSERT/UPDATE: Service role only

---

## 8. Module 7 — Training Passport & Reviews

### 8.1 passport_entries

Auto-created for every completed session. The core of the Training Passport.

**Purpose:** Portable coaching history that follows a child or player across coaches.
**Migration:** 007_create_passport.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| child_profile_id | uuid | YES | null | FK → child_profiles(id) — null if player |
| player_profile_id | uuid | YES | null | FK → player_profiles(id) — null if child |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| sport_id | uuid | NO | — | FK → sports(id) |
| session_date | date | NO | — | |
| session_duration_minutes | integer | NO | — | |
| coach_basic_notes | text | YES | null | Available on Free tier |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Parent/player who owns the passport
- SELECT (coach): Only coaches with confirmed booking OR if passport is 'open'
- INSERT: Service role only (auto-created on session completion)
- UPDATE: Not permitted after creation

---

### 8.2 performance_reports

Premium coach feature. Structured reports attached to passport entries.

**Purpose:** Coaches write detailed performance assessments (Premium only).
**Migration:** 007_create_passport.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| passport_entry_id | uuid | NO | — | FK → passport_entries(id) |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| overall_rating | integer | YES | null | 1-5 rating of session performance |
| strengths | text | YES | null | What went well |
| areas_to_improve | text | YES | null | What to work on |
| drills_homework | text | YES | null | Practice tasks before next session |
| coach_notes | text | YES | null | Private coach notes (not shown to parent) |
| is_shared_with_parent | boolean | NO | true | Coach can keep some notes private |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Business Rules:**
- Only coaches on Premium tier can create performance reports
- Check feature flag: 'performance_reports' before allowing creation

**RLS Policies:**
- SELECT: Parent/player who owns the passport (if is_shared_with_parent = true)
- SELECT: Coach who wrote the report
- INSERT: Premium coach only, for their confirmed bookings
- UPDATE: Coach only, within 7 days of session

---

### 8.3 reviews

Reviews left by parents/players after a session.

**Purpose:** Trust building — visible on coach profile and search results.
**Migration:** 007_create_passport.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| reviewer_user_id | uuid | NO | — | FK → user_profiles(id) |
| rating | integer | NO | — | 1-5 stars |
| comment | text | YES | null | Optional written review |
| is_visible | boolean | NO | true | Admin can hide inappropriate reviews |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(booking_id) — one review per booking
- rating CHECK (rating >= 1 AND rating <= 5)

**RLS Policies:**
- SELECT: Public (all visible reviews)
- INSERT: Authenticated parent/player who made the booking
- UPDATE: Not permitted (reviews are permanent)

---

## 9. Module 8 — Subscriptions & Tiers

### 9.1 subscription_tiers

Admin-configurable subscription plans for coaches.

**Purpose:** Fully configurable tier engine — new tiers without code changes.
**Migration:** 008_create_subscriptions.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| name | text | NO | — | 'Free', 'Premium', 'Elite' |
| slug | text | NO | — | 'free', 'premium', 'elite' |
| description | text | YES | null | What this tier includes |
| price_monthly_pence | integer | NO | 0 | Monthly price in pence (0 = free) |
| price_annual_pence | integer | NO | 0 | Annual price in pence (0 = free) |
| currency | text | NO | 'GBP' | |
| stripe_monthly_price_id | text | YES | null | Stripe Price ID for monthly billing |
| stripe_annual_price_id | text | YES | null | Stripe Price ID for annual billing |
| is_active | boolean | NO | true | Admin can deactivate a tier |
| is_default | boolean | NO | false | Assigned to new coaches by default |
| sort_order | integer | NO | 0 | Display order |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Seed Data:**
```sql
INSERT INTO subscription_tiers (name, slug, price_monthly_pence, is_default)
VALUES
  ('Free', 'free', 0, true),
  ('Premium', 'premium', 999, false);
```

**RLS Policies:**
- SELECT: Public
- INSERT/UPDATE/DELETE: Admin only

---

### 9.2 tier_features

Feature toggles and limits per subscription tier. Admin-configurable.

**Purpose:** Define what each tier includes without code changes.
**Migration:** 008_create_subscriptions.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| tier_id | uuid | NO | — | FK → subscription_tiers(id) |
| feature_key | text | NO | — | e.g. 'group_sessions', 'training_passport' |
| is_enabled | boolean | NO | false | Is this feature available on this tier |
| usage_limit | integer | YES | null | null = unlimited, integer = cap per month |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(tier_id, feature_key)

**Feature Keys:**
```
group_sessions          → Group session creation (limit = per month)
training_passport       → Training Passport access
performance_reports     → Writing performance reports
featured_search         → Featured placement in search
advanced_analytics      → Earnings analytics dashboard
tax_dashboard           → HMRC tax filing dashboard
sports_listed           → Number of sports (limit = count)
profile_photos          → Number of profile photos (limit = count)
```

**RLS Policies:**
- SELECT: Public
- INSERT/UPDATE/DELETE: Admin only

---

### 9.3 coach_subscriptions

Tracks a coach's active subscription.

**Purpose:** Which tier is a coach on, and when does it renew.
**Migration:** 008_create_subscriptions.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| tier_id | uuid | NO | — | FK → subscription_tiers(id) |
| billing_period | text | YES | null | 'monthly', 'annual' — null for free |
| stripe_subscription_id | text | YES | null | Stripe Subscription ID |
| stripe_customer_id | text | YES | null | Stripe Customer ID |
| status | text | NO | 'active' | 'active', 'cancelled', 'past_due', 'trialing' |
| current_period_start | timestamptz | YES | null | |
| current_period_end | timestamptz | YES | null | |
| cancelled_at | timestamptz | YES | null | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Coach who owns the subscription, or admin
- INSERT/UPDATE: Service role only

---

### 9.4 tier_usage

Tracks monthly feature usage against limits for free tier coaches.

**Purpose:** Enforce usage limits (e.g. max 2 group sessions/month on Free).
**Migration:** 008_create_subscriptions.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| feature_key | text | NO | — | e.g. 'group_sessions' |
| usage_month | date | NO | — | First day of the month e.g. '2026-03-01' |
| usage_count | integer | NO | 0 | Current usage this month |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(coach_profile_id, feature_key, usage_month)

**RLS Policies:**
- SELECT: Coach only
- INSERT/UPDATE: Service role only

---

## 10. Module 9 — Notifications & Messaging

### 10.1 notification_preferences

User-controlled notification settings.

**Purpose:** Let users manage how and when they receive notifications.
**Migration:** 009_create_notifications.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) |
| email_booking_confirmed | boolean | NO | true | |
| email_booking_cancelled | boolean | NO | true | |
| email_session_reminder | boolean | NO | true | |
| email_payout_processed | boolean | NO | true | |
| email_review_reminder | boolean | NO | true | |
| email_marketing | boolean | NO | false | |
| push_booking_confirmed | boolean | NO | true | |
| push_booking_cancelled | boolean | NO | true | |
| push_session_reminder | boolean | NO | true | |
| push_new_message | boolean | NO | true | |
| push_marketing | boolean | NO | false | |
| sms_enabled | boolean | NO | false | Phase 2 — SMS via Twilio |
| whatsapp_enabled | boolean | NO | false | Phase 3 — WhatsApp via Twilio |
| onesignal_subscription_id | text | YES | null | OneSignal player ID for push notifications |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(user_profile_id)

**RLS Policies:**
- SELECT/UPDATE: Own record only

---

### 10.2 notifications

In-app notification history.

**Purpose:** Activity feed and notification inbox within the app.
**Migration:** 009_create_notifications.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) — recipient |
| type | text | NO | — | 'booking_confirmed', 'booking_cancelled', etc. |
| title | text | NO | — | Short notification title |
| body | text | NO | — | Full notification message |
| data | jsonb | YES | null | Related IDs (booking_id, coach_id, etc.) |
| is_read | boolean | NO | false | |
| read_at | timestamptz | YES | null | |
| created_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Own notifications only
- UPDATE (is_read only): Own notifications only

**Indexes:**
- user_profile_id_idx
- (user_profile_id, is_read) composite index

---


### 10.0 admin_roles

Admin users and their permission levels within the platform.

**Purpose:** Role-based access control for the Super Admin panel.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_profile_id | uuid | NO | — | FK → user_profiles(id) |
| permission_level | text | NO | — | 'full', 'user_management', 'finance', 'content' |
| granted_by_user_id | uuid | YES | null | FK → user_profiles(id) — who granted access |
| is_active | boolean | NO | true | Can deactivate admin access |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(user_profile_id, permission_level)

**RLS Policies:**
- SELECT: Admin only
- INSERT/UPDATE/DELETE: Full access admin only

---

### 10.0b content_pages

Admin-managed static content pages and email templates.

**Purpose:** T&Cs, Privacy Policy, FAQs, email templates — all admin editable.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| key | text | NO | — | 'terms', 'privacy', 'faq', 'email_booking_confirmed' |
| type | text | NO | — | 'page', 'email_template', 'announcement' |
| title | text | NO | — | Display title |
| content | text | NO | — | HTML or markdown content |
| is_published | boolean | NO | false | |
| published_at | timestamptz | YES | null | |
| published_by_user_id | uuid | YES | null | FK → user_profiles(id) |
| version | integer | NO | 1 | Increments on each update |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(key)

**RLS Policies:**
- SELECT: Public for published pages, Admin for all
- INSERT/UPDATE/DELETE: Admin only

---

### 10.0c session_notes

Basic session notes written by coaches after each session. Available on Free tier.

**Purpose:** Free tier equivalent of performance reports — simple text notes.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| notes | text | NO | — | Plain text session notes |
| is_shared_with_parent | boolean | NO | true | |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(booking_id) — one note per booking

**Business Rules:**
- Available on Free tier (unlike performance_reports which is Premium)
- Cannot be edited after 48 hours

**RLS Policies:**
- SELECT: Coach who wrote it + parent/player if is_shared_with_parent = true
- INSERT: Authenticated coach for their confirmed bookings
- UPDATE: Coach only, within 48 hours of session

---

## 11. Module 10 — Admin & Governance

### 11.1 dbs_verifications

Tracks DBS certificate submissions and verification status.

**Purpose:** Coach trust badge verification workflow.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| coach_profile_id | uuid | NO | — | FK → coach_profiles(id) |
| payment_intent_id | uuid | YES | null | FK → payment_intents(id) — £29.99 fee |
| certificate_number | text | YES | null | DBS certificate number submitted |
| certificate_url | text | YES | null | Supabase Storage URL of uploaded doc |
| submitted_at | timestamptz | YES | null | When coach submitted |
| reviewed_at | timestamptz | YES | null | When admin reviewed |
| reviewed_by_admin_id | uuid | YES | null | FK → user_profiles(id) |
| status | text | NO | 'pending_payment' | 'pending_payment', 'pending_review', 'approved', 'rejected' |
| rejection_reason | text | YES | null | If rejected |
| expires_at | timestamptz | YES | null | Annual renewal date |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: Coach who submitted, or admin
- INSERT: Authenticated coach only
- UPDATE: Admin only

---

### 11.2 disputes

Tracks disputes between parents and coaches.

**Purpose:** Admin resolution workflow for booking conflicts.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| booking_id | uuid | NO | — | FK → bookings(id) |
| raised_by_user_id | uuid | NO | — | FK → user_profiles(id) |
| dispute_type | text | NO | — | 'no_show_coach', 'no_show_parent', 'quality', 'payment', 'other' |
| description | text | NO | — | What happened |
| status | text | NO | 'open' | 'open', 'under_review', 'resolved', 'closed' |
| resolution | text | YES | null | How it was resolved |
| resolved_by_admin_id | uuid | YES | null | FK → user_profiles(id) |
| resolved_at | timestamptz | YES | null | |
| refund_issued | boolean | NO | false | Was a manual refund issued |
| refund_amount_pence | integer | YES | null | If refund was issued |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**RLS Policies:**
- SELECT: User who raised it, or admin
- INSERT: Authenticated users only
- UPDATE: Admin only

---

### 11.3 promo_codes

Admin-created promotional discount codes.

**Purpose:** Marketing campaigns, early adopter incentives.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| code | text | NO | — | e.g. 'LAUNCH50' — uppercase |
| discount_type | text | NO | — | 'percentage', 'fixed_amount' |
| discount_value | integer | NO | — | % (e.g. 50 = 50%) or pence (e.g. 500 = £5) |
| currency | text | YES | 'GBP' | For fixed_amount discounts |
| max_uses | integer | YES | null | null = unlimited |
| current_uses | integer | NO | 0 | Current redemption count |
| min_booking_value_pence | integer | YES | null | Minimum booking value to apply |
| sport_id | uuid | YES | null | FK → sports(id) — null = all sports |
| valid_from | timestamptz | NO | — | |
| valid_until | timestamptz | YES | null | null = no expiry |
| is_active | boolean | NO | true | Admin can disable |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | |

**Constraints:**
- UNIQUE(code)

**RLS Policies:**
- SELECT: Admin only (full details)
- SELECT (limited): Authenticated users can validate a code they enter
- INSERT/UPDATE/DELETE: Admin only

---

### 11.4 audit_logs

Immutable log of all admin actions.

**Purpose:** Compliance, accountability, debugging.
**Migration:** 010_create_admin.sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| admin_user_id | uuid | NO | — | FK → user_profiles(id) |
| action | text | NO | — | e.g. 'approve_dbs', 'issue_refund', 'suspend_account' |
| entity_type | text | NO | — | e.g. 'coach_profile', 'booking', 'user' |
| entity_id | uuid | NO | — | ID of the affected record |
| before_state | jsonb | YES | null | Snapshot before change |
| after_state | jsonb | YES | null | Snapshot after change |
| notes | text | YES | null | Optional admin notes |
| ip_address | text | YES | null | Admin's IP address |
| created_at | timestamptz | NO | now() | Immutable — never updated |

**RLS Policies:**
- SELECT: Admin only
- INSERT: Service role only (via API routes)
- UPDATE/DELETE: Not permitted — immutable log

---

## 12. Entity Relationships

```
auth.users (Supabase)
  └── user_profiles (1:1)
        ├── user_roles (1:many)
        ├── parent_profiles (1:1 if parent role)
        │     └── child_profiles (1:many)
        │           ├── passport_entries (1:many)
        │           └── bookings (1:many via child_profile_id)
        ├── player_profiles (1:1 if player role)
        │     ├── passport_entries (1:many)
        │     └── bookings (1:many via player_profile_id)
        ├── coach_profiles (1:1 if coach role)
        │     ├── coach_sports (1:many)
        │     ├── coach_qualifications (1:many)
        │     ├── availability_templates (1:many)
        │     ├── blocked_dates (1:many)
        │     ├── coach_subscriptions (1:1)
        │     ├── dbs_verifications (1:many)
        │     └── bookings (1:many via coach_profile_id)
        └── notification_preferences (1:1)

bookings
  ├── payment_intents (1:1)
  ├── payouts (1:1)
  ├── refunds (1:many — full + partial)
  ├── passport_entries (1:1)
  ├── reviews (1:1)
  └── promo_codes (many:1 — optional, via promo_code_id)

passport_entries
  └── performance_reports (1:1 — Premium coaches only)

subscription_tiers
  ├── tier_features (1:many)
  └── coach_subscriptions (1:many)

sports
  ├── coach_sports (1:many)
  ├── bookings (1:many)
  └── group_bookings (1:many)

countries
  └── (referenced by user_profiles.country_code)

platform_config (singleton)
feature_flags (one row per flag)
```

---

## Migration Order

Migrations must run in this exact order:

```
001_create_user_profiles.sql          → user_profiles, user_roles
002_create_profiles.sql               → parent_profiles, child_profiles,
                                        player_profiles, coach_profiles,
                                        coach_sports, coach_qualifications,
                                        coach_photos
003_create_platform_config.sql        → sports, qualification_types,
                                        countries, platform_config,
                                        feature_flags
004_create_availability.sql           → availability_templates, blocked_dates
005_create_bookings.sql               → bookings, group_bookings
006_create_payments.sql               → payment_intents, payouts, refunds
007_create_passport.sql               → passport_entries, performance_reports,
                                        reviews
008_create_subscriptions.sql          → subscription_tiers, tier_features,
                                        coach_subscriptions, tier_usage
009_create_notifications.sql          → notification_preferences, notifications
010_create_admin.sql                  → dbs_verifications, disputes,
                                        promo_codes, audit_logs
```

---

*Crikly Database Schema v1.1 — March 2026*
*Update this file in the same commit as every migration.*
*Never edit existing migration files — always create new ones.*

---

## 13. PRD Traceability Matrix

Every feature in the PRD must map to a table or column here.
If a PRD requirement has no database entry — it is a gap.
This matrix is reviewed before any migration is written.

### Section 4.1 — Child Profile

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Full name | child_profiles | full_name |
| Date of birth | child_profiles | date_of_birth |
| Sport / Activity (multi-select) | child_profiles | sport_ids |
| Skill level | child_profiles | skill_level |
| Medical notes | child_profiles | medical_notes |
| Notes for coach | child_profiles | notes_for_coach |
| Child photo | child_profiles | photo_url |
| Unlimited profiles per parent | child_profiles | parent_profile_id (1:many) |
| Child → Player transition | child_profiles | transition_status, transitioned_player_id, transition_initiated_at |

### Section 4.2 — Training Passport

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Basic session history | passport_entries | booking_id, session_date, sport_id |
| Structured performance reports (Premium) | performance_reports | all columns |
| Skills progression tracking (Premium) | performance_reports | overall_rating, strengths, areas_to_improve |
| Coach adds notes to passport (Premium) | performance_reports | coach_notes |
| Full coaching history across all coaches | passport_entries | coach_profile_id (multiple rows) |
| Privacy: Open | child_profiles / player_profiles | passport_privacy = 'open' |
| Privacy: Booking only | child_profiles / player_profiles | passport_privacy = 'booking_only' |
| Privacy: Private | child_profiles / player_profiles | passport_privacy = 'private' |

### Section 4.3 — Search & Discovery

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Filter: Sport / Activity | sports | id, name, slug |
| Filter: Location + radius | coach_profiles | location_lat, location_lng |
| Filter: Date & Time | availability_templates | day_of_week, start_time, end_time |
| Filter: Session type | coach_sports | session_types |
| Filter: Skill level | coach_sports | skill_levels |
| Filter: Price range | coach_sports | price_individual_pence, price_group_pence |
| Filter: Coach gender | coach_profiles | gender |
| Filter: Minimum rating | coach_profiles | rating_avg |
| Filter: DBS verified only | coach_profiles | dbs_status |
| Featured coaches above organic | coach_profiles | is_featured |
| Sort: Nearest first | coach_profiles | location_lat, location_lng |
| Sort: Highest rated | coach_profiles | rating_avg |
| Sort: Price low to high | coach_sports | price_individual_pence |
| Sort: Most available | availability_templates | (calculated from template) |

### Section 4.4 — Parent Features

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Sign up / Log in | user_profiles | auth_user_id, auth_provider |
| Terms acceptance | user_profiles | terms_accepted_at |
| Create & manage child profiles | child_profiles | all columns |
| Search coaches | coach_profiles, coach_sports, availability_templates | — |
| Instant booking | bookings | status = 'confirmed' (default) |
| Secure payment via Stripe | payment_intents | stripe_payment_intent_id |
| Booking confirmation | bookings | status, created_at |
| Booking history | bookings | booked_by_user_id |
| Cancel booking | bookings | cancelled_at, cancelled_by |
| Refund processing | refunds | all columns |
| Message coach (post-booking) | bookings | messaging_unlocked |
| Leave review & rating | reviews | all columns |
| Apply promo codes | promo_codes, bookings | promo_code_id, discount_applied_pence |
| Child Training Passport — view | passport_entries | child_profile_id |
| Training Passport privacy controls | child_profiles | passport_privacy |
| Child to Player transition | child_profiles | transition_status, transitioned_player_id |
| Notification preferences | notification_preferences | all email/push columns |
| Parent profile photo | user_profiles | avatar_url |

### Section 4.5 — Player Features

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Sign up / Log in (16+ age gate) | player_profiles | date_of_birth (enforced in API) |
| Create & manage own profile | player_profiles | all columns |
| Player profile photo | user_profiles | avatar_url |
| Own Training Passport — view | passport_entries | player_profile_id |
| Training Passport privacy controls | player_profiles | passport_privacy |
| Search & filter coaches | coach_profiles, coach_sports | — |
| Instant booking | bookings | player_profile_id |
| Secure payment | payment_intents | — |
| Booking history | bookings | booked_by_user_id |
| Cancel booking | bookings | cancelled_at, cancelled_by |
| Message coach | bookings | messaging_unlocked |
| Leave review | reviews | reviewer_user_id |
| Apply promo codes | promo_codes, bookings | promo_code_id |
| Notification preferences | notification_preferences | — |

### Section 4.6 — Coach Features (Free)

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Sign up / Log in | user_profiles | auth_user_id |
| Create & manage profile | coach_profiles | bio, years_experience, etc. |
| Coach photos | coach_photos | photo_url, is_primary |
| List multiple sports | coach_sports | sport_id (multiple rows) |
| Set pricing per sport & session type | coach_sports | price_individual_pence, price_group_pence |
| Weekly availability template | availability_templates | day_of_week, start_time, end_time |
| Multiple time blocks per day | availability_templates | multiple rows per day_of_week |
| Block out specific dates | blocked_dates | blocked_date |
| Define cancellation policy window | coach_profiles | cancellation_window_hours |
| Min / Max advance booking window | coach_profiles | min_advance_hours, max_advance_days |
| Auto-confirmed bookings | bookings | status = 'confirmed' |
| View booking details | bookings | all columns |
| View child medical notes | child_profiles | medical_notes (via RLS) |
| Cancel booking → refund | bookings + refunds | cancelled_by = 'coach' |
| Message parent/player | bookings | messaging_unlocked |
| Basic session notes | session_notes | notes, is_shared_with_parent |
| Receive reviews | reviews | coach_profile_id |
| Rating visible to parents | coach_profiles | rating_avg, rating_count |
| Stripe Connect payouts | coach_profiles | stripe_account_id, stripe_onboarding_complete |
| Payout 48hrs after session | payouts | scheduled_at, bookings.payout_eligible_at |
| DBS verified badge | dbs_verifications | status, coach_profiles.dbs_status |
| Notification preferences | notification_preferences | — |

### Section 4.7 — Coach Features (Premium)

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Featured placement in search | coach_profiles | is_featured |
| Structured performance reports | performance_reports | all columns |
| Training Passport — view & contribute | passport_entries + performance_reports | — |
| Skills progression tracking | performance_reports | overall_rating, strengths, areas_to_improve |
| Advanced analytics & earnings | payouts + bookings | (calculated) |
| Financial dashboard for tax filing | payouts + payment_intents | (calculated by financial year) |
| Payout history & commission breakdown | payouts + payment_intents | commission_pence |

### Section 4.8 — Super Admin Features

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Create admins + permission levels | admin_roles | permission_level |
| Sports config | sports | name, slug, is_active, sort_order |
| Qualification types | qualification_types | sport_id, name, issuing_body |
| Regions & currency | countries | currency_code, default_commission_rate |
| Business rules | platform_config | all columns |
| Subscription engine | subscription_tiers + tier_features | all columns |
| Special tiers (trial, partner, etc.) | subscription_tiers | is_default, sort_order |
| User management | user_profiles + user_roles | — |
| Suspend / ban accounts | coach_profiles | is_suspended, is_flagged |
| GDPR right to deletion | user_profiles | deletion_requested_at |
| Approve / reject DBS | dbs_verifications | status, reviewed_by_admin_id |
| Dispute management | disputes | all columns |
| Promo codes | promo_codes | all columns |
| Featured coaches manually | coach_profiles | is_featured |
| Feature flags | feature_flags | key, enabled |
| Content management (pages/templates) | content_pages | key, type, content |
| Audit log | audit_logs | all columns |

### Section 5 — Business Model

| PRD Requirement | Table | Column(s) |
|---|---|---|
| 10% booking commission | bookings | commission_rate, commission_pence |
| Commission added ON TOP | bookings | parent_total_pence = coach_price + commission |
| Premium subscription monthly | subscription_tiers | price_monthly_pence |
| Premium subscription annual | subscription_tiers | price_annual_pence |
| DBS verification fee £29.99 | platform_config | dbs_verification_fee_pence |
| Payout 48hrs after session | platform_config | default_payout_delay_hours |
| Parent cancels before window → refund | refunds | reason = 'parent_cancelled_before_window' |
| Parent cancels within window → no refund | bookings | cancellation_window_hours |
| Coach cancels → full refund | refunds | reason = 'coach_cancelled' |
| Coach cancels repeatedly → flagged | coach_profiles | is_flagged |
| Cancellation window 24hrs default | coach_profiles | cancellation_window_hours |
| Configurable payout timing | platform_config | default_payout_delay_hours |
| Multi-currency from day 1 | countries | currency_code |
| Currency on every price | bookings, coach_sports, etc. | currency column |

### Section 6 — Notifications

| PRD Requirement | Table | Column(s) |
|---|---|---|
| Booking confirmed (email+push+in-app) | notifications | type = 'booking_confirmed' |
| Session reminder (email+push+in-app) | notifications | type = 'session_reminder' |
| Refund processed | notifications | type = 'refund_processed' |
| Performance report available | notifications | type = 'performance_report' |
| Review reminder | notifications + bookings | review_requested_at |
| Child transition notification | notifications | type = 'child_transition' |
| Payout processed | notifications | type = 'payout_processed' |
| Payout failed | notifications | type = 'payout_failed' |
| DBS verification approved | notifications | type = 'dbs_approved' |
| Usage limit approaching | notifications | type = 'usage_limit' |
| OneSignal push token | notification_preferences | onesignal_subscription_id |
| Email preferences | notification_preferences | email_* columns |
| Push preferences | notification_preferences | push_* columns |
| SMS (Phase 2) | user_profiles | phone |
| WhatsApp (Phase 3) | user_profiles | whatsapp_number |

### Section 8.4 — Compliance

| PRD Requirement | Table | Column(s) |
|---|---|---|
| GDPR right to deletion | user_profiles | deletion_requested_at |
| Terms & Conditions acceptance | user_profiles | terms_accepted_at |
| Privacy Policy (content) | content_pages | key = 'privacy' |
| Cookie consent (content) | content_pages | key = 'cookie_policy' |
| Child data protection (COPPA) | child_profiles | RLS policies + parent_profile_id |
| PCI DSS | payment_intents | No card data stored (Stripe handles) |
| Audit log | audit_logs | all admin actions |

---

*This matrix must be reviewed and signed off before any migration file is written.*
*Last reviewed: March 2026*
*Reviewed by: Lasith Jayarathne*

