import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachContext } from '@/lib/auth/require-coach'
import { PROGRAMME_AGE_GROUPS } from '@/components/coach/programmeConstants'
import { generateProgrammeSessionDates } from '@/lib/programme-sessions'
import { getCoachCommitments, findFirstConflict } from '@/lib/availability/commitments'
import { hhmmToMinutes } from '@/lib/availability/overlap'
import type { Json } from '@/types/database'

// MIRROR OF programmeConstants.SessionEntry — kept inline so this API route
// does not import from a client-side component module. Update both if the
// shape ever changes (CF-PROG-SESSIONS-DB).
interface SessionEntrySlot {
  startTime: string  // 'HH:MM'
  endTime: string    // 'HH:MM'
}
interface SessionEntry {
  date: string       // 'YYYY-MM-DD'
  startTime: string  // 'HH:MM'
  endTime: string    // 'HH:MM'
  slots?: SessionEntrySlot[]
}

/**
 * CF-PROG-SESSIONS-DB: per-entry validator for body.session_dates. Returns
 * an array of error strings ([] = OK).
 */
function isHHMM(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false
  const [h, m] = value.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

function validateSessionEntries(arr: unknown[]): string[] {
  const errors: string[] = []
  arr.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null) {
      errors.push(`session_dates[${idx}] must be an object`)
      return
    }
    const s = item as Record<string, unknown>
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) {
      errors.push(`session_dates[${idx}].date must be a YYYY-MM-DD string`)
    }
    if (!isHHMM(s.startTime)) {
      errors.push(`session_dates[${idx}].startTime must be HH:MM`)
    }
    if (!isHHMM(s.endTime)) {
      errors.push(`session_dates[${idx}].endTime must be HH:MM`)
    }
    if (s.slots !== undefined && s.slots !== null) {
      if (!Array.isArray(s.slots)) {
        errors.push(`session_dates[${idx}].slots must be an array if present`)
      } else {
        s.slots.forEach((sl, si) => {
          if (typeof sl !== 'object' || sl === null) {
            errors.push(`session_dates[${idx}].slots[${si}] must be an object`)
            return
          }
          const slot = sl as Record<string, unknown>
          if (!isHHMM(slot.startTime)) errors.push(`session_dates[${idx}].slots[${si}].startTime must be HH:MM`)
          if (!isHHMM(slot.endTime)) errors.push(`session_dates[${idx}].slots[${si}].endTime must be HH:MM`)
        })
      }
    }
  })
  return errors
}

/**
 * Programme response
 */
interface ProgrammeResponse {
  id: string
  sport_id: string
  sport_name: string
  title: string
  description: string | null
  schedule_type: string
  day_of_week: number | null
  day_name: string | null
  days_of_week: number[] | null
  start_time: string | null
  duration_minutes: number
  max_spots: number
  current_spots: number
  spots_remaining: number
  payment_type: string
  price_per_session_pence: number
  block_price_pence: number | null
  block_session_count: number | null
  currency: string
  status: string
  created_at: string
  venue_name: string | null
  venue_address: string | null
  min_participants: number | null
  cancellation_window_hours: number
  /** CF-PROGRAMMES-IMAGE-PICKER: cover photo URL. Null → UI falls back to sport-based placeholder. */
  image_url: string | null
  /** CF-PROG-AGE-GROUP: target age groups (min 1, "All ages" XOR specific). */
  age_groups: string[]
  /** CF-PROG-START-DATE: first session (fixed) / enrolment open (rolling).
   *  ISO timestamp string or null. ends_at is NOT exposed on the list endpoint
   *  by design — it is internal-only here, returned only on the single-programme GET. */
  starts_at: string | null
  /** BUG-23: camp programmes render real per-day slot blocks in the coach modal. */
  camp_mode: boolean
}

/**
 * Helper to get day name from day_of_week
 */
function getDayName(dayOfWeek: number | null): string | null {
  if (dayOfWeek === null) return null
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] || null
}

/**
 * Helper to normalize time format (HH:MM to HH:MM:SS)
 */
function normalizeTime(time: string): string {
  if (time.match(/^\d{2}:\d{2}$/)) {
    return `${time}:00`
  }
  return time
}

/**
 * GET /api/coaches/programmes
 * 
 * Returns all programmes for the authenticated coach.
 * Optional filter: ?status=active|draft|full|completed|cancelled
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<{ programmes: ProgrammeResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status')
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Fetch programmes — Fix-65-2: admin client bypasses SELECT RLS (only allows
    // active status); ownership enforced via explicit coach_profile_id filter.
    const adminSupabase = createAdminClient()
    let query = adminSupabase
      .from('group_programmes')
      .select('id, sport_id, title, description, schedule_type, day_of_week, days_of_week, start_time, duration_minutes, max_spots, current_spots, payment_type, price_per_session_pence, block_price_pence, block_session_count, currency, status, created_at, venue_name, venue_address, min_participants, cancellation_window_hours, image_url, age_groups, starts_at, camp_mode')
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data: programmes, error: programmesError } = await query

    if (programmesError) {
      console.error('[GET /api/coaches/programmes] fetch error:', programmesError)
      return NextResponse.json({ error: 'Failed to fetch programmes' }, { status: 500 })
    }

    // 5. Fetch sport names separately — Fix-65-1: remove sports!inner nested join
    const sportIds = [...new Set((programmes || []).map((p) => p.sport_id).filter(Boolean))]
    const sportsMap: Record<string, string> = {}
    if (sportIds.length > 0) {
      const { data: sportsData } = await supabase.from('sports').select('id, name').in('id', sportIds)
      sportsData?.forEach((s) => { sportsMap[s.id] = s.name })
    }

    // 6. Build response
    const response: ProgrammeResponse[] = (programmes || []).map((prog) => ({
      id: prog.id,
      sport_id: prog.sport_id,
      sport_name: sportsMap[prog.sport_id] || '',
      title: prog.title,
      description: prog.description,
      schedule_type: prog.schedule_type,
      day_of_week: prog.day_of_week,
      day_name: getDayName(prog.day_of_week),
      days_of_week: (prog.days_of_week as number[] | null) ?? null,
      start_time: prog.start_time,
      duration_minutes: prog.duration_minutes,
      max_spots: prog.max_spots,
      current_spots: prog.current_spots,
      spots_remaining: prog.max_spots - prog.current_spots,
      payment_type: prog.payment_type,
      price_per_session_pence: prog.price_per_session_pence,
      block_price_pence: prog.block_price_pence,
      block_session_count: prog.block_session_count,
      // BUG-23: the coach modal needs camp_mode to render real slot blocks.
      camp_mode: prog.camp_mode === true,
      currency: prog.currency,
      status: prog.status,
      created_at: prog.created_at,
      venue_name: prog.venue_name,
      venue_address: prog.venue_address,
      min_participants: prog.min_participants,
      cancellation_window_hours: prog.cancellation_window_hours,
      image_url: prog.image_url ?? null,
      age_groups: Array.isArray(prog.age_groups) ? prog.age_groups : [],
      // CF-PROG-START-DATE: list endpoint exposes starts_at only. ends_at is
      // internal — returned only on the single-programme GET.
      starts_at: prog.starts_at ?? null,
    }))

    return NextResponse.json({ programmes: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/programmes]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/programmes
 * 
 * Create a new programme.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ProgrammeResponse | { error: string; details?: unknown; message?: string }>> {
  try {
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (!body.sport_id || typeof body.sport_id !== 'string') {
      validationErrors.push('sport_id is required and must be a string')
    }

    if (!body.title || typeof body.title !== 'string') {
      validationErrors.push('title is required and must be a string')
    } else if (body.title.length > 200) {
      validationErrors.push('title must be 200 characters or less')
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        validationErrors.push('description must be a string')
      } else if (body.description.length > 1000) {
        validationErrors.push('description must be 1000 characters or less')
      }
    }

    if (!body.schedule_type || !['fixed', 'rolling'].includes(body.schedule_type)) {
      validationErrors.push('schedule_type must be either "fixed" or "rolling"')
    }

    if (body.day_of_week === undefined || body.day_of_week === null) {
      validationErrors.push('day_of_week is required')
    } else if (typeof body.day_of_week !== 'number' || body.day_of_week < 0 || body.day_of_week > 6) {
      validationErrors.push('day_of_week must be a number between 0 and 6')
    }

    if (body.days_of_week !== undefined && body.days_of_week !== null) {
      if (!Array.isArray(body.days_of_week)) {
        validationErrors.push('days_of_week must be an array')
      } else if (body.days_of_week.length < 1 || body.days_of_week.length > 7) {
        validationErrors.push('days_of_week must have between 1 and 7 elements')
      } else if (!body.days_of_week.every((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)) {
        validationErrors.push('each value in days_of_week must be a number between 0 and 6')
      }
    }

    if (!body.start_time || typeof body.start_time !== 'string') {
      validationErrors.push('start_time is required and must be a string (HH:MM format)')
    }

    if (!body.duration_minutes || typeof body.duration_minutes !== 'number') {
      validationErrors.push('duration_minutes is required and must be a number')
    } else if (body.duration_minutes < 15 || body.duration_minutes > 480) {
      validationErrors.push('duration_minutes must be between 15 and 480')
    }

    if (!body.max_spots || typeof body.max_spots !== 'number') {
      validationErrors.push('max_spots is required and must be a number')
    } else if (body.max_spots < 2 || body.max_spots > 100) {
      validationErrors.push('max_spots must be between 2 and 100')
    }

    if (!body.payment_type || !['per_session', 'block_upfront'].includes(body.payment_type)) {
      validationErrors.push('payment_type must be either "per_session" or "block_upfront"')
    }

    // Validate payment fields based on payment_type
    if (body.payment_type === 'per_session') {
      if (!body.price_per_session_pence || typeof body.price_per_session_pence !== 'number') {
        validationErrors.push('price_per_session_pence is required for per_session payment type')
      } else if (body.price_per_session_pence < 100) {
        validationErrors.push('price_per_session_pence must be at least 100 (£1.00)')
      }
    } else if (body.payment_type === 'block_upfront') {
      if (!body.block_price_pence || typeof body.block_price_pence !== 'number') {
        validationErrors.push('block_price_pence is required for block_upfront payment type')
      } else if (body.block_price_pence < 100) {
        validationErrors.push('block_price_pence must be at least 100 (£1.00)')
      }

      if (!body.block_session_count || typeof body.block_session_count !== 'number') {
        validationErrors.push('block_session_count is required for block_upfront payment type')
      } else if (body.block_session_count < 2) {
        validationErrors.push('block_session_count must be at least 2')
      }
    }

    // AF-C-22: validate venue_name + venue_address (matches pattern in availability/route.ts)
    if (body.venue_name !== undefined && body.venue_name !== null) {
      if (typeof body.venue_name !== 'string') {
        validationErrors.push('venue_name must be a string or null')
      } else if (body.venue_name.length > 200) {
        validationErrors.push('venue_name must be 200 characters or less')
      }
    }

    if (body.venue_address !== undefined && body.venue_address !== null) {
      if (typeof body.venue_address !== 'string') {
        validationErrors.push('venue_address must be a string or null')
      } else if (body.venue_address.length > 500) {
        validationErrors.push('venue_address must be 500 characters or less')
      }
    }

    // CF-PROGRAMMES-IMAGE-PICKER: cap image_url at 2000 chars (browser URL
    // limit). Unsplash URLs are ~100 chars, Storage URLs ~150 chars — 2000
    // is generous headroom for any legitimate source.
    if (body.image_url !== undefined && body.image_url !== null) {
      if (typeof body.image_url !== 'string') {
        validationErrors.push('image_url must be a string or null')
      } else if (body.image_url.length > 2000) {
        validationErrors.push('image_url must be 2000 characters or less')
      }
    }

    // CF-PROG-AGE-GROUP: non-empty array within allowlist. Optional in POST —
    // the DB column has DEFAULT '{}', but the UI always sends a value.
    if (body.age_groups !== undefined) {
      if (
        !Array.isArray(body.age_groups) ||
        body.age_groups.length < 1 ||
        body.age_groups.length > PROGRAMME_AGE_GROUPS.length
      ) {
        validationErrors.push('age_groups must be a non-empty array')
      } else if (
        !body.age_groups.every(
          (g: unknown) =>
            typeof g === 'string' && (PROGRAMME_AGE_GROUPS as readonly string[]).includes(g),
        )
      ) {
        validationErrors.push('age_groups contains invalid values')
      }
    }

    // CF-PROG-START-DATE: three optional date inputs, all 'YYYY-MM-DD'.
    // starts_at is required by the UI for fixed programmes (UI canContinue),
    // not by the server — server treats all three as nullable.
    for (const field of ['starts_at', 'programme_end_date', 'rolling_end_date'] as const) {
      const v = body[field]
      if (v !== undefined && v !== null && v !== '') {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v + 'T00:00:00').getTime())) {
          validationErrors.push(`${field} must be a YYYY-MM-DD date string`)
        }
      }
    }

    // CF-PROG-SESSIONS-DB: per-entry validation (was shape-only under CF-PROG-SESSION-LIST).
    if (body.session_dates !== undefined) {
      if (!Array.isArray(body.session_dates)) {
        validationErrors.push('session_dates must be an array')
      } else {
        validationErrors.push(...validateSessionEntries(body.session_dates))
      }
    }
    if (body.campMode !== undefined && typeof body.campMode !== 'boolean') {
      validationErrors.push('campMode must be a boolean')
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. Verify sport_id is in coach's configured sports
    const { data: coachSport, error: sportCheckError } = await supabase
      .from('coach_sports')
      .select('id')
      .eq('coach_profile_id', coachProfile.id)
      .eq('sport_id', body.sport_id)
      .single()

    if (sportCheckError || !coachSport) {
      return NextResponse.json(
        { error: 'Sport not configured. Add it in My Profile → Sports first.' },
        { status: 400 }
      )
    }

    // Validate skill_level if provided
    const VALID_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'all']
    const skillLevel: string = body.skill_level && VALID_SKILL_LEVELS.includes(body.skill_level)
      ? body.skill_level
      : 'all'

    // Validate status if provided
    const requestedStatus: string = body.status === 'active' ? 'active' : 'draft'

    // 6. Insert new programme
    const insertData: {
      coach_profile_id: string
      sport_id: string
      title: string
      description?: string | null
      schedule_type: string
      day_of_week: number
      days_of_week?: number[] | null
      start_time: string
      duration_minutes: number
      session_count?: number | null
      max_spots: number
      payment_type: string
      price_per_session_pence: number
      block_price_pence?: number | null
      block_session_count?: number | null
      late_joining_allowed: boolean
      min_participants?: number | null
      image_url?: string | null
      age_groups?: string[]
      // CF-PROG-START-DATE: ISO timestamp strings, both nullable in DB.
      starts_at?: string | null
      ends_at?: string | null
      cancellation_window_hours: number
      model: string
      skill_level: string
      status: string
      currency: string
      venue_name?: string | null
      venue_address?: string | null
      // CF-PROG-SESSIONS-DB: per-programme camp-mode flag (migration 031).
      camp_mode?: boolean
    } = {
      coach_profile_id: coachProfile.id,
      sport_id: body.sport_id,
      title: body.title,
      schedule_type: body.schedule_type,
      day_of_week: body.day_of_week,
      start_time: normalizeTime(body.start_time),
      duration_minutes: body.duration_minutes,
      max_spots: body.max_spots,
      payment_type: body.payment_type,
      price_per_session_pence: body.price_per_session_pence || 0,
      late_joining_allowed: body.late_joining_allowed === true,
      cancellation_window_hours: typeof body.cancellation_window_hours === 'number' ? body.cancellation_window_hours : 24,
      model: 'programme',
      skill_level: skillLevel,
      status: requestedStatus,
      currency: 'GBP',
      // CF-PROG-SESSIONS-DB: camp_mode is now persisted (was a STUB no-op).
      camp_mode: body.campMode === true,
    }

    // BUG-23 (approved ruling): camp programmes are per_session ONLY — a
    // block price cannot define what a "whole programme" of multi-slot days
    // covers. The form hides the block option in camp mode; this guards
    // crafted requests.
    if (insertData.camp_mode && insertData.payment_type === 'block_upfront') {
      return NextResponse.json(
        { error: 'Camp-mode programmes must use per-session payment.' },
        { status: 400 },
      )
    }

    if (body.min_participants !== undefined) {
      insertData.min_participants = typeof body.min_participants === 'number' && body.min_participants > 0
        ? body.min_participants
        : null
    }

    if (body.description !== undefined) {
      insertData.description = body.description
    }

    if (body.schedule_type === 'fixed' && typeof body.session_count === 'number' && body.session_count > 0) {
      insertData.session_count = body.session_count
    }

    if (body.payment_type === 'block_upfront') {
      insertData.block_price_pence = body.block_price_pence
      // Use session_count as block_session_count when not explicitly provided
      insertData.block_session_count = typeof body.block_session_count === 'number'
        ? body.block_session_count
        : (typeof body.session_count === 'number' ? body.session_count : null)
    }

    if (body.venue_name !== undefined) insertData.venue_name = body.venue_name || null
    if (body.venue_address !== undefined) insertData.venue_address = body.venue_address || null
    // CF-PROGRAMMES-IMAGE-PICKER: nullable cover photo URL (Unsplash or upload).
    if (body.image_url !== undefined) {
      insertData.image_url = typeof body.image_url === 'string' && body.image_url ? body.image_url : null
    }

    // CF-PROG-AGE-GROUP: only write if a valid non-empty array was provided.
    // Otherwise the DB DEFAULT '{}' applies.
    if (Array.isArray(body.age_groups) && body.age_groups.length > 0) {
      insertData.age_groups = body.age_groups
    }

    // CF-PROG-SESSION-LIST: when session_dates is non-empty, it is the canonical
    // source. Derive starts_at, ends_at, session_count, days_of_week from it.
    // Otherwise fall back to the CF-PROG-START-DATE derivation matrix below.
    const sessionDatesBody: Array<{ date?: unknown }> | null =
      Array.isArray(body.session_dates) && body.session_dates.length > 0
        ? body.session_dates
        : null

    if (sessionDatesBody) {
      const sortedDates = sessionDatesBody
        .map((s) => (typeof s?.date === 'string' ? s.date : ''))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
      if (sortedDates.length > 0) {
        insertData.starts_at = new Date(sortedDates[0] + 'T00:00:00').toISOString()
        insertData.ends_at = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00').toISOString()
        insertData.session_count = sortedDates.length
        // Derive days_of_week from the actual scheduled dates (calendar truth)
        // rather than from the form's pill row, per CF-PROG-SESSION-LIST flag 2.
        const derivedDays = Array.from(new Set(
          sortedDates.map((d) => new Date(d + 'T00:00:00').getDay()),
        )).sort((a, b) => a - b)
        insertData.days_of_week = derivedDays
        insertData.day_of_week = derivedDays[0]
      }
    } else {
      // CF-PROG-START-DATE fallback:
      //   schedule_type === 'fixed':
      //     - programme_end_date → ends_at = programme_end_date
      //     - else starts_at + session_count + days_of_week → compute last date
      //   schedule_type === 'rolling':
      //     - rolling_end_date → ends_at = rolling_end_date
      const startsAtStr: string | null =
        typeof body.starts_at === 'string' && body.starts_at ? body.starts_at : null
      if (startsAtStr) {
        insertData.starts_at = new Date(startsAtStr + 'T00:00:00').toISOString()
      }

      let endsAtStr: string | null = null
      if (body.schedule_type === 'fixed') {
        if (typeof body.programme_end_date === 'string' && body.programme_end_date) {
          endsAtStr = body.programme_end_date
        } else if (
          startsAtStr &&
          typeof body.session_count === 'number' &&
          body.session_count > 0 &&
          Array.isArray(insertData.days_of_week) &&
          insertData.days_of_week.length > 0
        ) {
          const computed = generateProgrammeSessionDates({
            startDate: startsAtStr,
            days: insertData.days_of_week,
            mode: 'count',
            count: body.session_count,
            endDate: '',
          })
          endsAtStr = computed.length > 0 ? computed[computed.length - 1] : null
        }
      } else if (body.schedule_type === 'rolling') {
        if (typeof body.rolling_end_date === 'string' && body.rolling_end_date) {
          endsAtStr = body.rolling_end_date
        }
      }
      if (endsAtStr) {
        insertData.ends_at = new Date(endsAtStr + 'T00:00:00').toISOString()
      }
    }

    // Fix-58-DB-api: populate days_of_week — prefer explicit array, fall back
    // to [day_of_week]. Session-dates derivation above already populated
    // days_of_week when applicable; this is the legacy fallback path.
    if (!Array.isArray(insertData.days_of_week)) {
      if (Array.isArray(body.days_of_week) && body.days_of_week.length > 0) {
        insertData.days_of_week = body.days_of_week
      } else if (typeof body.day_of_week === 'number') {
        insertData.days_of_week = [body.day_of_week]
      }
    }

    // CF-PROG-SESSIONS-DB: camp_mode is now persisted on insertData above
    // (migration 031). Session rows are inserted in a second statement below.

    // Fix-62: Use admin client for INSERT only — user is already authenticated and
    // coach ownership verified above. Bypasses RLS to avoid auth_user_id mapping
    // mismatch on dev DB (same root cause as Fix-19).
    const adminSupabase = createAdminClient()

    // BUG-18: block any session that overlaps a real commitment for this coach on
    // that date — another programme session or a confirmed 1-on-1 booking. Runs
    // BEFORE the programme insert so a conflict never leaves an orphan row (no
    // rollback needed). BUG-30: availability templates are deliberately EXCLUDED —
    // they are a passive canvas, not a commitment. A programme placed on top of an
    // availability block is the coach's decision; its sessions then suppress 1-on-1
    // slots in that window (same sources filter as the guest bookings route).
    if (sessionDatesBody && sessionDatesBody.length > 0) {
      for (const entry of sessionDatesBody as SessionEntry[]) {
        const startMin = hhmmToMinutes(entry.startTime)
        const endMin = hhmmToMinutes(entry.endTime)
        const commitments = await getCoachCommitments(adminSupabase, coachProfile.id, entry.date, {
          sources: ['programme', 'booking'],
        })
        const conflict = findFirstConflict(startMin, endMin, commitments)
        if (conflict) {
          return NextResponse.json(
            {
              error: 'Conflict detected',
              message: `The session on ${entry.date} (${entry.startTime}–${entry.endTime}) overlaps ${conflict.label} already scheduled for you. Adjust the programme times or dates.`,
            },
            { status: 409 },
          )
        }
      }
    }

    const { data: newProgramme, error: insertError } = await adminSupabase
      .from('group_programmes')
      .insert(insertData)
      .select('id, sport_id, title, description, schedule_type, day_of_week, days_of_week, start_time, duration_minutes, max_spots, current_spots, payment_type, price_per_session_pence, block_price_pence, block_session_count, currency, status, created_at, venue_name, venue_address, min_participants, cancellation_window_hours, image_url, age_groups, starts_at')
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/programmes] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create programme' }, { status: 500 })
    }

    // CF-PROG-SESSIONS-DB: persist session rows. If this fails we delete the
    // orphan programme to give the coach atomic semantics — either the
    // programme exists with its full session list, or nothing was created.
    if (sessionDatesBody && sessionDatesBody.length > 0) {
      const sessionRows = (sessionDatesBody as SessionEntry[]).map((entry) => ({
        group_programme_id: newProgramme.id as string,
        session_date: entry.date,
        start_time: entry.startTime,
        end_time: entry.endTime,
        // Slots are only persisted when camp mode is on AND the entry actually
        // carries a non-empty slots array. Otherwise the row's single
        // start_time/end_time is authoritative and slots stays NULL.
        slots:
          insertData.camp_mode && Array.isArray(entry.slots) && entry.slots.length > 0
            ? // SessionEntrySlot[] is structurally JSON-compatible but TS won't
              // unify it with the Json index-signature without a cast.
              (entry.slots as unknown as Json)
            : null,
      }))

      const { error: sessionsError } = await adminSupabase
        .from('group_programme_sessions')
        .insert(sessionRows)

      if (sessionsError) {
        console.error('[POST /api/coaches/programmes] session insert failed — rolling back programme:', sessionsError)
        // Soft-delete the orphan programme (CLAUDE.md: "Soft deletes only —
        // never hard DELETE"). The coach never saw this programme; the row
        // remains queryable for ops/audit until a separate cleanup job runs.
        await adminSupabase
          .from('group_programmes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', newProgramme.id)
        // 23P01 = exclusion_violation from the coach_time_claims trigger
        // (BUG-19 Phase 2): a session overlaps time already committed. The
        // app-level guard above catches most of these first; the DB backstop
        // closes the race window — surface it as the same clean 409.
        if (sessionsError.code === '23P01') {
          return NextResponse.json(
            {
              error: 'Conflict detected',
              message:
                'One of these sessions overlaps a booking or programme session already scheduled for you. Adjust the programme times or dates.',
            },
            { status: 409 },
          )
        }
        return NextResponse.json(
          { error: 'Failed to save programme sessions. Please try again.' },
          { status: 500 },
        )
      }
    }

    // 7. Fetch sport name separately (Fix-65-1 pattern — no nested join)
    let postSportName = ''
    if (newProgramme.sport_id) {
      const { data: sportRow } = await supabase.from('sports').select('name').eq('id', newProgramme.sport_id).single()
      postSportName = sportRow?.name || ''
    }

    const response: ProgrammeResponse = {
      id: newProgramme.id,
      sport_id: newProgramme.sport_id,
      sport_name: postSportName,
      // BUG-23: camp_mode comes from insertData (the POST select doesn't project it).
      camp_mode: insertData.camp_mode === true,
      title: newProgramme.title,
      description: newProgramme.description,
      schedule_type: newProgramme.schedule_type,
      day_of_week: newProgramme.day_of_week,
      day_name: getDayName(newProgramme.day_of_week),
      days_of_week: (newProgramme.days_of_week as number[] | null) ?? null,
      start_time: newProgramme.start_time,
      duration_minutes: newProgramme.duration_minutes,
      max_spots: newProgramme.max_spots,
      current_spots: newProgramme.current_spots,
      spots_remaining: newProgramme.max_spots - newProgramme.current_spots,
      payment_type: newProgramme.payment_type,
      price_per_session_pence: newProgramme.price_per_session_pence,
      block_price_pence: newProgramme.block_price_pence,
      block_session_count: newProgramme.block_session_count,
      currency: newProgramme.currency,
      status: newProgramme.status,
      created_at: newProgramme.created_at,
      venue_name: newProgramme.venue_name,
      venue_address: newProgramme.venue_address,
      min_participants: newProgramme.min_participants,
      cancellation_window_hours: newProgramme.cancellation_window_hours,
      image_url: newProgramme.image_url ?? null,
      age_groups: Array.isArray(newProgramme.age_groups) ? newProgramme.age_groups : [],
      // CF-PROG-START-DATE: ends_at intentionally NOT exposed on the list/POST
      // surface — internal-only. Returned by the single-programme GET below.
      starts_at: newProgramme.starts_at ?? null,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/programmes]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
