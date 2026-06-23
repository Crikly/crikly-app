// TEST-E2E-01: idempotent seed script for the Playwright E2E test coach.
//
// Provisions (or upserts) every row the E2E suite assumes exists:
//   1. auth.users          — Test Coach login credentials
//   2. user_profiles       — app-side user record
//   3. user_roles          — role='coach'
//   4. coach_profiles      — coach record (is_profile_live = true; Fix-E2E-01b —
//                            satisfies the CoachLayoutClient onboarding gate so
//                            the suite can reach /coach/* surfaces. P5 manages its
//                            own is_profile_live state independently.)
//   5. coach_sports        — Cricket
//   6. availability_templates × 3 — Mon/Wed/Sat 09:00–11:00 recurring
//
// Re-running is safe. Every write uses `.upsert()` with the canonical UNIQUE
// constraint from the relevant migration:
//   - user_profiles      → UNIQUE INDEX on (auth_user_id)         [001]
//   - user_roles         → UNIQUE (user_profile_id, role)         [001]
//   - coach_profiles     → UNIQUE INDEX on (user_profile_id)      [002]
//   - coach_sports       → UNIQUE (coach_profile_id, sport_id)    [002]
//   - availability_templates → UNIQUE (coach_profile_id, day_of_week, start_time)  [migration 014, Fix-16e]
//
// Run:
//   npx tsx e2e/fixtures/seed.ts
//
// Required env (loaded from process.env first, then from .env.local as a fallback):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   TEST_COACH_EMAIL
//   TEST_COACH_PASSWORD
//
// Production-URL guard: prints the resolved host. Currently a no-op because the
// hosted dev project is the only Supabase project. Future-proofing only.

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── Env loader ──────────────────────────────────────────────────────────────

function loadDotEnvLocal(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) return // already in env (e.g. CI)
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadDotEnvLocal()

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) {
    console.error(`[seed] missing required env: ${key}`)
    process.exit(1)
  }
  return v
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const TEST_COACH_EMAIL = requireEnv('TEST_COACH_EMAIL')
const TEST_COACH_PASSWORD = requireEnv('TEST_COACH_PASSWORD')

// ── Production-URL guard (future-proofing no-op) ────────────────────────────

const host = new URL(SUPABASE_URL).host
console.info(`[seed] target Supabase host: ${host}`)
// When a separate production project lands, add its ref here to abort:
//   const PRODUCTION_PROJECT_REFS = ['<future-prod-ref>']
//   if (PRODUCTION_PROJECT_REFS.some((ref) => host.startsWith(ref))) { process.exit(2) }

// ── Admin client ────────────────────────────────────────────────────────────

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Helpers ─────────────────────────────────────────────────────────────────

async function findAuthUserByEmail(email: string): Promise<string | null> {
  // listUsers is paginated; iterate until we find the email or exhaust pages.
  // The dev DB is small; in practice the user is on page 1.
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) return match.id
    if (data.users.length < 100) return null
    page += 1
    if (page > 50) return null // safety stop
  }
}

// ── Seed ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 0. Resolve Cricket sport_id (read-only).
  const { data: sportRow, error: sportError } = await supabase
    .from('sports')
    .select('id')
    .eq('name', 'Cricket')
    .single()
  if (sportError || !sportRow) {
    console.error('[seed] could not find Cricket in `sports` table:', sportError)
    process.exit(1)
  }
  const cricketSportId = sportRow.id as string
  console.info('[seed] step 0/6: resolved Cricket sport_id')

  // 1. auth.users — find or create.
  let authUserId = await findAuthUserByEmail(TEST_COACH_EMAIL)
  if (authUserId) {
    console.info('[seed] step 1/6: auth.users present (no change)')
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: TEST_COACH_EMAIL,
      password: TEST_COACH_PASSWORD,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      console.error('[seed] failed to create auth user:', createErr)
      process.exit(1)
    }
    authUserId = created.user.id
    console.info('[seed] step 1/6: auth.users created')
  }

  // 2. user_profiles — upsert on auth_user_id.
  //    Schema (migration 001) has NO email column — email lives on auth.users only.
  //    active_role='coach' is critical so post-login redirects land on /coach/* —
  //    the default 'parent' would send the test user to the role-switcher /dashboard.
  //    AUTH-FIX-01: terms_accepted_at must also be set — coach/layout.tsx
  //    now redirects to /onboarding/terms when this column is NULL.
  const now = new Date().toISOString()
  const { data: upRow, error: upErr } = await supabase
    .from('user_profiles')
    .upsert(
      {
        auth_user_id: authUserId,
        full_name: 'Test Coach',
        active_role: 'coach',
        terms_accepted_at: now,
        updated_at: now,
      },
      { onConflict: 'auth_user_id' },
    )
    .select('id')
    .single()
  if (upErr || !upRow) {
    console.error('[seed] user_profiles upsert failed:', upErr)
    process.exit(1)
  }
  const userProfileId = upRow.id as string
  console.info('[seed] step 2/6: user_profiles upserted')

  // 3. user_roles — upsert on (user_profile_id, role).
  const { error: roleErr } = await supabase
    .from('user_roles')
    .upsert(
      { user_profile_id: userProfileId, role: 'coach' },
      { onConflict: 'user_profile_id,role' },
    )
  if (roleErr) {
    console.error('[seed] user_roles upsert failed:', roleErr)
    process.exit(1)
  }
  console.info('[seed] step 3/6: user_roles upserted (coach)')

  // 4. coach_profiles — upsert on user_profile_id. Seed with is_profile_live=true
  //    (Fix-E2E-01b): the client-side onboarding gate in CoachLayoutClient.tsx
  //    redirects any coach with is_profile_live=false to /coach/onboarding/profile
  //    (it treats "not live" as "onboarding incomplete"). A draft seed therefore
  //    bounced the test coach off every /coach/* target page (P1.T1.2, P3.T3.3,
  //    P4.T4.2 failed via redirect). Seeding live satisfies the gate so the suite
  //    can reach the coach surfaces.
  //
  //    NOTE: P5 (Go Live) drives its own is_profile_live state via beforeAll/
  //    afterAll in p5-profile-golive.spec.ts and does NOT rely on this seed value.
  //    T5.2/T5.3 are skipped (Fix-E2E-01b) because the go-live button only renders
  //    in draft state, which the gate makes unreachable on /coach/profile/edit —
  //    Fix-E2E-02 tracks the gate-logic review.
  const { data: cpRow, error: cpErr } = await supabase
    .from('coach_profiles')
    .upsert(
      {
        user_profile_id: userProfileId,
        is_profile_live: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_profile_id' },
    )
    .select('id')
    .single()
  if (cpErr || !cpRow) {
    console.error('[seed] coach_profiles upsert failed:', cpErr)
    process.exit(1)
  }
  const coachProfileId = cpRow.id as string
  console.info('[seed] step 4/6: coach_profiles upserted (is_profile_live=true)')

  // 5. coach_sports — upsert on (coach_profile_id, sport_id).
  //    session_types + skill_levels are NOT NULL text[] (migration 002 lines 111-112).
  //    Sensible minimal values; tests don't exercise the values themselves.
  const { error: csErr } = await supabase
    .from('coach_sports')
    .upsert(
      {
        coach_profile_id: coachProfileId,
        sport_id: cricketSportId,
        session_types: ['individual'],
        skill_levels: ['beginner'],
      },
      { onConflict: 'coach_profile_id,sport_id' },
    )
  if (csErr) {
    console.error('[seed] coach_sports upsert failed:', csErr)
    process.exit(1)
  }
  console.info('[seed] step 5/6: coach_sports upserted (Cricket)')

  // 6. availability_templates — 3 recurring weekly slots Mon/Wed/Sat 09:00–11:00.
  //    UNIQUE (coach_profile_id, day_of_week, start_time) from migration 014.
  //    `is_recurring=true, specific_date=null` satisfies the recurring-vs-ad-hoc
  //    CHECK constraint from migration 003 (coach_column_additions).
  const slots = [
    { day_of_week: 1, start_time: '09:00', end_time: '11:00' }, // Monday
    { day_of_week: 3, start_time: '09:00', end_time: '11:00' }, // Wednesday
    { day_of_week: 6, start_time: '09:00', end_time: '11:00' }, // Saturday
  ].map((s) => ({
    coach_profile_id: coachProfileId,
    sport_id: null,             // applies to all sports
    day_of_week: s.day_of_week,
    start_time: s.start_time,
    end_time: s.end_time,
    is_active: true,
    is_recurring: true,
    specific_date: null,
    updated_at: new Date().toISOString(),
  }))
  const { error: avErr } = await supabase
    .from('availability_templates')
    .upsert(slots, { onConflict: 'coach_profile_id,day_of_week,start_time' })
  if (avErr) {
    console.error('[seed] availability_templates upsert failed:', avErr)
    process.exit(1)
  }
  console.info('[seed] step 6/6: availability_templates upserted (3 weekly slots)')

  console.info('')
  console.info('[seed] complete')
  console.info(`        auth_user_id     = ${authUserId}`)
  console.info(`        user_profile_id  = ${userProfileId}`)
  console.info(`        coach_profile_id = ${coachProfileId}`)
}

// Fix-E2E-01a: Playwright globalSetup entry point. Wiring this as
// `globalSetup` in playwright.config.ts means every local `npm run test:e2e`
// self-provisions the test coach — the seed can no longer be silently skipped
// on a clean local Supabase. globalSetup requires a default-exported function.
export default async function globalSetup(): Promise<void> {
  await main()
}

// Fix-E2E-01a: direct CLI run support (`npx tsx e2e/fixtures/seed.ts`).
// The argv guard ensures the module import performed by Playwright's
// globalSetup loader does NOT also auto-run main() — otherwise the seed would
// execute twice per run (once on import, once via the default export). The
// check is module-format agnostic (no import.meta) because package.json has no
// "type": "module".
if (
  process.argv[1] &&
  (process.argv[1].endsWith('/e2e/fixtures/seed.ts') ||
    process.argv[1].endsWith('\\e2e\\fixtures\\seed.ts'))
) {
  main().catch((err) => {
    console.error('[seed] unexpected error:', err)
    process.exit(1)
  })
}
