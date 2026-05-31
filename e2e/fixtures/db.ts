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
