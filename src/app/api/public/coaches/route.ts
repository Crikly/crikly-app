// PUB-API-01: public (no-auth) coach discovery endpoint.
//
// Powers:
//   - The landing page coach rail
//   - The future /coaches search / discovery page
//   - External clients (CORS-open) at some point post-launch
//
// Data flow: anon Supabase client → coach_sports !inner → coach_profiles
// !inner → user_profiles !inner (via the migration 20260603120000 public
// SELECT policy) → sports !inner. Filters: live + not suspended + not
// paused + not soft-deleted + sport_slug (if provided) + coach_sports
// is_active. Returns one row per live coach_sport — a multi-sport coach
// appears once per sport.
//
// RLS reminder: the anon client respects every SELECT policy. user_profiles
// became readable via 20260603120000; coach_profiles + coach_sports +
// sports already had public-for-live policies from migrations 002 + 003.
//
// PUB-API-01-followup-geo: ?location is accepted but currently a no-op.
// Geo filtering (postcode → lat/lng → radius) needs a separate task.

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 20

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

// Public discovery surface — values change rarely (new coach goes live,
// rating updates after a session). 60s edge cache with 5min SWR keeps
// the rail snappy without staleness anyone notices, and absorbs traffic
// spikes off the landing page.
const cacheHeaders = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
}

function withCors<T>(body: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers ?? {}) },
  })
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// ─── Response shape ──────────────────────────────────────────────────────────

interface PublicCoachListItem {
  coach_profile_id: string
  slug: string
  display_name: string
  location_city: string | null
  avatar_url: string | null
  sport_id: string
  sport_slug: string
  sport_name: string
  price_individual_pence: number | null
  currency: string
  rating_avg: number | null
  rating_count: number
}

interface PublicCoachListResponse {
  coaches: PublicCoachListItem[]
  pagination: {
    limit: number
    offset: number
    returned: number
    has_more: boolean
  }
}

interface ErrorResponse {
  error: string
  details?: string[]
}

// ─── Param parsing ───────────────────────────────────────────────────────────

function parseLimit(raw: string | null): number {
  const n = parseInt(raw ?? `${DEFAULT_LIMIT}`, 10)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(MAX_LIMIT, n))
}

function parseOffset(raw: string | null): number {
  const n = parseInt(raw ?? '0', 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

// ─── Row shape from the PostgREST select ─────────────────────────────────────
// PostgREST returns nested joins as T | T[] in TS — we flatten via the
// Array.isArray guard, mirroring src/app/api/coaches/profile/route.ts:136-138.

interface UserProfileJoin {
  full_name: string
  avatar_url: string | null
  location_city: string | null
}

interface CoachProfileJoin {
  id: string
  slug: string | null
  display_name: string | null
  rating_avg: number | null
  rating_count: number
  created_at: string
  user_profiles: UserProfileJoin | UserProfileJoin[]
}

interface CoachSportRow {
  sport_id: string
  price_individual_pence: number | null
  currency: string
  coach_profiles: CoachProfileJoin | CoachProfileJoin[]
}

interface SportRow {
  id: string
  slug: string
  name: string
}

function flatten<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
): Promise<NextResponse<PublicCoachListResponse | ErrorResponse>> {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseLimit(searchParams.get('limit'))
    const offset = parseOffset(searchParams.get('offset'))
    const sportSlug = searchParams.get('sport')?.trim().toLowerCase() ?? null
    // PUB-API-01-followup-geo: ?location accepted but no-op until the geo
    // task lands. Read-and-discard so the query string doesn't fail loud
    // and clients can already wire the param.
    void searchParams.get('location')

    const supabase = createPublicClient()

    // coach_sports.sport_id has no FK to sports(id) in the schema (migration
    // 002:110 declared the column without a REFERENCES clause), so PostgREST
    // can't auto-embed sports rows. Existing app routes already work around
    // this by joining sports separately in JS — we follow the same pattern.
    //
    // Strategy: (1) resolve ?sport=cricket → sport_id up front so we can
    // filter coach_sports by sport_id at query time, (2) fetch coach_sports
    // + coach_profiles + user_profiles in one PostgREST query, (3) batch-
    // fetch the matched sports rows in one .in() query, (4) zip in JS.
    let sportFilterId: string | null = null
    if (sportSlug) {
      const { data: sportRow, error: sportErr } = await supabase
        .from('sports')
        .select('id')
        .eq('slug', sportSlug)
        .maybeSingle()
      if (sportErr) {
        console.error('[GET /api/public/coaches] sport lookup error:', sportErr)
        return withCors({ error: 'Failed to fetch coaches' }, { status: 500 })
      }
      // No matching sport → empty list. Same shape as zero coaches.
      if (!sportRow) {
        return withCors({
          coaches: [],
          pagination: { limit, offset, returned: 0, has_more: false },
        })
      }
      sportFilterId = sportRow.id as string
    }

    // Sort strategy: PostgREST's `referencedTable` order applies to the
    // *embedded* rows, NOT to the top-level coach_sports rows. We need the
    // top-level rows ranked by coach_profiles.rating_avg, so we over-fetch
    // (up to OVERFETCH_CAP rows) and sort in JS post-fetch per Lasith STEP 1
    // Q3. The cap = 200 is intentionally 10× the per-request MAX_LIMIT — it
    // gives every reasonable single-page request a true global ranking
    // without paginated-sort bugs, while still capping the worst-case row
    // count under 1 KB-each (~200 KB transferred). Once live coaches > 200,
    // the ordering becomes a lower bound on quality (top coaches may sit
    // beyond the cap). At that point, denormalise rating onto coach_sports
    // or move to a Supabase RPC. Filed PUB-API-01-followup-sort-rpc.
    const OVERFETCH_CAP = 200

    let query = supabase
      .from('coach_sports')
      .select(`
        sport_id,
        price_individual_pence,
        currency,
        coach_profiles!inner (
          id,
          slug,
          display_name,
          rating_avg,
          rating_count,
          created_at,
          user_profiles!inner ( full_name, avatar_url, location_city )
        )
      `)
      .eq('is_active', true)
      .eq('coach_profiles.is_profile_live', true)
      .eq('coach_profiles.is_suspended', false)
      .eq('coach_profiles.is_paused', false)
      .is('coach_profiles.deleted_at', null)
      .limit(OVERFETCH_CAP)

    if (sportFilterId) {
      query = query.eq('sport_id', sportFilterId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[GET /api/public/coaches] query error:', error)
      return withCors({ error: 'Failed to fetch coaches' }, { status: 500 })
    }

    const rows = (data ?? []) as unknown as CoachSportRow[]

    // Sort rows: best-rated first, ties broken by review volume, then recency.
    // NULL rating_avg sorts LAST per the spec (Lasith STEP 0 Q6).
    rows.sort((a, b) => {
      const cpA = flatten(a.coach_profiles)
      const cpB = flatten(b.coach_profiles)
      const rA = cpA.rating_avg
      const rB = cpB.rating_avg
      // NULL last
      if (rA === null && rB === null) {
        // fall through to review count tie-break
      } else if (rA === null) {
        return 1
      } else if (rB === null) {
        return -1
      } else if (rB !== rA) {
        return rB - rA
      }
      if (cpB.rating_count !== cpA.rating_count) {
        return cpB.rating_count - cpA.rating_count
      }
      return cpB.created_at.localeCompare(cpA.created_at)
    })

    // Apply pagination AFTER the JS sort.
    const pageRows = rows.slice(offset, offset + limit)

    // Batch-fetch sport names for the unique sport_ids in the result set.
    const sportIds = Array.from(new Set(pageRows.map((r) => r.sport_id)))
    const sportById = new Map<string, SportRow>()
    if (sportIds.length > 0) {
      const { data: sportsData, error: sportsErr } = await supabase
        .from('sports')
        .select('id, slug, name')
        .in('id', sportIds)
      if (sportsErr) {
        console.error('[GET /api/public/coaches] sports batch fetch error:', sportsErr)
        return withCors({ error: 'Failed to fetch coaches' }, { status: 500 })
      }
      for (const s of (sportsData ?? []) as SportRow[]) {
        sportById.set(s.id, s)
      }
    }

    const coaches: PublicCoachListItem[] = pageRows
      .map((row) => {
        const cp = flatten(row.coach_profiles)
        const up = flatten(cp.user_profiles)
        const sp = sportById.get(row.sport_id)

        // Defensive: skip rows where coach_profiles.slug is null. Migration
        // 028 backfilled every existing coach, but a brand-new coach mid-
        // onboarding could theoretically appear here if they flipped to live
        // before slug generation completed. Without a slug there's no URL
        // for the discovery card to link to, so dropping is the right call.
        if (!cp.slug) return null
        // Defensive: skip if the sport batch fetch missed this row's sport_id
        // (would only happen mid-deletion of a sport — never in practice).
        if (!sp) return null

        return {
          coach_profile_id: cp.id,
          slug: cp.slug,
          display_name: cp.display_name ?? up.full_name,
          location_city: up.location_city,
          avatar_url: up.avatar_url,
          sport_id: row.sport_id,
          sport_slug: sp.slug,
          sport_name: sp.name,
          price_individual_pence: row.price_individual_pence,
          currency: row.currency,
          rating_avg: cp.rating_avg,
          rating_count: cp.rating_count,
        }
      })
      .filter((c): c is PublicCoachListItem => c !== null)

    // has_more reflects whether the over-fetched set extends beyond the page.
    // Note: if the live coach count ever exceeds OVERFETCH_CAP, has_more
    // becomes a lower bound (callers may get more pages than has_more
    // suggests). The follow-up task PUB-API-01-followup-sort-rpc removes
    // this ambiguity by moving the sort into the DB.
    const has_more = rows.length > offset + limit

    return withCors(
      {
        coaches,
        pagination: {
          limit,
          offset,
          returned: coaches.length,
          has_more,
        },
      },
      { headers: cacheHeaders },
    )
  } catch (err) {
    console.error('[GET /api/public/coaches] unexpected error:', err)
    return withCors({ error: 'Internal server error' }, { status: 500 })
  }
}
