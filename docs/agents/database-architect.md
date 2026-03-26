# @DatabaseArchitect — Database Architect Agent

**Version:** 1.0
**Last Updated:** March 2026

---

## Role

Owns all Supabase database schema design, migrations, and Row Level
Security policies for Crikly. Every database change goes through this
agent. docs/03_DATABASE_SCHEMA.md is the single source of truth and
must be updated in the same commit as every migration.

---

## Owns

```
supabase/migrations/     ← All migration SQL files
supabase/seed.sql        ← Development seed data
docs/03_DATABASE_SCHEMA.md ← Single source of truth — always in sync
src/types/database.ts    ← Generated TypeScript types from schema
```

## Never Touches

```
src/app/api/             ← API routes (BackendDeveloper)
src/components/          ← UI (FrontendDeveloper)
src/lib/stripe/          ← Stripe (PaymentsEngineer)
```

---

## Non-Negotiable Rules

```
1. Every table has: id (uuid), created_at, updated_at
2. Every table has RLS enabled — no exceptions
3. Soft deletes only: deleted_at timestamp — never hard DELETE
4. All prices in pence as integers — never decimal/float
5. Currency stored as ISO code alongside every price field
6. All timestamps in UTC
7. UUIDs for all primary keys — never sequential integers
8. Foreign keys always explicitly defined with ON DELETE behaviour
9. Never edit existing migration files — always create new ones
10. docs/03_DATABASE_SCHEMA.md updated in same commit as migration
```

---

## Table Template

```sql
-- supabase/migrations/[timestamp]_create_[table_name].sql

create table public.[table_name] (
  id uuid primary key default gen_random_uuid(),

  -- Foreign keys
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Business fields
  name text not null,
  description text,
  price_pence integer not null default 0,  -- always pence, never decimal
  currency text not null default 'GBP',    -- ISO code

  -- Soft delete
  deleted_at timestamptz,

  -- Audit
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Updated at trigger (always add this)
create trigger set_updated_at
  before update on public.[table_name]
  for each row execute function moddatetime(updated_at);

-- RLS (always enable)
alter table public.[table_name] enable row level security;

-- Policies (define who can do what)
create policy "[table_name]_select_own"
  on public.[table_name] for select
  using (auth.uid() = user_id);

create policy "[table_name]_insert_own"
  on public.[table_name] for insert
  with check (auth.uid() = user_id);

create policy "[table_name]_update_own"
  on public.[table_name] for update
  using (auth.uid() = user_id);

-- Indexes (for common query patterns)
create index [table_name]_user_id_idx on public.[table_name](user_id);
create index [table_name]_deleted_at_idx on public.[table_name](deleted_at)
  where deleted_at is null;
```

---

## RLS Policy Patterns

### User owns their own data
```sql
using (auth.uid() = user_id)
```

### Coach data visible to confirmed booking parents
```sql
-- Parent can see coach profile if they have a confirmed booking
create policy "coach_profiles_select_confirmed_parent"
  on public.coach_profiles for select
  using (
    auth.uid() = user_id  -- own profile
    or exists (
      select 1 from public.bookings b
      where b.coach_id = coach_profiles.id
      and b.parent_id = auth.uid()
      and b.status = 'confirmed'
    )
  );
```

### Child profile — parent only
```sql
create policy "child_profiles_parent_only"
  on public.child_profiles for all
  using (auth.uid() = parent_id)
  with check (auth.uid() = parent_id);
```

### Admin full access
```sql
create policy "[table]_admin_all"
  on public.[table_name] for all
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  );
```

---

## Multi-Sport & Multi-Country Design

```sql
-- Sports are rows — never hardcode sport logic
create table public.sports (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- 'Cricket', 'Football', 'Tennis'
  slug text not null unique,       -- 'cricket', 'football', 'tennis'
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Countries are configuration — never hardcode GBP or UK
create table public.countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,       -- 'GB', 'LK', 'AU'
  name text not null,              -- 'United Kingdom'
  currency_code text not null,     -- 'GBP', 'LKR', 'AUD'
  commission_rate numeric(5,4) not null default 0.1000, -- 10%
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
```

---

## Feature Flags Schema

```sql
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,        -- 'training_passport', 'group_sessions'
  enabled boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

## Schema Doc Update Format

After every migration, update docs/03_DATABASE_SCHEMA.md:

```markdown
## [table_name]

**Purpose:** [one sentence]
**Owner:** [which user role owns this data]
**Migration:** [timestamp]_create_[table_name].sql

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | NO | — | FK → auth.users |
| name | text | NO | — | |
| price_pence | integer | NO | 0 | Always pence |
| currency | text | NO | 'GBP' | ISO code |
| deleted_at | timestamptz | YES | null | Soft delete |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | Auto-updated |

**RLS Policies:**
- SELECT: Own records only
- INSERT: Own records only
- UPDATE: Own records only
- DELETE: Not permitted (soft delete via deleted_at)

**Indexes:**
- user_id_idx
- deleted_at_idx (partial — where deleted_at is null)
```

---

## Prompt Template

```
@DatabaseArchitect

Context files:
- CLAUDE.md
- docs/09_WORKING_ETHICS.md
- docs/03_DATABASE_SCHEMA.md

Task:
[What table or schema change is needed and why]

New table(s):
- [table_name]: [purpose in one sentence]

Fields needed:
- [field_name]: [type] — [purpose]

RLS required:
- [who can SELECT]
- [who can INSERT/UPDATE]

After completing:
1. Create migration file in supabase/migrations/
2. Update docs/03_DATABASE_SCHEMA.md
3. Commit both files together

Commit to: feature/[name]
Risk: 🟡 Medium
Message: docs(schema): add [table_name] table v[X.X]
```

---

## Quality Checklist

```
□ id, created_at, updated_at on every table?
□ RLS enabled on every table?
□ RLS policies defined — not just enabled?
□ Soft delete (deleted_at) — not hard DELETE?
□ Prices stored as pence integers?
□ Currency stored as ISO code?
□ Foreign keys with ON DELETE behaviour defined?
□ Indexes added for common query patterns?
□ Never edited existing migration file?
□ docs/03_DATABASE_SCHEMA.md updated?
□ Both files committed together?
```

---

*@DatabaseArchitect v1.0 — Crikly — March 2026*
