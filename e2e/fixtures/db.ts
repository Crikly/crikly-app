// TEST-E2E-01: direct DB assertion helpers for E2E tests that need to verify
// a server-side state that isn't observable through the UI.
//
// Used today by P5 (Go Live flips coach_profiles.is_profile_live to true).
// All other specs assert via UI-visible state and don't need this module.
//
// SERVICE_ROLE_KEY is required — these helpers bypass RLS by design. Never
// import this module from anything that runs in the browser bundle (Playwright
// tests run in Node, so this is safe).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function requireEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`[e2e/db] missing required env: ${key}`)
  return v
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

export const dbAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Returns the coach_profiles.id for the given test coach email, or throws.
 *  user_profiles has no email column — we resolve via auth.users → user_profiles
 *  → coach_profiles using the admin Auth API + two PostgREST hops. */
export async function getCoachProfileIdByEmail(email: string): Promise<string> {
  // 1. Resolve auth.users.id by email via Admin API (paginated; tiny dev DB).
  let authUserId: string | null = null
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await dbAdmin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`[e2e/db] listUsers failed: ${error.message}`)
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) { authUserId = match.id; break }
    if (data.users.length < 100) break
  }
  if (!authUserId) throw new Error(`[e2e/db] no auth.users row for ${email}`)

  // 2. user_profiles by auth_user_id.
  const { data: upRow, error: upErr } = await dbAdmin
    .from('user_profiles')
    .select('id')
    .eq('auth_user_id', authUserId)
    .single()
  if (upErr || !upRow) throw new Error(`[e2e/db] user_profiles missing for ${email}: ${upErr?.message ?? 'no row'}`)

  // 3. coach_profiles by user_profile_id.
  const { data: cpRow, error: cpErr } = await dbAdmin
    .from('coach_profiles')
    .select('id')
    .eq('user_profile_id', upRow.id as string)
    .single()
  if (cpErr || !cpRow) throw new Error(`[e2e/db] coach_profiles missing for ${email}: ${cpErr?.message ?? 'no row'}`)
  return cpRow.id as string
}

/** Returns coach_profiles.is_profile_live for the given test coach email. */
export async function getCoachIsProfileLive(email: string): Promise<boolean> {
  const coachProfileId = await getCoachProfileIdByEmail(email)
  const { data, error } = await dbAdmin
    .from('coach_profiles')
    .select('is_profile_live')
    .eq('id', coachProfileId)
    .single()
  if (error || !data) {
    throw new Error(`[e2e/db] is_profile_live read failed: ${error?.message ?? 'no row'}`)
  }
  return data.is_profile_live === true
}

/** Resets coach_profiles.is_profile_live to false. Used by P5 afterAll. */
export async function resetCoachIsProfileLive(email: string): Promise<void> {
  const coachProfileId = await getCoachProfileIdByEmail(email)
  const { error } = await dbAdmin
    .from('coach_profiles')
    .update({ is_profile_live: false, updated_at: new Date().toISOString() })
    .eq('id', coachProfileId)
  if (error) throw new Error(`[e2e/db] reset is_profile_live failed: ${error.message}`)
}

/**
 * Soft-deletes any group_programmes rows whose title matches the given value
 * for the given coach. Used by P3 afterAll (deferred to TEST-E2E-02) to clean
 * up the test programme so re-runs start clean.
 *
 * Soft-delete (UPDATE deleted_at) per CLAUDE.md — never hard DELETE app rows.
 * `group_programmes.deleted_at` exists since the initial migration; the
 * `.is('deleted_at', null)` guard makes the helper idempotent across runs.
 */
export async function deleteProgrammeByTitle(email: string, title: string): Promise<void> {
  const coachProfileId = await getCoachProfileIdByEmail(email)
  const { error } = await dbAdmin
    .from('group_programmes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('coach_profile_id', coachProfileId)
    .eq('title', title)
    .is('deleted_at', null)
  if (error) throw new Error(`[e2e/db] deleteProgrammeByTitle failed: ${error.message}`)
}

// ─── TEST-E2E-03: programme seeding for the public-funnel specs (P9–P11) ──────
//
// P8 established the pattern: state the spec needs is created directly via the
// service role in beforeAll and cleaned up in afterAll (soft delete only).
// These helpers extend that pattern to group programmes so the camp picker
// (BUG-23), enrolment funnel (BUG-24), and slot-protection (BUG-19 P2) specs
// can each own their fixture programme.

export interface TestProgrammeSession {
  /** YYYY-MM-DD */
  dateISO: string
  /** HH:MM */
  startTime: string
  /** HH:MM */
  endTime: string
  /** Camp time blocks — omit for single-block/non-camp sessions. */
  slots?: { startTime: string; endTime: string }[]
}

export interface CreateTestProgrammeOptions {
  coachProfileId: string
  sportId: string
  title: string
  campMode: boolean
  maxSpots: number
  pricePerSessionPence: number
  sessions: TestProgrammeSession[]
}

export interface TestProgramme {
  programmeId: string
  /** group_programme_sessions ids, in the order of opts.sessions. */
  sessionIds: string[]
}

/**
 * Inserts an active, publicly visible per-session programme plus its persisted
 * sessions. Every column satisfies the CHECK constraints from migrations
 * coach_new_tables/031/040. Callers pre-clean with deleteProgrammeByTitle and
 * soft-delete via softDeleteProgramme in afterAll.
 */
export async function createTestProgramme(opts: CreateTestProgrammeOptions): Promise<TestProgramme> {
  const now = new Date().toISOString()
  const firstDate = opts.sessions[0]?.dateISO
  const { data: progRow, error: progErr } = await dbAdmin
    .from('group_programmes')
    .insert({
      coach_profile_id: opts.coachProfileId,
      sport_id: opts.sportId,
      title: opts.title,
      model: 'programme',
      schedule_type: 'fixed',
      skill_level: 'all',
      age_groups: ['8-11'],
      duration_minutes: 60,
      max_spots: opts.maxSpots,
      current_spots: 0,
      price_per_session_pence: opts.pricePerSessionPence,
      payment_type: 'per_session',
      camp_mode: opts.campMode,
      status: 'active',
      starts_at: firstDate ? `${firstDate}T09:00:00Z` : null,
      updated_at: now,
    })
    .select('id')
    .single()
  if (progErr || !progRow) throw new Error(`[e2e/db] programme insert failed: ${progErr?.message ?? 'no row'}`)
  const programmeId = progRow.id as string

  const sessionIds: string[] = []
  for (const s of opts.sessions) {
    // Production invariant (docs/03 §6.4): a multi-block session's
    // start_time/end_time mirror slots[0] — keep fixtures faithful so any
    // consumer reading the raw row sees the first block, not a full-day span.
    const firstBlock = s.slots?.[0]
    const { data: sessRow, error: sessErr } = await dbAdmin
      .from('group_programme_sessions')
      .insert({
        group_programme_id: programmeId,
        session_date: s.dateISO,
        start_time: `${firstBlock?.startTime ?? s.startTime}:00`,
        end_time: `${firstBlock?.endTime ?? s.endTime}:00`,
        status: 'scheduled',
        slots: s.slots ?? null,
        updated_at: now,
      })
      .select('id')
      .single()
    if (sessErr || !sessRow) throw new Error(`[e2e/db] session insert failed: ${sessErr?.message ?? 'no row'}`)
    sessionIds.push(sessRow.id as string)
  }
  return { programmeId, sessionIds }
}

/** Soft-deletes a programme by id (deleted_at) — never hard DELETE (CLAUDE.md). */
export async function softDeleteProgramme(programmeId: string): Promise<void> {
  const { error } = await dbAdmin
    .from('group_programmes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', programmeId)
  if (error) throw new Error(`[e2e/db] softDeleteProgramme failed: ${error.message}`)
}

/**
 * BUG-23: fills one camp (session, slot) to capacity by inserting `count`
 * succeeded enrolments + junction rows. payment_status='succeeded' (not
 * 'pending') so the camp_slot_occupancy hold never expires mid-test via the
 * 15-minute pending TTL (migration 040 occupancy predicate).
 */
export async function fillCampSlot(opts: {
  programmeId: string
  sessionId: string
  slotIndex: number
  count: number
  bookedByUserId: string
  pricePence: number
}): Promise<void> {
  for (let i = 0; i < opts.count; i++) {
    const { data: enrRow, error: enrErr } = await dbAdmin
      .from('group_programme_enrolments')
      .insert({
        programme_id: opts.programmeId,
        booked_by_user_id: opts.bookedByUserId,
        payment_type: 'platform',
        payment_model: 'per_session',
        status: 'active',
        payment_status: 'succeeded',
        participant_name: `E2E Slot Filler ${i + 1}`,
        enrolment_reference: `E2E-FILL-${opts.sessionId.slice(0, 8)}-${opts.slotIndex}-${i}`,
        parent_total_pence: opts.pricePence,
        coach_amount_pence: opts.pricePence,
        commission_pence: 0,
        currency: 'GBP',
      })
      .select('id')
      .single()
    if (enrErr || !enrRow) throw new Error(`[e2e/db] enrolment insert failed: ${enrErr?.message ?? 'no row'}`)

    const { error: junErr } = await dbAdmin.from('group_programme_enrolment_sessions').insert({
      enrolment_id: enrRow.id as string,
      group_programme_session_id: opts.sessionId,
      slot_index: opts.slotIndex,
      price_pence: opts.pricePence,
    })
    if (junErr) throw new Error(`[e2e/db] enrolment junction insert failed: ${junErr.message}`)
  }
}

/**
 * Removes fillCampSlot's filler rows for a programme. Hard delete — neither
 * group_programme_enrolments nor group_programme_enrolment_sessions has a
 * deleted_at column (docs/03 §6.5/§6.6), so this is the availability_templates
 * cleanup pattern, not a soft-delete-rule violation. Scoped to the fixture's
 * own participant names as a guard against ever touching real enrolments.
 */
export async function deleteCampSlotFillers(programmeId: string): Promise<void> {
  const { data: fillers, error: readErr } = await dbAdmin
    .from('group_programme_enrolments')
    .select('id')
    .eq('programme_id', programmeId)
    .like('participant_name', 'E2E Slot Filler%')
  if (readErr) throw new Error(`[e2e/db] filler read failed: ${readErr.message}`)
  const ids = (fillers ?? []).map((f) => f.id as string)
  if (ids.length === 0) return

  const { error: junErr } = await dbAdmin
    .from('group_programme_enrolment_sessions')
    .delete()
    .in('enrolment_id', ids)
  if (junErr) throw new Error(`[e2e/db] filler junction delete failed: ${junErr.message}`)

  const { error: enrErr } = await dbAdmin
    .from('group_programme_enrolments')
    .delete()
    .in('id', ids)
  if (enrErr) throw new Error(`[e2e/db] filler enrolment delete failed: ${enrErr.message}`)
}

/** P14 (P-04-B): seeds the user_profiles row for a freshly-registered
 *  e2e user, mirroring the /auth/callback seed. Locally
 *  enable_confirmations=false means the verify-email link (and therefore
 *  the callback) is never visited, so the row the login gate requires
 *  would not exist. Same payload + ON CONFLICT DO NOTHING semantics as
 *  the callback (auth/callback/route.ts). */
export async function seedUserProfileByEmail(
  email: string,
  fullName: string,
): Promise<void> {
  let authUserId: string | null = null
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await dbAdmin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`[e2e/db] listUsers failed: ${error.message}`)
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (match) { authUserId = match.id; break }
    if (data.users.length < 100) break
  }
  if (!authUserId) throw new Error(`[e2e/db] no auth.users row for ${email}`)

  const { error } = await dbAdmin
    .from('user_profiles')
    .upsert(
      {
        auth_user_id: authUserId,
        full_name: fullName,
        avatar_url: null,
        auth_provider: 'email',
      },
      { onConflict: 'auth_user_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(`[e2e/db] user_profiles seed failed: ${error.message}`)
}
