// SEED-DEV-01 — populate hosted Supabase dev environment with 4 coaches
// and supporting parent + children + player so every coach UI surface
// (schedule grid, programmes, bookings, earnings, reviews) renders with
// realistic data.
//
// Run with: npx tsx scripts/seed-dev.ts
//
// Idempotent per-coach: if auth user already exists by email, the entire
// chain for that coach is skipped (no partial reseeding). Same for the
// parent + player supporting cast. Sports table uses upsert-on-slug.
//
// Required env vars (loaded from .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  (admin / bypasses RLS)
//
// All amounts in pence (integers). Currency GBP throughout.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ─────────────────────────────────────────────────────────────────────────
// Env loader — mirrors playwright.config.ts loadDotEnvLocal() pattern.
// Avoids adding a dotenv dependency; same outcome.
// ─────────────────────────────────────────────────────────────────────────

function loadDotEnvLocal(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
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

function loadEnv(): { url: string; serviceKey: string } {
  loadDotEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set (looked in process env + .env.local)')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set (looked in process env + .env.local)')
  return { url, serviceKey }
}

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface SportSeed {
  sportSlug: 'cricket' | 'football' | 'tennis' | 'swimming'
  sessionTypes: ('individual' | 'group')[]
  skillLevels: ('beginner' | 'intermediate' | 'advanced')[]
  ageGroups: string[]
  priceIndividualPence: number
  priceGroupPence: number | null
  maxGroupSize: number | null
  sessionDurationMinutes: number
}

interface AvailabilitySlot {
  sportSlug: 'cricket' | 'football' | 'tennis' | 'swimming'
  dayOfWeek: number // 0=Sun .. 6=Sat
  startTime: string // 'HH:MM:SS'
  endTime: string
}

interface ProgrammeSeed {
  title: string
  description: string
  sportSlug: 'cricket' | 'football' | 'tennis' | 'swimming'
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'all'
  ageGroups: string[]
  durationMinutes: number
  maxSpots: number
  currentSpots: number
  pricePerSessionPence: number
  paymentType: 'per_session' | 'block_upfront'
  status: 'draft' | 'active' | 'full' | 'completed' | 'cancelled'
  startsAt: string // YYYY-MM-DD
  daysOfWeek: number[] // for session generation
  sessionCount: number
  sessionStartTime: string // 'HH:MM:SS'
  sessionEndTime: string
  venueName: string
  venueAddress: string
  blockPricePence?: number
  blockSessionCount?: number
}

interface BookingSeed {
  sportSlug: 'cricket' | 'football' | 'tennis' | 'swimming'
  /** 'child:1' = first child, 'child:2' = second, 'player' = adult player */
  subject: 'child:1' | 'child:2' | 'player'
  sessionDate: string // YYYY-MM-DD
  startTime: string // HH:MM:SS
  endTime: string
  status: 'confirmed' | 'completed' | 'pending_approval'
  coachPricePence: number
}

interface ReviewSeed {
  rating: number // 1-5
  comment: string
  reviewerName: string
  sportSlug: 'cricket' | 'football' | 'tennis' | 'swimming'
  reply?: string
}

interface CoachSpec {
  email: string
  fullName: string
  displayName: string
  bio: string
  locationCity: string
  locationPostcode: string
  yearsExperience: number
  dbsStatus: 'none' | 'verified'
  isProfileLive: boolean
  sports: SportSeed[]
  availability: AvailabilitySlot[]
  programmes: ProgrammeSeed[]
  bookings: BookingSeed[]
  reviews: ReviewSeed[]
}

interface SupportingCast {
  parentAuthUserId: string
  parentUserProfileId: string
  parentProfileId: string
  child1Id: string
  child2Id: string
  playerAuthUserId: string
  playerUserProfileId: string
  playerProfileId: string
}

interface CoachResult {
  spec: CoachSpec
  authUserId: string
  userProfileId: string
  coachProfileId: string
  slug: string
  wasSkipped: boolean
}

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

const SEED_PASSWORD = 'Crikly2026!'
const PARENT_EMAIL = 'parent.seed@crikly-dev.test'
const PLAYER_EMAIL = 'player.seed@crikly-dev.test'

// ─────────────────────────────────────────────────────────────────────────
// Slug helpers — mirror supabase/migrations/028 + the runtime API route
// ─────────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'coach'
}

async function findUniqueSlug(admin: SupabaseClient, baseSlug: string): Promise<string> {
  // Try base, base-2, base-3, ..., base-52, then base-{epoch}
  for (let suffix = 0; suffix <= 52; suffix++) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`
    const { data, error } = await admin
      .from('coach_profiles')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (error) throw new Error(`slug lookup failed for ${candidate}: ${error.message}`)
    if (!data) return candidate
  }
  return `${baseSlug}-${Date.now()}`
}

// ─────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for a Date in UTC. */
function fmtDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns the first date >= startsAt (inclusive) whose JS day-of-week is in daysOfWeek. */
function nextMatchingDate(startsAt: Date, daysOfWeek: number[]): Date {
  const d = new Date(startsAt.getTime())
  for (let i = 0; i < 7; i++) {
    if (daysOfWeek.includes(d.getUTCDay())) return d
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d
}

/**
 * Generates `count` consecutive session dates starting from `startsAt`, only
 * picking dates whose day-of-week appears in `daysOfWeek`. Used for both
 * weekly recurring programmes (daysOfWeek=[3] for "Wednesdays") and
 * consecutive-day camps (daysOfWeek=[1,2,3,4,5] for Mon-Fri).
 */
function generateSessionDates(startsAt: string, daysOfWeek: number[], count: number): string[] {
  const dates: string[] = []
  const cursor = new Date(`${startsAt}T00:00:00Z`)
  // Advance to first matching date
  while (!daysOfWeek.includes(cursor.getUTCDay())) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  for (let i = 0; i < count; i++) {
    dates.push(fmtDate(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    while (!daysOfWeek.includes(cursor.getUTCDay())) {
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  return dates
}

// ─────────────────────────────────────────────────────────────────────────
// Booking reference generator
// ─────────────────────────────────────────────────────────────────────────

function generateBookingRef(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `CRK-${out}`
}

// ─────────────────────────────────────────────────────────────────────────
// Auth lookup
// ─────────────────────────────────────────────────────────────────────────

async function findAuthUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`auth.admin.listUsers failed (page ${page}): ${error.message}`)
    // Supabase narrows data.users to `never[]` when the error branch is also
    // possible — cast explicitly so .find() works.
    const users = (data?.users ?? []) as Array<{ id: string; email?: string | null }>
    const hit = users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit.id
    if (users.length < 100) break
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────
// Sport map (loaded once after seedSports)
// ─────────────────────────────────────────────────────────────────────────

let sportMap: Record<string, string> = {}

function sportId(slug: 'cricket' | 'football' | 'tennis' | 'swimming'): string {
  const id = sportMap[slug]
  if (!id) throw new Error(`sport not found in sportMap: ${slug}`)
  return id
}

// ─────────────────────────────────────────────────────────────────────────
// Seeders
// ─────────────────────────────────────────────────────────────────────────

async function seedSports(admin: SupabaseClient): Promise<void> {
  const rows = [
    { name: 'Cricket',  slug: 'cricket',  sort_order: 1, is_active: true },
    { name: 'Football', slug: 'football', sort_order: 2, is_active: true },
    { name: 'Tennis',   slug: 'tennis',   sort_order: 3, is_active: true },
    { name: 'Swimming', slug: 'swimming', sort_order: 4, is_active: true },
  ]
  const { error: upErr } = await admin
    .from('sports')
    .upsert(rows, { onConflict: 'slug', ignoreDuplicates: false })
  if (upErr) throw new Error(`sports upsert failed: ${upErr.message}`)

  // Now refetch to load the canonical IDs (some may pre-exist with different UUIDs)
  const { data, error } = await admin.from('sports').select('id, slug')
  if (error) throw new Error(`sports refetch failed: ${error.message}`)
  sportMap = {}
  for (const row of data ?? []) {
    sportMap[(row as { slug: string }).slug] = (row as { id: string }).id
  }
  for (const slug of ['cricket', 'football', 'tennis', 'swimming']) {
    if (!sportMap[slug]) throw new Error(`sport ${slug} missing after upsert`)
  }
}

async function seedSupportingCast(admin: SupabaseClient): Promise<SupportingCast> {
  // ── PARENT ───────────────────────────────────────────────────────────
  let parentAuthUserId = await findAuthUserByEmail(admin, PARENT_EMAIL)
  let parentUserProfileId: string
  let parentProfileId: string

  if (parentAuthUserId) {
    console.log(`  [cast] parent auth user exists (${PARENT_EMAIL}) — reusing`)
    const { data: up, error } = await admin
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', parentAuthUserId)
      .single()
    if (error) throw new Error(`parent user_profiles lookup failed: ${error.message}`)
    parentUserProfileId = up.id as string
    const { data: pp, error: ppErr } = await admin
      .from('parent_profiles')
      .select('id')
      .eq('user_profile_id', parentUserProfileId)
      .single()
    if (ppErr) throw new Error(`parent_profiles lookup failed: ${ppErr.message}`)
    parentProfileId = pp.id as string
  } else {
    console.log(`  [cast] creating parent auth user (${PARENT_EMAIL})`)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: PARENT_EMAIL,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { seeded: true, seed_task: 'SEED-DEV-01' },
    })
    if (createErr || !created.user) throw new Error(`parent createUser failed: ${createErr?.message ?? 'no user'}`)
    parentAuthUserId = created.user.id

    const { data: up, error: upErr } = await admin
      .from('user_profiles')
      .insert({
        auth_user_id: parentAuthUserId,
        full_name: 'Emma Williams',
        country_code: 'GB',
        active_role: 'parent',
        auth_provider: 'email',
        location_city: 'Wimbledon',
        location_postcode: 'SW19 5AE',
        terms_accepted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (upErr || !up) throw new Error(`parent user_profiles insert failed: ${upErr?.message ?? 'no row'}`)
    parentUserProfileId = up.id as string

    const { error: roleErr } = await admin
      .from('user_roles')
      .upsert(
        { user_profile_id: parentUserProfileId, role: 'parent', is_active: true },
        { onConflict: 'user_profile_id,role' },
      )
    if (roleErr) throw new Error(`parent user_roles insert failed: ${roleErr.message}`)

    const { data: pp, error: ppErr } = await admin
      .from('parent_profiles')
      .insert({ user_profile_id: parentUserProfileId })
      .select('id')
      .single()
    if (ppErr || !pp) throw new Error(`parent_profiles insert failed: ${ppErr?.message ?? 'no row'}`)
    parentProfileId = pp.id as string
  }

  // ── CHILDREN ────────────────────────────────────────────────────────
  // Idempotency by (parent_profile_id, full_name, date_of_birth).
  async function ensureChild(
    fullName: string,
    dob: string,
    sportSlugs: ('cricket' | 'football' | 'tennis' | 'swimming')[],
    skillLevel: string,
  ): Promise<string> {
    const { data: existing, error: lookErr } = await admin
      .from('child_profiles')
      .select('id')
      .eq('parent_profile_id', parentProfileId)
      .eq('full_name', fullName)
      .eq('date_of_birth', dob)
      .maybeSingle()
    if (lookErr) throw new Error(`child lookup failed (${fullName}): ${lookErr.message}`)
    if (existing) return existing.id as string

    const { data: inserted, error: insErr } = await admin
      .from('child_profiles')
      .insert({
        parent_profile_id: parentProfileId,
        full_name: fullName,
        date_of_birth: dob,
        sport_ids: sportSlugs.map(sportId),
        skill_level: skillLevel,
        transition_status: 'child',
        passport_privacy: 'booking_only',
      })
      .select('id')
      .single()
    if (insErr || !inserted) throw new Error(`child insert failed (${fullName}): ${insErr?.message ?? 'no row'}`)
    return inserted.id as string
  }

  const child1Id = await ensureChild('Oliver Williams', '2017-03-15', ['cricket'], 'intermediate')
  const child2Id = await ensureChild('Sophie Williams', '2014-08-20', ['tennis', 'swimming'], 'beginner')

  // ── PLAYER ──────────────────────────────────────────────────────────
  let playerAuthUserId = await findAuthUserByEmail(admin, PLAYER_EMAIL)
  let playerUserProfileId: string
  let playerProfileId: string

  if (playerAuthUserId) {
    console.log(`  [cast] player auth user exists (${PLAYER_EMAIL}) — reusing`)
    const { data: up, error } = await admin
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', playerAuthUserId)
      .single()
    if (error) throw new Error(`player user_profiles lookup failed: ${error.message}`)
    playerUserProfileId = up.id as string
    const { data: pp, error: ppErr } = await admin
      .from('player_profiles')
      .select('id')
      .eq('user_profile_id', playerUserProfileId)
      .single()
    if (ppErr) throw new Error(`player_profiles lookup failed: ${ppErr.message}`)
    playerProfileId = pp.id as string
  } else {
    console.log(`  [cast] creating player auth user (${PLAYER_EMAIL})`)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: PLAYER_EMAIL,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { seeded: true, seed_task: 'SEED-DEV-01' },
    })
    if (createErr || !created.user) throw new Error(`player createUser failed: ${createErr?.message ?? 'no user'}`)
    playerAuthUserId = created.user.id

    const { data: up, error: upErr } = await admin
      .from('user_profiles')
      .insert({
        auth_user_id: playerAuthUserId,
        full_name: 'Alex Patel',
        country_code: 'GB',
        active_role: 'player',
        auth_provider: 'email',
        location_city: 'Richmond',
        location_postcode: 'TW9 1DN',
        terms_accepted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (upErr || !up) throw new Error(`player user_profiles insert failed: ${upErr?.message ?? 'no row'}`)
    playerUserProfileId = up.id as string

    const { error: roleErr } = await admin
      .from('user_roles')
      .upsert(
        { user_profile_id: playerUserProfileId, role: 'player', is_active: true },
        { onConflict: 'user_profile_id,role' },
      )
    if (roleErr) throw new Error(`player user_roles insert failed: ${roleErr.message}`)

    const { data: pp, error: ppErr } = await admin
      .from('player_profiles')
      .insert({
        user_profile_id: playerUserProfileId,
        date_of_birth: '1998-04-15',
        sport_ids: [sportId('swimming')],
        skill_level: 'intermediate',
        passport_privacy: 'booking_only',
      })
      .select('id')
      .single()
    if (ppErr || !pp) throw new Error(`player_profiles insert failed: ${ppErr?.message ?? 'no row'}`)
    playerProfileId = pp.id as string
  }

  return {
    parentAuthUserId,
    parentUserProfileId,
    parentProfileId,
    child1Id,
    child2Id,
    playerAuthUserId,
    playerUserProfileId,
    playerProfileId,
  }
}

async function seedCoach(admin: SupabaseClient, spec: CoachSpec, cast: SupportingCast): Promise<CoachResult> {
  console.log(`\n→ Seeding coach: ${spec.fullName} (${spec.email})`)

  // ── A. AUTH USER ─────────────────────────────────────────────────────
  console.log('  [A] Checking for existing auth user...')
  const existingAuthUserId = await findAuthUserByEmail(admin, spec.email)

  if (existingAuthUserId) {
    console.log('  [A] Auth user exists — skipping coach chain entirely')
    // Reuse: fetch the existing IDs so the summary still has them
    const { data: up, error: upErr } = await admin
      .from('user_profiles')
      .select('id')
      .eq('auth_user_id', existingAuthUserId)
      .single()
    if (upErr || !up) throw new Error(`existing user_profiles lookup failed: ${upErr?.message ?? 'no row'}`)
    const userProfileId = up.id as string

    const { data: cp, error: cpErr } = await admin
      .from('coach_profiles')
      .select('id, slug')
      .eq('user_profile_id', userProfileId)
      .single()
    if (cpErr || !cp) throw new Error(`existing coach_profiles lookup failed: ${cpErr?.message ?? 'no row'}`)

    console.log(`  ⏭️  Skipped: auth_user_id=${existingAuthUserId}`)
    console.log(`              user_profile_id=${userProfileId}`)
    console.log(`              coach_profile_id=${cp.id}`)
    return {
      spec,
      authUserId: existingAuthUserId,
      userProfileId,
      coachProfileId: cp.id as string,
      slug: (cp.slug as string | null) ?? slugify(spec.fullName),
      wasSkipped: true,
    }
  }

  console.log('  [A] Creating auth user...')
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: spec.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { seeded: true, seed_task: 'SEED-DEV-01' },
  })
  if (createErr || !created.user) throw new Error(`createUser failed for ${spec.email}: ${createErr?.message ?? 'no user'}`)
  const authUserId = created.user.id

  // ── B. USER_PROFILE ──────────────────────────────────────────────────
  console.log('  [B] Inserting user_profile...')
  const { data: up, error: upErr } = await admin
    .from('user_profiles')
    .insert({
      auth_user_id: authUserId,
      full_name: spec.fullName,
      country_code: 'GB',
      active_role: 'coach',
      auth_provider: 'email',
      location_city: spec.locationCity,
      location_postcode: spec.locationPostcode,
      terms_accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (upErr || !up) throw new Error(`user_profiles insert failed for ${spec.email}: ${upErr?.message ?? 'no row'}`)
  const userProfileId = up.id as string

  // ── C. USER_ROLE ─────────────────────────────────────────────────────
  console.log('  [C] Inserting user_role (coach)...')
  const { error: roleErr } = await admin
    .from('user_roles')
    .upsert(
      { user_profile_id: userProfileId, role: 'coach', is_active: true },
      { onConflict: 'user_profile_id,role' },
    )
  if (roleErr) throw new Error(`user_roles upsert failed for ${spec.email}: ${roleErr.message}`)

  // ── D. COACH_PROFILE ─────────────────────────────────────────────────
  console.log('  [D] Inserting coach_profile...')
  const baseSlug = slugify(spec.fullName)
  const slug = await findUniqueSlug(admin, baseSlug)
  const dbsVerifiedAt = spec.dbsStatus === 'verified' ? new Date().toISOString() : null
  const dbsExpiresAt = spec.dbsStatus === 'verified'
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data: cp, error: cpErr } = await admin
    .from('coach_profiles')
    .insert({
      user_profile_id: userProfileId,
      bio: spec.bio,
      years_experience: spec.yearsExperience,
      stripe_onboarding_complete: false,
      dbs_status: spec.dbsStatus,
      dbs_verified_at: dbsVerifiedAt,
      dbs_expires_at: dbsExpiresAt,
      is_profile_live: spec.isProfileLive,
      cancellation_window_hours: 24,
      min_advance_hours: 24,
      max_advance_days: 56,
      slug,
      display_name: spec.displayName,
      languages: ['English'],
    })
    .select('id')
    .single()
  if (cpErr || !cp) throw new Error(`coach_profiles insert failed for ${spec.email}: ${cpErr?.message ?? 'no row'}`)
  const coachProfileId = cp.id as string

  // ── E. COACH_SPORTS ──────────────────────────────────────────────────
  console.log(`  [E] Inserting ${spec.sports.length} coach_sport(s)...`)
  for (const sport of spec.sports) {
    const { error } = await admin
      .from('coach_sports')
      .insert({
        coach_profile_id: coachProfileId,
        sport_id: sportId(sport.sportSlug),
        session_types: sport.sessionTypes,
        skill_levels: sport.skillLevels,
        age_groups: sport.ageGroups,
        price_individual_pence: sport.priceIndividualPence,
        price_group_pence: sport.priceGroupPence,
        max_group_size: sport.maxGroupSize,
        session_duration_minutes: sport.sessionDurationMinutes,
        currency: 'GBP',
        no_show_policy: 'no_refund',
        no_show_refund_percentage: 0,
        is_active: true,
      })
    if (error) throw new Error(`coach_sports insert failed (${sport.sportSlug}): ${error.message}`)
  }

  // ── F. AVAILABILITY_TEMPLATES ────────────────────────────────────────
  console.log(`  [F] Inserting ${spec.availability.length} availability_template(s)...`)
  for (const slot of spec.availability) {
    const { error } = await admin
      .from('availability_templates')
      .insert({
        coach_profile_id: coachProfileId,
        sport_id: sportId(slot.sportSlug),
        day_of_week: slot.dayOfWeek,
        start_time: slot.startTime,
        end_time: slot.endTime,
        is_recurring: true,
        specific_date: null,
        is_active: true,
      })
    if (error) throw new Error(`availability_templates insert failed (day ${slot.dayOfWeek}): ${error.message}`)
  }

  // ── G. GROUP_PROGRAMMES + SESSIONS ───────────────────────────────────
  console.log(`  [G] Inserting ${spec.programmes.length} programme(s) + computed sessions...`)
  let totalSessions = 0
  for (const prog of spec.programmes) {
    const insertRow: Record<string, unknown> = {
      coach_profile_id: coachProfileId,
      sport_id: sportId(prog.sportSlug),
      title: prog.title,
      description: prog.description,
      model: 'programme',
      schedule_type: 'fixed',
      skill_level: prog.skillLevel,
      age_groups: prog.ageGroups,
      duration_minutes: prog.durationMinutes,
      max_spots: prog.maxSpots,
      current_spots: prog.currentSpots,
      price_per_session_pence: prog.pricePerSessionPence,
      payment_type: prog.paymentType,
      late_joining_allowed: false,
      cancellation_window_hours: 24,
      status: prog.status,
      starts_at: `${prog.startsAt}T00:00:00Z`,
      days_of_week: prog.daysOfWeek,
      session_count: prog.sessionCount,
      venue_name: prog.venueName,
      venue_address: prog.venueAddress,
      camp_mode: false,
      currency: 'GBP',
    }
    if (prog.paymentType === 'block_upfront') {
      insertRow.block_price_pence = prog.blockPricePence ?? null
      insertRow.block_session_count = prog.blockSessionCount ?? null
    }

    const { data: progRow, error: progErr } = await admin
      .from('group_programmes')
      .insert(insertRow)
      .select('id')
      .single()
    if (progErr || !progRow) throw new Error(`group_programmes insert failed (${prog.title}): ${progErr?.message ?? 'no row'}`)
    const programmeId = progRow.id as string

    const sessionDates = generateSessionDates(prog.startsAt, prog.daysOfWeek, prog.sessionCount)
    const sessionRows = sessionDates.map((date) => ({
      group_programme_id: programmeId,
      session_date: date,
      start_time: prog.sessionStartTime,
      end_time: prog.sessionEndTime,
      status: 'scheduled' as const,
      slots: null,
    }))
    if (sessionRows.length > 0) {
      const { error: sessErr } = await admin
        .from('group_programme_sessions')
        .upsert(sessionRows, { onConflict: 'group_programme_id,session_date' })
      if (sessErr) throw new Error(`group_programme_sessions insert failed (${prog.title}): ${sessErr.message}`)
      totalSessions += sessionRows.length
    }
  }
  if (totalSessions > 0) console.log(`        → ${totalSessions} programme session row(s)`)

  // ── H. BOOKINGS + PAYOUTS ────────────────────────────────────────────
  if (spec.bookings.length > 0) {
    console.log(`  [H] Inserting ${spec.bookings.length} booking(s)...`)
  } else {
    console.log('  [H] No bookings to seed')
  }
  let payoutCount = 0
  for (const bk of spec.bookings) {
    const childProfileId = bk.subject === 'child:1' ? cast.child1Id
      : bk.subject === 'child:2' ? cast.child2Id
      : null
    const playerProfileId = bk.subject === 'player' ? cast.playerProfileId : null
    const bookedByUserId = bk.subject === 'player' ? cast.playerUserProfileId : cast.parentUserProfileId

    const commissionRate = 0.10
    const commissionPence = Math.round(bk.coachPricePence * commissionRate)
    const parentTotalPence = bk.coachPricePence + commissionPence

    const isCompleted = bk.status === 'completed'
    const sessionDateMs = new Date(`${bk.sessionDate}T${bk.startTime}Z`).getTime()
    const completedAt = isCompleted ? new Date(sessionDateMs).toISOString() : null
    const payoutEligibleAt = isCompleted ? new Date(sessionDateMs + 48 * 60 * 60 * 1000).toISOString() : null

    const { data: bookingRow, error: bookErr } = await admin
      .from('bookings')
      .insert({
        booking_reference: generateBookingRef(),
        coach_profile_id: coachProfileId,
        sport_id: sportId(bk.sportSlug),
        booked_by_user_id: bookedByUserId,
        child_profile_id: childProfileId,
        player_profile_id: playerProfileId,
        session_type: 'individual',
        session_date: bk.sessionDate,
        session_start_time: bk.startTime,
        session_end_time: bk.endTime,
        coach_price_pence: bk.coachPricePence,
        commission_rate: commissionRate,
        commission_pence: commissionPence,
        parent_total_pence: parentTotalPence,
        currency: 'GBP',
        status: bk.status,
        messaging_unlocked: bk.status === 'confirmed' || bk.status === 'completed',
        cancellation_window_hours: 24,
        completed_at: completedAt,
        payout_eligible_at: payoutEligibleAt,
      })
      .select('id')
      .single()
    if (bookErr || !bookingRow) throw new Error(`bookings insert failed (${bk.sessionDate} ${bk.startTime}): ${bookErr?.message ?? 'no row'}`)
    const bookingId = bookingRow.id as string

    if (isCompleted) {
      const scheduledAt = payoutEligibleAt ?? new Date().toISOString()
      const { error: payErr } = await admin
        .from('payouts')
        .insert({
          booking_id: bookingId,
          coach_profile_id: coachProfileId,
          amount_pence: bk.coachPricePence,
          currency: 'GBP',
          status: 'paid',
          scheduled_at: scheduledAt,
          processed_at: scheduledAt,
        })
      if (payErr) throw new Error(`payouts insert failed (booking ${bookingId}): ${payErr.message}`)
      payoutCount++
    }
  }
  if (payoutCount > 0) console.log(`        → ${payoutCount} payout row(s) for completed bookings`)

  // ── I. REVIEWS + COACH_REPLIES ───────────────────────────────────────
  if (spec.reviews.length > 0) {
    console.log(`  [I] Inserting ${spec.reviews.length} review(s)...`)
  } else {
    console.log('  [I] No reviews to seed')
  }
  let replyCount = 0
  for (const rv of spec.reviews) {
    const { data: rvRow, error: rvErr } = await admin
      .from('reviews')
      .insert({
        coach_profile_id: coachProfileId,
        booking_id: null,
        reviewer_user_id: null,
        rating: rv.rating,
        comment: rv.comment,
        reviewer_name: rv.reviewerName,
        sport_name: rv.sportSlug.charAt(0).toUpperCase() + rv.sportSlug.slice(1),
        is_visible: true,
      })
      .select('id')
      .single()
    if (rvErr || !rvRow) throw new Error(`reviews insert failed: ${rvErr?.message ?? 'no row'}`)
    const reviewId = rvRow.id as string

    if (rv.reply) {
      const { error: replyErr } = await admin
        .from('coach_replies')
        .upsert(
          { review_id: reviewId, coach_profile_id: coachProfileId, reply_text: rv.reply },
          { onConflict: 'review_id' },
        )
      if (replyErr) throw new Error(`coach_replies insert failed (review ${reviewId}): ${replyErr.message}`)
      replyCount++
    }
  }
  if (replyCount > 0) console.log(`        → ${replyCount} coach reply row(s)`)

  // ── J. RATING AGGREGATE ──────────────────────────────────────────────
  if (spec.reviews.length > 0) {
    console.log('  [J] Updating coach rating aggregate...')
    const sum = spec.reviews.reduce((a, r) => a + r.rating, 0)
    const avg = Math.round((sum / spec.reviews.length) * 100) / 100
    const { error: aggErr } = await admin
      .from('coach_profiles')
      .update({ rating_avg: avg, rating_count: spec.reviews.length })
      .eq('id', coachProfileId)
    if (aggErr) throw new Error(`coach_profiles rating update failed: ${aggErr.message}`)
  }

  console.log(`  ✅ Coach seeded: ${spec.fullName}`)
  console.log(`      auth_user_id=${authUserId}`)
  console.log(`      user_profile_id=${userProfileId}`)
  console.log(`      coach_profile_id=${coachProfileId}`)
  console.log(`      slug=${slug}`)

  return { spec, authUserId, userProfileId, coachProfileId, slug, wasSkipped: false }
}

// ─────────────────────────────────────────────────────────────────────────
// Coach specs
// ─────────────────────────────────────────────────────────────────────────

const COACH_1_RAVI: CoachSpec = {
  email: 'ravi.shastri@crikly-dev.test',
  fullName: 'Ravi Shastri',
  displayName: 'Ravi',
  bio: 'Former county-level cricketer with 8 years of coaching experience. Specialises in batting technique and match strategy. Has coached juniors who have progressed to academy level.',
  locationCity: 'Kingston upon Thames',
  locationPostcode: 'KT1 1AA',
  yearsExperience: 8,
  dbsStatus: 'verified',
  isProfileLive: true,
  sports: [
    {
      sportSlug: 'cricket',
      sessionTypes: ['individual', 'group'],
      skillLevels: ['beginner', 'intermediate', 'advanced'],
      ageGroups: ['under_8', 'under_12', 'under_16', 'adult'],
      priceIndividualPence: 5000,
      priceGroupPence: 3000,
      maxGroupSize: 8,
      sessionDurationMinutes: 60,
    },
  ],
  availability: [
    { sportSlug: 'cricket', dayOfWeek: 1, startTime: '09:00:00', endTime: '13:00:00' }, // Mon
    { sportSlug: 'cricket', dayOfWeek: 3, startTime: '09:00:00', endTime: '13:00:00' }, // Wed
    { sportSlug: 'cricket', dayOfWeek: 5, startTime: '09:00:00', endTime: '13:00:00' }, // Fri
    { sportSlug: 'cricket', dayOfWeek: 6, startTime: '08:00:00', endTime: '17:00:00' }, // Sat
  ],
  programmes: [
    {
      title: 'Junior Cricket Fundamentals',
      description: 'Weekly 8-session course covering batting, bowling, and fielding basics for ages 8-12.',
      sportSlug: 'cricket',
      skillLevel: 'beginner',
      ageGroups: ['under_12'],
      durationMinutes: 60,
      maxSpots: 8,
      currentSpots: 6,
      pricePerSessionPence: 12000,
      paymentType: 'per_session',
      status: 'active',
      startsAt: '2026-06-01',
      daysOfWeek: [3],
      sessionCount: 8,
      sessionStartTime: '17:00:00',
      sessionEndTime: '18:00:00',
      venueName: 'Kingston Cricket Club',
      venueAddress: '108 Latchmere Lane, Kingston upon Thames KT2 5TT',
    },
    {
      title: 'Advanced Batting Masterclass',
      description: 'Six-session deep-dive into modern batting technique for adult intermediate-to-advanced players.',
      sportSlug: 'cricket',
      skillLevel: 'advanced',
      ageGroups: ['adult'],
      durationMinutes: 90,
      maxSpots: 6,
      currentSpots: 6,
      pricePerSessionPence: 18000,
      paymentType: 'per_session',
      status: 'full',
      startsAt: '2026-06-06',
      daysOfWeek: [6],
      sessionCount: 6,
      sessionStartTime: '10:00:00',
      sessionEndTime: '11:30:00',
      venueName: 'The Oval Nets',
      venueAddress: 'Kennington Oval, London SE11 5SS',
    },
    {
      title: 'Cricket Summer Camp',
      description: 'Five-day intensive camp during the summer holidays. Block payment covers all five days. Lunch included.',
      sportSlug: 'cricket',
      skillLevel: 'all',
      ageGroups: ['under_8', 'under_12', 'under_16'],
      durationMinutes: 480,
      maxSpots: 12,
      currentSpots: 3,
      pricePerSessionPence: 20000,
      paymentType: 'block_upfront',
      status: 'draft',
      startsAt: '2026-08-10',
      daysOfWeek: [1, 2, 3, 4, 5],
      sessionCount: 5,
      sessionStartTime: '09:00:00',
      sessionEndTime: '17:00:00',
      venueName: 'Kingston Cricket Club',
      venueAddress: '108 Latchmere Lane, Kingston upon Thames KT2 5TT',
      blockPricePence: 20000,
      blockSessionCount: 5,
    },
  ],
  bookings: [
    { sportSlug: 'cricket', subject: 'child:1', sessionDate: '2026-06-15', startTime: '10:00:00', endTime: '11:00:00', status: 'confirmed', coachPricePence: 5000 },
    { sportSlug: 'cricket', subject: 'child:1', sessionDate: '2026-05-20', startTime: '09:00:00', endTime: '10:00:00', status: 'completed', coachPricePence: 5000 },
    { sportSlug: 'cricket', subject: 'child:2', sessionDate: '2026-05-22', startTime: '14:00:00', endTime: '15:00:00', status: 'completed', coachPricePence: 5000 },
    { sportSlug: 'cricket', subject: 'child:1', sessionDate: '2026-06-20', startTime: '11:00:00', endTime: '12:00:00', status: 'pending_approval', coachPricePence: 5000 },
    { sportSlug: 'cricket', subject: 'child:2', sessionDate: '2026-06-25', startTime: '10:00:00', endTime: '11:00:00', status: 'confirmed', coachPricePence: 5000 },
  ],
  reviews: [
    { rating: 5, comment: 'Ravi transformed my son\'s batting. Clear explanations and incredibly patient.', reviewerName: 'Sarah K.', sportSlug: 'cricket', reply: 'Thanks Sarah — it\'s been a pleasure coaching Tom. He\'s made huge strides this term.' },
    { rating: 5, comment: 'Best cricket coach we\'ve had. My daughter actually looks forward to her sessions.', reviewerName: 'David M.', sportSlug: 'cricket' },
    { rating: 4, comment: 'Very knowledgeable, great with juniors. Sessions feel structured.', reviewerName: 'Aisha R.', sportSlug: 'cricket' },
    { rating: 5, comment: 'Honest, technical feedback. My boy has gone from struggling to make the squad to opening the batting.', reviewerName: 'Mark T.', sportSlug: 'cricket', reply: 'Thank you Mark — really proud of the progress Sam has made. Keep up the practice schedule we discussed.' },
    { rating: 4, comment: 'Great coach. Sometimes the group sessions feel a bit large but the quality is high.', reviewerName: 'Priya S.', sportSlug: 'cricket' },
    { rating: 5, comment: 'Patient, expert, and good with kids. Highly recommend.', reviewerName: 'James L.', sportSlug: 'cricket' },
  ],
}

const COACH_2_JAMES: CoachSpec = {
  email: 'james.mitchell@crikly-dev.test',
  fullName: 'James Mitchell',
  displayName: 'James',
  bio: 'Football and cricket coach with FA Level 2 (in progress) and 5 years of grassroots experience.',
  locationCity: 'Bristol',
  locationPostcode: 'BS1 4UW',
  yearsExperience: 5,
  dbsStatus: 'none',
  isProfileLive: false,
  sports: [
    {
      sportSlug: 'football',
      sessionTypes: ['individual', 'group'],
      skillLevels: ['beginner', 'intermediate'],
      ageGroups: ['under_8', 'under_12', 'under_16', 'adult'],
      priceIndividualPence: 4500,
      priceGroupPence: 2500,
      maxGroupSize: 10,
      sessionDurationMinutes: 60,
    },
    {
      sportSlug: 'cricket',
      sessionTypes: ['individual'],
      skillLevels: ['beginner', 'intermediate'],
      ageGroups: ['under_12', 'under_16'],
      priceIndividualPence: 4000,
      priceGroupPence: null,
      maxGroupSize: null,
      sessionDurationMinutes: 60,
    },
  ],
  availability: [],
  programmes: [
    {
      title: 'Football Skills Academy',
      description: 'Ten-session weekly programme building core football skills for juniors.',
      sportSlug: 'football',
      skillLevel: 'beginner',
      ageGroups: ['under_12', 'under_16'],
      durationMinutes: 60,
      maxSpots: 10,
      currentSpots: 4,
      pricePerSessionPence: 8000,
      paymentType: 'per_session',
      status: 'active',
      startsAt: '2026-06-02',
      daysOfWeek: [2],
      sessionCount: 10,
      sessionStartTime: '17:00:00',
      sessionEndTime: '18:00:00',
      venueName: 'Bristol Sports Ground',
      venueAddress: 'Failand, Bristol BS8 3TU',
    },
  ],
  bookings: [],
  reviews: [],
}

const COACH_3_SARAH: CoachSpec = {
  email: 'sarah.thompson@crikly-dev.test',
  fullName: 'Sarah Thompson',
  displayName: 'Sarah',
  bio: 'LTA accredited tennis coach with 6 years of experience teaching juniors and adults at club level.',
  locationCity: 'Wimbledon',
  locationPostcode: 'SW19 5AE',
  yearsExperience: 6,
  dbsStatus: 'verified',
  isProfileLive: true,
  sports: [
    {
      sportSlug: 'tennis',
      sessionTypes: ['individual'],
      skillLevels: ['beginner', 'intermediate', 'advanced'],
      ageGroups: ['under_12', 'under_16', 'adult'],
      priceIndividualPence: 5500,
      priceGroupPence: null,
      maxGroupSize: null,
      sessionDurationMinutes: 60,
    },
  ],
  availability: [
    { sportSlug: 'tennis', dayOfWeek: 2, startTime: '10:00:00', endTime: '16:00:00' }, // Tue
    { sportSlug: 'tennis', dayOfWeek: 4, startTime: '10:00:00', endTime: '16:00:00' }, // Thu
    { sportSlug: 'tennis', dayOfWeek: 6, startTime: '10:00:00', endTime: '16:00:00' }, // Sat
  ],
  programmes: [],
  bookings: [],
  reviews: [],
}

const COACH_4_PRIYA: CoachSpec = {
  email: 'priya.patel@crikly-dev.test',
  fullName: 'Priya Patel',
  displayName: 'Priya',
  bio: 'ASA-qualified swimming coach with 10 years of experience. Specialises in beginner adults and competitive squad swimmers.',
  locationCity: 'Richmond',
  locationPostcode: 'TW9 1DN',
  yearsExperience: 10,
  dbsStatus: 'verified',
  isProfileLive: true,
  sports: [
    {
      sportSlug: 'swimming',
      sessionTypes: ['individual', 'group'],
      skillLevels: ['beginner', 'intermediate', 'advanced'],
      ageGroups: ['under_8', 'under_12', 'under_16', 'adult'],
      priceIndividualPence: 4000,
      priceGroupPence: 2500,
      maxGroupSize: 6,
      sessionDurationMinutes: 60,
    },
  ],
  availability: [
    { sportSlug: 'swimming', dayOfWeek: 1, startTime: '06:00:00', endTime: '09:00:00' }, // Mon
    { sportSlug: 'swimming', dayOfWeek: 3, startTime: '06:00:00', endTime: '09:00:00' }, // Wed
    { sportSlug: 'swimming', dayOfWeek: 5, startTime: '06:00:00', endTime: '09:00:00' }, // Fri
    { sportSlug: 'swimming', dayOfWeek: 6, startTime: '08:00:00', endTime: '12:00:00' }, // Sat
    { sportSlug: 'swimming', dayOfWeek: 0, startTime: '08:00:00', endTime: '12:00:00' }, // Sun
  ],
  programmes: [
    {
      title: 'Adult Beginner Swimming',
      description: 'Eight-session weekly programme for adults learning to swim from scratch. Group sessions in a private lane.',
      sportSlug: 'swimming',
      skillLevel: 'beginner',
      ageGroups: ['adult'],
      durationMinutes: 60,
      maxSpots: 8,
      currentSpots: 5,
      pricePerSessionPence: 10000,
      paymentType: 'per_session',
      status: 'active',
      startsAt: '2026-06-01',
      daysOfWeek: [1],
      sessionCount: 8,
      sessionStartTime: '19:00:00',
      sessionEndTime: '20:00:00',
      venueName: 'Richmond Pools',
      venueAddress: 'Old Deer Park, Twickenham Road, Richmond TW9 2SF',
    },
    {
      title: 'Competitive Swim Training',
      description: 'Ten-session technique and stamina programme for club-level swimmers preparing for competition.',
      sportSlug: 'swimming',
      skillLevel: 'advanced',
      ageGroups: ['under_16', 'adult'],
      durationMinutes: 75,
      maxSpots: 6,
      currentSpots: 2,
      pricePerSessionPence: 15000,
      paymentType: 'per_session',
      status: 'active',
      startsAt: '2026-06-03',
      daysOfWeek: [3],
      sessionCount: 10,
      sessionStartTime: '18:00:00',
      sessionEndTime: '19:15:00',
      venueName: 'Richmond Pools',
      venueAddress: 'Old Deer Park, Twickenham Road, Richmond TW9 2SF',
    },
  ],
  bookings: [
    { sportSlug: 'swimming', subject: 'player',  sessionDate: '2026-05-15', startTime: '07:00:00', endTime: '08:00:00', status: 'completed', coachPricePence: 4000 },
    { sportSlug: 'swimming', subject: 'child:2', sessionDate: '2026-05-18', startTime: '08:00:00', endTime: '09:00:00', status: 'completed', coachPricePence: 4000 },
    { sportSlug: 'swimming', subject: 'player',  sessionDate: '2026-05-22', startTime: '06:30:00', endTime: '07:30:00', status: 'completed', coachPricePence: 4000 },
  ],
  reviews: [
    { rating: 5, comment: 'Priya is fantastic — patient, technically excellent, and made me feel completely safe in the water as a nervous adult learner.', reviewerName: 'Helen B.', sportSlug: 'swimming' },
    { rating: 5, comment: 'My daughter\'s technique has improved beyond what I thought possible. Highly recommend.', reviewerName: 'Karen W.', sportSlug: 'swimming' },
    { rating: 5, comment: 'Best swim coach in the area, no question. Booking was easy and she\'s incredibly knowledgeable.', reviewerName: 'Tom F.', sportSlug: 'swimming' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// Summary printer
// ─────────────────────────────────────────────────────────────────────────

function printSummary(cast: SupportingCast, results: CoachResult[]): void {
  console.log('\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ SEED-DEV-01 complete — 4 coaches seeded')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Supporting cast:')
  console.log(`  Parent (Emma Williams) — ${PARENT_EMAIL}`)
  console.log(`    auth_user_id:        ${cast.parentAuthUserId}`)
  console.log(`    user_profile_id:     ${cast.parentUserProfileId}`)
  console.log(`    parent_profile_id:   ${cast.parentProfileId}`)
  console.log(`    child:1 (Oliver):    ${cast.child1Id}`)
  console.log(`    child:2 (Sophie):    ${cast.child2Id}`)
  console.log(`  Player (Alex Patel)    — ${PLAYER_EMAIL}`)
  console.log(`    auth_user_id:        ${cast.playerAuthUserId}`)
  console.log(`    user_profile_id:     ${cast.playerUserProfileId}`)
  console.log(`    player_profile_id:   ${cast.playerProfileId}`)
  console.log('')
  console.log('Coaches:')
  for (const r of results) {
    const status = r.wasSkipped ? '⏭️  (existing — not modified)' : '✅ created'
    console.log(`  ${r.spec.fullName}  ${status}`)
    console.log(`    email:               ${r.spec.email}`)
    console.log(`    auth_user_id:        ${r.authUserId}`)
    console.log(`    user_profile_id:     ${r.userProfileId}`)
    console.log(`    coach_profile_id:    ${r.coachProfileId}`)
    console.log(`    slug:                ${r.slug}`)
    console.log(`    live:                ${r.spec.isProfileLive ? 'yes' : 'no (draft)'}`)
  }
  console.log('')
  console.log('Login credentials (all 6 accounts):')
  console.log(`    Password:            ${SEED_PASSWORD}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 SEED-DEV-01 starting...')
  console.log('')

  console.log('[1/9] Loading env vars...')
  const { url, serviceKey } = loadEnv()
  console.log(`      → ${url}`)

  console.log('[2/9] Creating admin Supabase client...')
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log('[3/9] Upserting sports (cricket, football, tennis, swimming)...')
  await seedSports(admin)
  console.log(`      → sport ids: cricket=${sportMap['cricket']}, football=${sportMap['football']}, tennis=${sportMap['tennis']}, swimming=${sportMap['swimming']}`)

  console.log('[4/9] Seeding supporting cast (parent + 2 children + player)...')
  const cast = await seedSupportingCast(admin)
  console.log(`      → parent_profile_id=${cast.parentProfileId}, player_profile_id=${cast.playerProfileId}`)

  console.log('[5/9] Seeding Coach 1 — Ravi Shastri (cricket, live)...')
  const r1 = await seedCoach(admin, COACH_1_RAVI, cast)

  console.log('\n[6/9] Seeding Coach 2 — James Mitchell (football+cricket, draft)...')
  const r2 = await seedCoach(admin, COACH_2_JAMES, cast)

  console.log('\n[7/9] Seeding Coach 3 — Sarah Thompson (tennis, live, empty)...')
  const r3 = await seedCoach(admin, COACH_3_SARAH, cast)

  console.log('\n[8/9] Seeding Coach 4 — Priya Patel (swimming, live)...')
  const r4 = await seedCoach(admin, COACH_4_PRIYA, cast)

  console.log('\n[9/9] Printing summary...')
  printSummary(cast, [r1, r2, r3, r4])

  process.exit(0)
}

main().catch((err) => {
  console.error('\n❌ SEED-DEV-01 failed:', err)
  process.exit(1)
})
