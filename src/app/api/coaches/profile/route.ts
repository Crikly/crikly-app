import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { requireCoachRole, requireCoachContext } from '@/lib/auth/require-coach'
import { signApproveToken, APPROVE_TOKEN_TTL_MS } from '@/lib/admin-approve-token'
import { sendCoachReviewNotification } from '@/lib/resend/coach-lifecycle-emails'

// ─── Slug helpers ─────────────────────────────────────────────────────────────

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const MAX_SLUG_SUFFIX = 50

async function findUniqueSlug(
  supabase: SupabaseServerClient,
  name: string,
  excludeId?: string,
): Promise<string> {
  // AF-H-51: empty-slug fallback for non-alphanumeric names (e.g. "!!!") which previously infinite-looped
  const base = generateSlug(name) || 'coach'
  let candidate = base
  let suffix = 2
  while (suffix <= MAX_SLUG_SUFFIX + 2) {
    let q = supabase.from('coach_profiles').select('id').eq('slug', candidate)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, error } = await q.maybeSingle()
    // AF-H-51: surface DB errors instead of silently returning a potentially non-unique slug
    if (error) throw new Error(`Slug uniqueness check failed: ${error.message}`)
    if (!data) return candidate
    candidate = `${base}-${suffix++}`
  }
  // AF-H-51: bounded fallback after MAX_SLUG_SUFFIX attempts
  return `${base}-${Date.now()}`
}

/**
 * Coach profile response shape
 */
interface CoachProfileResponse {
  id: string
  user_profile_id: string
  full_name: string
  // BUG-37: the coach's public-facing name (coach_profiles). full_name above is
  // the private account name (user_profiles) — Settings-only per product rule.
  display_name: string | null
  avatar_url: string | null
  location_city: string | null
  location_postcode: string | null
  bio: string | null
  years_experience: number | null
  dbs_status: 'none' | 'pending' | 'verified' | 'expired'
  is_profile_live: boolean
  // PILOT-01: NULL = draft; set + not live = pending manual approval;
  // set + live = approved. Drives the "under review" UI state.
  submitted_for_review_at: string | null
  is_paused: boolean
  stripe_onboarding_complete: boolean
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
  requires_manual_approval: boolean
  travel_radius_miles: number | null
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  gender: string | null
  languages?: string[]
  slug: string | null
  created_at: string
  updated_at: string
}

/**
 * GET /api/coaches/profile
 * 
 * Returns the authenticated coach's full profile.
 * Joins with user_profiles to include identity data.
 */
export async function GET(): Promise<NextResponse<CoachProfileResponse | { error: string }>> {
  try {
    const supabase = await createClient()

    // PERF-01-FIX: Variant B parallelises user_roles + coach_profiles
    // gate checks (saves ~one round-trip vs Variant A's 3 sequential).
    // The rich coach_profiles SELECT below still needs the
    // user_profiles!inner join, so the coach_profiles ID returned by
    // Variant B is unused — worth it for the parallelisation win.
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { userProfile } = context

    // 3. Fetch coach profile with user_profiles join
    const { data: coachProfile, error: coachError } = await supabase
      .from('coach_profiles')
      .select(`
        id,
        user_profile_id,
        display_name,
        bio,
        years_experience,
        dbs_status,
        is_profile_live,
        submitted_for_review_at,
        is_paused,
        stripe_onboarding_complete,
        cancellation_window_hours,
        min_advance_hours,
        max_advance_days,
        requires_manual_approval,
        travel_radius_miles,
        rating_avg,
        rating_count,
        sessions_completed,
        gender,
        languages,
        slug,
        created_at,
        updated_at,
        user_profiles!inner (
          full_name,
          avatar_url,
          location_city,
          location_postcode
        )
      `)
      .eq('user_profile_id', userProfile.id)
      .single()

    // PERF-01-FIX: post-Variant-B, the missing-coach-row case is
    // unreachable here (Variant B 404s earlier with the same status +
    // message). This guard is kept to catch coachError from the rich
    // SELECT itself (e.g. transient DB errors after the gate passes).
    if (coachError || !coachProfile) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 404 })
    }

    // 4. Flatten response
    const userProfileData = Array.isArray(coachProfile.user_profiles)
      ? coachProfile.user_profiles[0]
      : coachProfile.user_profiles

    // PERF-01-FIX: slug backfill removed from GET — was a WRITE inside a
    // READ path that ran 1+1 round-trips on every call where slug was null,
    // and up to 51 round-trips on collision (see PERF-01 investigation).
    // Existing NULL-slug rows backfilled via migration 028; new coaches
    // get slugs from the POST handler below (gated on name-change or
    // missing slug). The variable below preserves the response field type.
    const slug: string | null = coachProfile.slug ?? null

    const response: CoachProfileResponse = {
      id: coachProfile.id,
      user_profile_id: coachProfile.user_profile_id,
      full_name: userProfileData.full_name,
      display_name: coachProfile.display_name ?? null,
      avatar_url: userProfileData.avatar_url,
      location_city: userProfileData.location_city,
      location_postcode: userProfileData.location_postcode,
      bio: coachProfile.bio,
      years_experience: coachProfile.years_experience,
      dbs_status: coachProfile.dbs_status as 'none' | 'pending' | 'verified' | 'expired',
      is_profile_live: coachProfile.is_profile_live,
      submitted_for_review_at: coachProfile.submitted_for_review_at ?? null,
      is_paused: coachProfile.is_paused,
      stripe_onboarding_complete: coachProfile.stripe_onboarding_complete,
      cancellation_window_hours: coachProfile.cancellation_window_hours,
      min_advance_hours: coachProfile.min_advance_hours,
      max_advance_days: coachProfile.max_advance_days,
      requires_manual_approval: coachProfile.requires_manual_approval,
      travel_radius_miles: coachProfile.travel_radius_miles,
      rating_avg: coachProfile.rating_avg,
      rating_count: coachProfile.rating_count,
      sessions_completed: coachProfile.sessions_completed,
      gender: coachProfile.gender,
      languages: coachProfile.languages || [],
      slug,
      created_at: coachProfile.created_at,
      updated_at: coachProfile.updated_at,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/profile]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/profile
 * 
 * Creates or updates the coach's profile (upsert).
 * Used during onboarding and profile edit.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CoachProfileResponse | { error: string; details?: unknown }>> {
  try {
    const supabase = await createClient()
    
    const { context, error } = await requireCoachRole(supabase)
    if (error) return error
    const { userProfile } = context

    // 3. Parse and validate body
    const body = await request.json()

    const validationErrors: string[] = []

    // Validate coach_profiles fields
    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string') {
        validationErrors.push('bio must be a string')
      } else if (body.bio.length > 500) {
        validationErrors.push('bio must be 500 characters or less')
      }
    }

    if (body.years_experience !== undefined) {
      if (typeof body.years_experience !== 'number' || !Number.isInteger(body.years_experience)) {
        validationErrors.push('years_experience must be an integer')
      } else if (body.years_experience < 0 || body.years_experience > 50) {
        validationErrors.push('years_experience must be between 0 and 50')
      }
    }

    if (body.gender !== undefined) {
      const validGenders = ['male', 'female', 'other', 'prefer_not_to_say']
      if (!validGenders.includes(body.gender)) {
        validationErrors.push('gender must be one of: male, female, other, prefer_not_to_say')
      }
    }

    if (body.cancellation_window_hours !== undefined) {
      // BUG-28: 168 (= "1 week") is a valid UI option (BookingPolicyStep) but
      // was missing from this whitelist, so selecting it 400'd and never saved.
      const validWindows = [0, 12, 24, 48, 72, 168]
      if (!validWindows.includes(body.cancellation_window_hours)) {
        validationErrors.push('cancellation_window_hours must be one of: 0, 12, 24, 48, 72, 168')
      }
    }

    if (body.min_advance_hours !== undefined) {
      if (typeof body.min_advance_hours !== 'number' || !Number.isInteger(body.min_advance_hours)) {
        validationErrors.push('min_advance_hours must be an integer')
      } else if (body.min_advance_hours < 1 || body.min_advance_hours > 168) {
        validationErrors.push('min_advance_hours must be between 1 and 168')
      }
    }

    if (body.max_advance_days !== undefined) {
      if (typeof body.max_advance_days !== 'number' || !Number.isInteger(body.max_advance_days)) {
        validationErrors.push('max_advance_days must be an integer')
      } else if (body.max_advance_days < 1 || body.max_advance_days > 365) {
        validationErrors.push('max_advance_days must be between 1 and 365')
      }
    }

    // Validate user_profiles fields
    if (body.full_name !== undefined) {
      if (typeof body.full_name !== 'string') {
        validationErrors.push('full_name must be a string')
      } else if (body.full_name.length > 100) {
        validationErrors.push('full_name must be 100 characters or less')
      } else if (body.full_name.trim().length === 0) {
        validationErrors.push('full_name cannot be empty')
      }
    }

    // Fix-COACH-UX-02: validate display_name (coach_profiles, nullable).
    // BUG-37: reject empty/whitespace-only — public surfaces render
    // display_name ?? full_name, so a saved '' would show a blank coach name.
    if (body.display_name !== undefined && body.display_name !== null) {
      if (typeof body.display_name !== 'string') {
        validationErrors.push('display_name must be a string')
      } else if (body.display_name.trim().length === 0) {
        validationErrors.push('display_name cannot be empty')
      } else if (body.display_name.length > 100) {
        validationErrors.push('display_name must be 100 characters or less')
      }
    }

    if (body.location_city !== undefined && body.location_city !== null) {
      if (typeof body.location_city !== 'string') {
        validationErrors.push('location_city must be a string')
      }
    }

    if (body.location_postcode !== undefined && body.location_postcode !== null) {
      if (typeof body.location_postcode !== 'string') {
        validationErrors.push('location_postcode must be a string')
      }
    }

    if (body.location_lat !== undefined && body.location_lat !== null) {
      if (typeof body.location_lat !== 'number' || !isFinite(body.location_lat)) {
        validationErrors.push('location_lat must be a number')
      } else if (body.location_lat < -90 || body.location_lat > 90) {
        validationErrors.push('location_lat must be between -90 and 90')
      }
    }

    if (body.location_lng !== undefined && body.location_lng !== null) {
      if (typeof body.location_lng !== 'number' || !isFinite(body.location_lng)) {
        validationErrors.push('location_lng must be a number')
      } else if (body.location_lng < -180 || body.location_lng > 180) {
        validationErrors.push('location_lng must be between -180 and 180')
      }
    }

    if (body.avatar_url !== undefined && body.avatar_url !== null) {
      if (typeof body.avatar_url !== 'string') {
        validationErrors.push('avatar_url must be a string')
      }
    }

    // Fix-129 (AF-H-15): travel_radius_miles validation
    if (body.travel_radius_miles !== undefined && body.travel_radius_miles !== null) {
      if (typeof body.travel_radius_miles !== 'number' || !Number.isInteger(body.travel_radius_miles) || body.travel_radius_miles < 0 || body.travel_radius_miles > 200) {
        validationErrors.push('travel_radius_miles must be an integer between 0 and 200')
      }
    }

    // Fix-AC-14: requires_manual_approval validation
    if (body.requires_manual_approval !== undefined) {
      if (typeof body.requires_manual_approval !== 'boolean') {
        validationErrors.push('requires_manual_approval must be a boolean')
      }
    }

    // BUG-PROFILE-LIVE-WRITE: is_profile_live validation (boolean, optional)
    if (body.is_profile_live !== undefined) {
      if (typeof body.is_profile_live !== 'boolean') {
        validationErrors.push('is_profile_live must be a boolean')
      }
    }

    // C-Settings-01-API: is_paused validation (boolean, optional)
    if (body.is_paused !== undefined) {
      if (typeof body.is_paused !== 'boolean') {
        validationErrors.push('is_paused must be a boolean')
      }
    }

    // Fix-16e: Validate languages if provided
    if (body.languages !== undefined && body.languages !== null) {
      if (!Array.isArray(body.languages)) {
        validationErrors.push('languages must be an array')
      } else if (body.languages.some((lang: unknown) => typeof lang !== 'string')) {
        validationErrors.push('languages must be an array of strings')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 3b. C-PAY-03 Guard 1: going live requires completed Stripe onboarding.
    // A live profile is bookable; a booking with no payout destination would
    // strand the coach's money (see the held-payout contract, migration 043).
    // Setting is_profile_live=false is never blocked. This is the ONLY write
    // path for is_profile_live (Step 0 audit) — guard here covers every caller.
    //
    // PILOT-01: during the pilot, `is_profile_live: true` from a client no
    // longer flips the flag — it SUBMITS the profile for manual review
    // (submitted_for_review_at = now). Liveness is granted only by the signed
    // admin approve route. The Stripe guard above-described still gates
    // submission: a profile that can't take payouts isn't reviewable.
    // submitForReview outcomes:
    //   'none'   — request doesn't ask to go live, or profile already live
    //              (idempotent no-op) or already pending with a still-valid
    //              approve link (prevents duplicate review emails)
    //   'submit' — write submitted_for_review_at + notify Lasith (Email 2);
    //              also covers an EXPIRED pending submission, refreshing the
    //              timestamp so a fresh 7-day approve link goes out
    let submitForReview: 'none' | 'submit' = 'none'
    if (body.is_profile_live === true) {
      const { data: liveGate, error: liveGateError } = await supabase
        .from('coach_profiles')
        .select('stripe_onboarding_complete, stripe_account_id, is_profile_live, submitted_for_review_at')
        .eq('user_profile_id', userProfile.id)
        .maybeSingle()

      if (liveGateError) {
        console.error('[POST /api/coaches/profile] go-live gate read error:', liveGateError)
        return NextResponse.json({ error: 'Failed to verify payment setup' }, { status: 500 })
      }

      let stripeReady = liveGate?.stripe_onboarding_complete === true

      // The ?success=true return redirect races the account.updated webhook —
      // the coach is usually back before the flag flips. If an account exists
      // but the flag is still false, re-check Stripe directly so a legitimate
      // just-finished onboarding is never rejected. Same semantics as the
      // webhook (charges_enabled && payouts_enabled); only `true` is written
      // here — flipping back to false stays webhook-owned.
      if (!stripeReady && liveGate?.stripe_account_id) {
        try {
          const account = await getStripe().accounts.retrieve(liveGate.stripe_account_id)
          if (account.charges_enabled === true && account.payouts_enabled === true) {
            const { error: syncError } = await supabase
              .from('coach_profiles')
              .update({ stripe_onboarding_complete: true, updated_at: new Date().toISOString() })
              .eq('user_profile_id', userProfile.id)
            if (syncError) {
              // Non-fatal: Stripe says ready, so let go-live proceed — the
              // webhook will persist the flag on its next delivery.
              console.error('[POST /api/coaches/profile] stripe_onboarding_complete sync error:', syncError)
            }
            stripeReady = true
          }
        } catch (stripeErr) {
          // Fail closed: we cannot confirm a payout destination, so do not go
          // live. Distinct code so the UI can say "try again" rather than
          // "connect Stripe".
          const message = stripeErr instanceof Stripe.errors.StripeError ? stripeErr.message : stripeErr
          console.error('[POST /api/coaches/profile] Stripe status re-check failed:', message)
          return NextResponse.json(
            {
              error: 'We could not verify your Stripe account status. Please try again in a moment.',
              code: 'STRIPE_STATUS_CHECK_FAILED',
            },
            { status: 502 }
          )
        }
      }

      if (!stripeReady) {
        return NextResponse.json(
          {
            error: 'Connect your Stripe account before going live. Complete payment setup from the Get Paid page.',
            code: 'STRIPE_ONBOARDING_INCOMPLETE',
          },
          { status: 409 }
        )
      }

      // PILOT-01 submission decision (Stripe guard passed). Already-live →
      // no-op (idempotent; a live coach re-sending the flag changes nothing).
      // Already-pending with an unexpired approve link → no-op, so repeat
      // clicks can't spam the review inbox or rotate a link Lasith already
      // has. Draft, or pending with an EXPIRED link → (re)submit.
      const alreadyLive = liveGate?.is_profile_live === true
      const pendingSinceMs = liveGate?.submitted_for_review_at
        ? Date.parse(liveGate.submitted_for_review_at)
        : null
      const pendingLinkStillValid =
        pendingSinceMs !== null && Date.now() <= pendingSinceMs + APPROVE_TOKEN_TTL_MS
      if (!alreadyLive && !pendingLinkStillValid) {
        submitForReview = 'submit'
      }
    }

    // 4. Update user_profiles if any fields provided
    const userProfileUpdates: Record<string, unknown> = {}
    if (body.full_name !== undefined) userProfileUpdates.full_name = body.full_name
    if (body.location_city !== undefined) userProfileUpdates.location_city = body.location_city
    if (body.location_postcode !== undefined) userProfileUpdates.location_postcode = body.location_postcode
    if (body.location_lat !== undefined) userProfileUpdates.location_lat = body.location_lat
    if (body.location_lng !== undefined) userProfileUpdates.location_lng = body.location_lng
    if (body.avatar_url !== undefined) userProfileUpdates.avatar_url = body.avatar_url

    if (Object.keys(userProfileUpdates).length > 0) {
      userProfileUpdates.updated_at = new Date().toISOString()
      
      const { error: userUpdateError } = await supabase
        .from('user_profiles')
        .update(userProfileUpdates)
        .eq('id', userProfile.id)

      if (userUpdateError) {
        console.error('[POST /api/coaches/profile] user_profiles update error:', userUpdateError)
        return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 })
      }
    }

    // 5. Upsert coach_profiles
    const coachProfileUpdates: {
      user_profile_id: string
      display_name?: string | null
      bio?: string | null
      years_experience?: number | null
      gender?: string | null
      languages?: string[]
      cancellation_window_hours?: number
      min_advance_hours?: number
      max_advance_days?: number
      travel_radius_miles?: number | null
      requires_manual_approval?: boolean
      is_profile_live?: boolean
      submitted_for_review_at?: string
      is_paused?: boolean
      updated_at: string
    } = {
      user_profile_id: userProfile.id,
      updated_at: new Date().toISOString(),
    }

    if (body.display_name !== undefined) coachProfileUpdates.display_name = body.display_name
    if (body.bio !== undefined) coachProfileUpdates.bio = body.bio
    if (body.years_experience !== undefined) coachProfileUpdates.years_experience = body.years_experience
    if (body.gender !== undefined) coachProfileUpdates.gender = body.gender
    // Fix-16e: Add languages to coach profile updates
    if (body.languages !== undefined && Array.isArray(body.languages)) coachProfileUpdates.languages = body.languages
    if (body.cancellation_window_hours !== undefined) coachProfileUpdates.cancellation_window_hours = body.cancellation_window_hours
    if (body.min_advance_hours !== undefined) coachProfileUpdates.min_advance_hours = body.min_advance_hours
    if (body.max_advance_days !== undefined) coachProfileUpdates.max_advance_days = body.max_advance_days
    // Fix-129 (AF-H-15): travel_radius_miles assignment
    if (body.travel_radius_miles !== undefined) coachProfileUpdates.travel_radius_miles = body.travel_radius_miles
    // Fix-AC-14: requires_manual_approval assignment
    if (body.requires_manual_approval !== undefined) coachProfileUpdates.requires_manual_approval = body.requires_manual_approval
    // BUG-PROFILE-LIVE-WRITE / PILOT-01: `is_profile_live: true` from a client
    // no longer writes the flag — it submits for review (see 3b); only the
    // signed admin approve route grants liveness. `false` still writes
    // directly (never blocked, C-PAY-03).
    if (body.is_profile_live === false) coachProfileUpdates.is_profile_live = false
    if (submitForReview === 'submit') {
      coachProfileUpdates.submitted_for_review_at = new Date().toISOString()
    }
    // C-Settings-01-API: is_paused assignment
    if (body.is_paused !== undefined) coachProfileUpdates.is_paused = body.is_paused

    const { error: coachUpsertError } = await supabase
      .from('coach_profiles')
      .upsert(coachProfileUpdates, {
        onConflict: 'user_profile_id',
      })

    if (coachUpsertError) {
      console.error('[POST /api/coaches/profile] coach_profiles upsert error:', coachUpsertError)
      return NextResponse.json({ error: 'Failed to update coach profile' }, { status: 500 })
    }

    // 6. Fetch and return updated profile
    const { data: updatedProfile, error: fetchError } = await supabase
      .from('coach_profiles')
      .select(`
        id,
        user_profile_id,
        display_name,
        bio,
        years_experience,
        dbs_status,
        is_profile_live,
        submitted_for_review_at,
        is_paused,
        stripe_onboarding_complete,
        cancellation_window_hours,
        min_advance_hours,
        max_advance_days,
        requires_manual_approval,
        travel_radius_miles,
        rating_avg,
        rating_count,
        sessions_completed,
        gender,
        languages,
        slug,
        created_at,
        updated_at,
        user_profiles!inner (
          full_name,
          avatar_url,
          location_city,
          location_postcode
        )
      `)
      .eq('user_profile_id', userProfile.id)
      .single()

    if (fetchError || !updatedProfile) {
      console.error('[POST /api/coaches/profile] fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch updated profile' }, { status: 500 })
    }

    // 7. Flatten response
    const userProfileData = Array.isArray(updatedProfile.user_profiles)
      ? updatedProfile.user_profiles[0]
      : updatedProfile.user_profiles

    // 8. Generate or regenerate slug when the PUBLIC name changed or slug is
    //    missing. BUG-38: the slug source is the effective public name —
    //    display_name, falling back to full_name only when display_name is
    //    unset (locked product rule: display_name everywhere a coach is
    //    publicly visible; full_name is the private Settings-only account
    //    name and must never leak into the URL). Editing full_name therefore
    //    no longer touches the slug while a display_name exists.
    let slug: string | null = updatedProfile.slug ?? null
    const publicName = updatedProfile.display_name?.trim() || userProfileData.full_name
    const publicNameChanged =
      body.display_name !== undefined ||
      (body.full_name !== undefined && !updatedProfile.display_name)
    if ((publicNameChanged || !slug) && publicName) {
      slug = await findUniqueSlug(supabase, publicName, updatedProfile.id)
      await supabase
        .from('coach_profiles')
        .update({ slug })
        .eq('id', updatedProfile.id)
    }

    const response: CoachProfileResponse = {
      id: updatedProfile.id,
      user_profile_id: updatedProfile.user_profile_id,
      full_name: userProfileData.full_name,
      display_name: updatedProfile.display_name ?? null,
      avatar_url: userProfileData.avatar_url,
      location_city: userProfileData.location_city,
      location_postcode: userProfileData.location_postcode,
      bio: updatedProfile.bio,
      years_experience: updatedProfile.years_experience,
      dbs_status: updatedProfile.dbs_status as 'none' | 'pending' | 'verified' | 'expired',
      is_profile_live: updatedProfile.is_profile_live,
      submitted_for_review_at: updatedProfile.submitted_for_review_at ?? null,
      is_paused: updatedProfile.is_paused,
      stripe_onboarding_complete: updatedProfile.stripe_onboarding_complete,
      cancellation_window_hours: updatedProfile.cancellation_window_hours,
      min_advance_hours: updatedProfile.min_advance_hours,
      max_advance_days: updatedProfile.max_advance_days,
      requires_manual_approval: updatedProfile.requires_manual_approval,
      travel_radius_miles: updatedProfile.travel_radius_miles,
      rating_avg: updatedProfile.rating_avg,
      rating_count: updatedProfile.rating_count,
      sessions_completed: updatedProfile.sessions_completed,
      gender: updatedProfile.gender,
      languages: updatedProfile.languages || [],
      slug,
      created_at: updatedProfile.created_at,
      updated_at: updatedProfile.updated_at,
    }

    // PILOT-01 Email 2: notify the review inbox that a profile is ready.
    // Signed with the DB round-trip timestamp (updatedProfile, not the JS
    // string we wrote) so the approve route's recomputation over the same
    // PostgREST-formatted value matches. Awaited (serverless can kill
    // un-awaited work after the response) but can never throw or fail the
    // request — the sender swallows and logs its own errors.
    if (submitForReview === 'submit' && updatedProfile.submitted_for_review_at) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        // Throws when ADMIN_APPROVE_SECRET is unset — hence this local
        // try/catch: a missing secret must cost us the notification email,
        // never the coach's (already-persisted) submission.
        const token = signApproveToken(updatedProfile.id, updatedProfile.submitted_for_review_at)

        const { data: sportRows } = await supabase
          .from('coach_sports')
          .select('sports ( name )')
          .eq('coach_profile_id', updatedProfile.id)
          .eq('is_active', true)

        const sportNames = (sportRows ?? [])
          .flatMap((row) => (Array.isArray(row.sports) ? row.sports : row.sports ? [row.sports] : []))
          .map((s) => s.name)

        await sendCoachReviewNotification({
          coachName: response.display_name || response.full_name,
          sports: sportNames,
          location: response.location_city,
          profileUrl: `${base}/coaches/${response.slug ?? ''}`,
          approveUrl: `${base}/api/admin/coaches/${updatedProfile.id}/approve?token=${token}`,
        })
      } catch (emailErr) {
        console.error(
          '[POST /api/coaches/profile] review notification failed:',
          emailErr instanceof Error ? emailErr.message : emailErr,
        )
      }
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[POST /api/coaches/profile]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
