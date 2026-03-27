# Crikly — Security & Compliance

**Version:** 1.0
**Last Updated:** March 2026

Read this file before touching any payment logic, auth, or child data.
Security changes require review and approval from Lasith before implementation.

---

## Non-Negotiable Security Rules

```
1. NEVER touch card details, CVV, or full card numbers — Stripe handles all card data
2. NEVER bypass Row Level Security without documented justification
3. NEVER expose SUPABASE_SERVICE_ROLE_KEY to browser code
4. NEVER commit .env.local or any secrets to git
5. NEVER log sensitive data — no card numbers, no personal data in logs
6. ALWAYS verify Stripe webhook signatures before processing
7. ALWAYS use idempotency keys on Stripe payment intents
8. ALWAYS enforce age gate for Player registration (16+)
9. ALWAYS validate inputs server-side — never trust client
10. ALWAYS use RLS-respecting Supabase client in browser contexts
```

---

## Authentication

| Requirement | Implementation |
|---|---|
| Provider | Supabase Auth |
| Methods | Email/password + Google + Apple |
| Session tokens | Auto-expire after inactivity |
| Password reset | Supabase built-in flow |
| Social login | OAuth via Supabase |

---

## Role-Based Access Control

Strict separation between all roles. Enforced at database level via RLS.

| Role | Access |
|---|---|
| Parent | Own bookings, own child profiles, public coach profiles |
| Player | Own bookings, own profile, public coach profiles |
| Coach | Own profile, own bookings, child/player profiles of confirmed bookings only |
| Admin | Everything — based on permission level |

### Admin Permission Levels

| Level | What They Can Do |
|---|---|
| Full Access | Everything |
| User Management | View users, suspend, approve DBS |
| Finance | View revenue, issue refunds, manage payouts |
| Content | Manage content pages, email templates, announcements |

---

## Child Data Protection (GDPR + COPPA)

Child profiles contain sensitive data. These rules are non-negotiable.

```
Child profiles:
  → Only accessible by their parent account
  → Never returned in public API responses
  → Medical notes only accessible by coaches with confirmed bookings
  → RLS policy: parent_id = auth.uid()

On Child → Player transition (age 16):
  → Parent loses access to data
  → Player owns their own data
  → deletion_requested_at must be honoured within 30 days

Data minimisation:
  → Only collect what is needed
  → Medical notes: coaches see only when booking confirmed
  → No child photos used in public-facing marketing without explicit consent
```

---

## Payment Security (PCI DSS)

Stripe handles all card data. Crikly never touches it.

```
NEVER:
→ Build custom card input forms
→ Log card details anywhere
→ Store card numbers, CVV, expiry
→ Handle raw card data in any form

ALWAYS:
→ Use Stripe Checkout (hosted by Stripe)
→ Verify webhook signatures on every webhook event
→ Use idempotency keys on payment intents
→ Use Stripe Connect for all coach payouts
→ Test with Stripe test mode keys only (sk_test_...)
→ Never switch to live keys without Lasith approval
```

### Webhook Security

```typescript
// ALWAYS verify before processing — no exceptions
const event = stripe.webhooks.constructEvent(
  body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET!
)
```

---

## Data Encryption

| Data | Encryption |
|---|---|
| Data in transit | HTTPS/TLS — enforced by Vercel |
| Data at rest | Encrypted by Supabase (PostgreSQL) |
| File storage | Encrypted by Supabase Storage |
| Secrets | Environment variables — never in code |

---

## GDPR Compliance

| Requirement | Implementation |
|---|---|
| Right to access | User can view all their data via account settings |
| Right to deletion | `user_profiles.deletion_requested_at` — processed within 30 days |
| Data minimisation | Only necessary data collected |
| Consent | `user_profiles.terms_accepted_at` — required before any use |
| Data portability | Users can download their data (Phase 2) |
| Child data | Enhanced controls — parent controls all child data until age 16 |
| Data location | UK (Supabase London region) |

---

## Row Level Security Patterns

Every table has RLS enabled. These are the standard patterns:

### User owns their own data
```sql
USING (auth.uid() = user_profile_id)
```

### Coach can see confirmed booking's child/player data
```sql
USING (
  EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.coach_profile_id = [coach_id]
    AND b.child_profile_id = child_profiles.id
    AND b.status = 'confirmed'
  )
)
```

### Admin full access
```sql
USING (
  EXISTS (
    SELECT 1 FROM admin_roles ar
    JOIN user_profiles up ON ar.user_profile_id = up.id
    WHERE up.auth_user_id = auth.uid()
    AND ar.is_active = true
  )
)
```

---

## Audit Log

Every admin action is logged in `audit_logs`. This is immutable.

```
Log entries are INSERT only — never UPDATE or DELETE
Every admin action creates a row:
  → admin_user_id
  → action (e.g. 'approve_dbs', 'issue_refund')
  → entity_type + entity_id
  → before_state + after_state (JSON snapshots)
  → ip_address
  → created_at
```

---

## Security Gate — Before Any Payment or Child Data Feature

```
□ Read this entire document
□ Stripe webhook signature verified in every webhook handler
□ Idempotency keys on all Stripe payment intents
□ No card data logged anywhere
□ Child data access limited to confirmed coaches only
□ RLS policies explicitly tested for each new table
□ No SUPABASE_SERVICE_ROLE_KEY in client-side code
□ All user inputs validated server-side
□ Admin action logged in audit_logs
```

---

## Red Flags — Stop and Get Approval First

Stop implementation and bring to Lasith/Claude if:

```
→ Any change to payment processing logic
→ Any change to cancellation or refund flow
→ Any change to child data access patterns
→ Any change to RLS policies
→ Any change to authentication or session handling
→ Stripe webhook handler changes
→ Adding new external services that handle user data
→ Any GDPR-related data handling changes
```

---

*Crikly Security & Compliance v1.0 — March 2026*
*Read this before every payment or child data feature.*
*Security changes require Lasith approval before implementation.*
