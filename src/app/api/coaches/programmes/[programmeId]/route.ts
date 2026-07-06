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
 * CF-PROG-SESSIONS-DB: per-entry validator for body.session_dates. Mirrors
 * the helper in `/api/coaches/programmes/route.ts` (POST) so create and edit
 * apply identical validation.
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
 * CF-PROG-SESSIONS-DB: project group_programme_sessions DB rows to the
 * SessionEntry shape consumed by the form. start_time/end_time come back
 * from PostgreSQL as 'HH:MM:SS' — trim to 'HH:MM'. Slots reflect the jsonb
 * column when non-empty, otherwise the field is omitted to match the form's
 * "single block" representation.
 */
function rowsToSessionEntries(
  rows: ReadonlyArray<{ session_date: string; start_time: string; end_time: string; slots: unknown }>,
): SessionEntry[] {
  return rows.map((r) => {
    const startTime = r.start_time.substring(0, 5)
    const endTime = r.end_time.substring(0, 5)
    const entry: SessionEntry = { date: r.session_date, startTime, endTime }
    if (Array.isArray(r.slots) && r.slots.length > 0) {
      const slots = (r.slots as Array<Record<string, unknown>>)
        .filter((s) => typeof s.startTime === 'string' && typeof s.endTime === 'string')
        .map((s) => ({ startTime: s.startTime as string, endTime: s.endTime as string }))
      if (slots.length > 0) entry.slots = slots
    }
    return entry
  })
}

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
  /** CF-PROGRAMMES-IMAGE-PICKER */
  image_url: string | null
  /** CF-PROG-AGE-GROUP: target age groups (min 1, "All ages" XOR specific). */
  age_groups: string[]
  /** CF-PROG-START-DATE: first session (fixed) / enrolment open (rolling). */
  starts_at: string | null
  /** CF-PROG-START-DATE: derived end timestamp. Exposed on this single-programme
   *  GET so the Edit screen's sessions preview can render end-date-mode programmes.
   *  Intentionally absent from the list endpoint. */
  ends_at: string | null
  skill_level: string
  session_count: number | null
  min_participants: number | null
  cancellation_window_hours: number
  /** CF-PROG-SESSIONS-DB: persisted per-session list, ordered by date. Empty
   *  array when the programme has no session rows (legacy programmes saved
   *  before migration 031 — the next coach save backfills them). */
  session_dates: SessionEntry[]
  /** CF-PROG-SESSIONS-DB: per-programme camp-mode flag (migration 031). */
  camp_mode: boolean
}

function getDayName(dayOfWeek: number | null): string | null {
  if (dayOfWeek === null) return null
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] || null
}

function normalizeTime(time: string): string {
  if (time.match(/^\d{2}:\d{2}$/)) {
    return `${time}:00`
  }
  return time
}

/**
 * GET /api/coaches/programmes/[programmeId]
 * 
 * Returns single programme with full details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<ProgrammeResponse | { error: string }>> {
  try {
    const { programmeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Fetch programme and verify ownership
    // CF-05b: admin client — bypasses RLS auth_user_id mismatch (dev DB).
    // Ownership enforced explicitly via .eq('coach_profile_id', coachProfile.id).
    const adminSupabase = createAdminClient()
    const { data: programme, error: programmeError } = await adminSupabase
      .from('group_programmes')
      .select('id, sport_id, title, description, schedule_type, day_of_week, days_of_week, start_time, duration_minutes, max_spots, current_spots, payment_type, price_per_session_pence, block_price_pence, block_session_count, currency, status, created_at, venue_name, venue_address, skill_level, session_count, min_participants, cancellation_window_hours, image_url, age_groups, starts_at, ends_at, camp_mode')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeError || !programme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // 5. Fetch sport name separately (Fix-65-1 pattern — no nested join)
    let getSportName = ''
    if (programme.sport_id) {
      const { data: sportRow } = await supabase.from('sports').select('name').eq('id', programme.sport_id).single()
      getSportName = sportRow?.name || ''
    }

    // CF-PROG-SESSIONS-DB: fetch persisted session rows (migration 031). Reuses
    // the admin client from the programme SELECT — the existing RLS policy on
    // group_programme_sessions only grants public SELECT when the parent
    // programme is 'active', so a coach viewing their own draft would otherwise
    // see an empty list. Ownership is already enforced by the programme SELECT
    // above (.eq('coach_profile_id', coachProfile.id)).
    const { data: sessionRows } = await adminSupabase
      .from('group_programme_sessions')
      .select('session_date, start_time, end_time, slots')
      .eq('group_programme_id', programme.id)
      .order('session_date', { ascending: true })
    const sessionDates: SessionEntry[] = sessionRows ? rowsToSessionEntries(sessionRows) : []

    const response: ProgrammeResponse = {
      id: programme.id,
      sport_id: programme.sport_id,
      sport_name: getSportName,
      title: programme.title,
      description: programme.description,
      schedule_type: programme.schedule_type,
      day_of_week: programme.day_of_week,
      day_name: getDayName(programme.day_of_week),
      days_of_week: programme.days_of_week ?? null,
      start_time: programme.start_time,
      duration_minutes: programme.duration_minutes,
      max_spots: programme.max_spots,
      current_spots: programme.current_spots,
      spots_remaining: programme.max_spots - programme.current_spots,
      payment_type: programme.payment_type,
      price_per_session_pence: programme.price_per_session_pence,
      block_price_pence: programme.block_price_pence,
      block_session_count: programme.block_session_count,
      currency: programme.currency,
      status: programme.status,
      created_at: programme.created_at,
      venue_name: programme.venue_name,
      venue_address: programme.venue_address,
      image_url: programme.image_url ?? null,
      age_groups: Array.isArray(programme.age_groups) ? programme.age_groups : [],
      starts_at: programme.starts_at ?? null,
      ends_at: programme.ends_at ?? null,
      skill_level: programme.skill_level,
      session_count: programme.session_count,
      min_participants: programme.min_participants,
      cancellation_window_hours: programme.cancellation_window_hours,
      session_dates: sessionDates,
      camp_mode: programme.camp_mode === true,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/programmes/[programmeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/coaches/programmes/[programmeId]
 * 
 * Update a programme. Cannot update if completed or cancelled.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<ProgrammeResponse | { error: string; details?: unknown; message?: string }>> {
  try {
    const { programmeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this programme and get current values
    // Fix-64: Use admin client — bypasses RLS auth_user_id mismatch (dev DB).
    // Ownership enforced explicitly via .eq('coach_profile_id', coachProfile.id).
    const adminSupabase = createAdminClient()
    // CF-PROG-START-DATE: select schedule fields too — needed to recompute
    // ends_at against the merged (existing ∪ body) state on PATCH.
    const { data: existingProgramme, error: programmeCheckError } = await adminSupabase
      .from('group_programmes')
      .select('id, status, current_spots, max_spots, schedule_type, days_of_week, day_of_week, session_count, starts_at, ends_at, camp_mode, payment_type')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeCheckError || !existingProgramme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // Cannot update if completed or cancelled
    if (existingProgramme.status === 'completed' || existingProgramme.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cannot update a programme that is completed or cancelled' },
        { status: 400 }
      )
    }

    // 5. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        validationErrors.push('title must be a string')
      } else if (body.title.length > 200) {
        validationErrors.push('title must be 200 characters or less')
      }
    }

    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== 'string') {
        validationErrors.push('description must be a string')
      } else if (body.description.length > 1000) {
        validationErrors.push('description must be 1000 characters or less')
      }
    }

    if (body.schedule_type !== undefined && !['fixed', 'rolling'].includes(body.schedule_type)) {
      validationErrors.push('schedule_type must be either "fixed" or "rolling"')
    }

    if (body.day_of_week !== undefined) {
      if (typeof body.day_of_week !== 'number' || body.day_of_week < 0 || body.day_of_week > 6) {
        validationErrors.push('day_of_week must be a number between 0 and 6')
      }
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

    if (body.start_time !== undefined && typeof body.start_time !== 'string') {
      validationErrors.push('start_time must be a string (HH:MM format)')
    }

    if (body.duration_minutes !== undefined) {
      if (typeof body.duration_minutes !== 'number') {
        validationErrors.push('duration_minutes must be a number')
      } else if (body.duration_minutes < 15 || body.duration_minutes > 480) {
        validationErrors.push('duration_minutes must be between 15 and 480')
      }
    }

    if (body.max_spots !== undefined) {
      if (typeof body.max_spots !== 'number') {
        validationErrors.push('max_spots must be a number')
      } else if (body.max_spots < 2 || body.max_spots > 100) {
        validationErrors.push('max_spots must be between 2 and 100')
      } else if (body.max_spots < existingProgramme.current_spots) {
        validationErrors.push(`Cannot reduce max_spots below current_spots (${existingProgramme.current_spots})`)
      }
    }

    if (body.payment_type !== undefined && !['per_session', 'block_upfront'].includes(body.payment_type)) {
      validationErrors.push('payment_type must be either "per_session" or "block_upfront"')
    }

    if (body.price_per_session_pence !== undefined) {
      if (typeof body.price_per_session_pence !== 'number') {
        validationErrors.push('price_per_session_pence must be a number')
      } else if (body.price_per_session_pence < 100) {
        validationErrors.push('price_per_session_pence must be at least 100 (£1.00)')
      }
    }

    if (body.block_price_pence !== undefined && body.block_price_pence !== null) {
      if (typeof body.block_price_pence !== 'number') {
        validationErrors.push('block_price_pence must be a number')
      } else if (body.block_price_pence < 100) {
        validationErrors.push('block_price_pence must be at least 100 (£1.00)')
      }
    }

    if (body.block_session_count !== undefined && body.block_session_count !== null) {
      if (typeof body.block_session_count !== 'number') {
        validationErrors.push('block_session_count must be a number')
      } else if (body.block_session_count < 2) {
        validationErrors.push('block_session_count must be at least 2')
      }
    }

    // Validate status transitions
    if (body.status !== undefined) {
      const validStatuses = ['draft', 'active', 'full', 'completed', 'cancelled']
      if (!validStatuses.includes(body.status)) {
        validationErrors.push('status must be one of: draft, active, full, completed, cancelled')
      }

      // Validate allowed transitions
      const currentStatus = existingProgramme.status
      const newStatus = body.status

      if (currentStatus === 'draft' && !['active', 'cancelled'].includes(newStatus)) {
        validationErrors.push('Can only transition from draft to active or cancelled')
      } else if (currentStatus === 'active' && !['full', 'completed', 'cancelled'].includes(newStatus)) {
        validationErrors.push('Can only transition from active to full, completed, or cancelled')
      } else if (currentStatus === 'full' && !['completed', 'cancelled'].includes(newStatus)) {
        validationErrors.push('Can only transition from full to completed or cancelled')
      }
    }

    // Fix-112: validation for venue + numeric programme fields (previously written unchecked)
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

    if (body.min_participants !== undefined && body.min_participants !== null) {
      if (typeof body.min_participants !== 'number' || !Number.isInteger(body.min_participants) || body.min_participants < 1 || body.min_participants > 100) {
        validationErrors.push('min_participants must be an integer between 1 and 100')
      }
    }

    if (body.cancellation_window_hours !== undefined && body.cancellation_window_hours !== null) {
      if (typeof body.cancellation_window_hours !== 'number' || !Number.isInteger(body.cancellation_window_hours) || body.cancellation_window_hours < 0 || body.cancellation_window_hours > 168) {
        validationErrors.push('cancellation_window_hours must be an integer between 0 and 168')
      }
    }

    // CF-PROGRAMMES-IMAGE-PICKER: matches POST validation — 2000 char cap.
    if (body.image_url !== undefined && body.image_url !== null) {
      if (typeof body.image_url !== 'string') {
        validationErrors.push('image_url must be a string or null')
      } else if (body.image_url.length > 2000) {
        validationErrors.push('image_url must be 2000 characters or less')
      }
    }

    // CF-PROG-AGE-GROUP: non-empty array within allowlist. Same shape as POST —
    // PATCH cannot clear to empty (UI also blocks this).
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

    // CF-PROG-START-DATE: validate the three date inputs as YYYY-MM-DD strings.
    // ends_at is derived, not patched directly.
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

    // 6. Build update object
    const updateData: {
      title?: string
      description?: string | null
      schedule_type?: string
      day_of_week?: number
      days_of_week?: number[] | null
      start_time?: string
      duration_minutes?: number
      max_spots?: number
      payment_type?: string
      price_per_session_pence?: number
      block_price_pence?: number | null
      block_session_count?: number | null
      status?: string
      updated_at: string
      venue_name?: string | null
      venue_address?: string | null
      min_participants?: number | null
      cancellation_window_hours?: number
      // CF-PROGRAMMES-IMAGE-PICKER
      image_url?: string | null
      // CF-PROG-AGE-GROUP
      age_groups?: string[]
      // CF-PROG-START-DATE: starts_at is user-supplied, ends_at is derived.
      starts_at?: string | null
      ends_at?: string | null
      // CF-PROG-SESSION-LIST: session_count derived from session_dates.length
      // when the array is non-empty.
      session_count?: number | null
      // CF-PROG-SESSIONS-DB: per-programme camp-mode flag (migration 031).
      camp_mode?: boolean
    } = {
      updated_at: new Date().toISOString(),
    }

    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.schedule_type !== undefined) updateData.schedule_type = body.schedule_type
    if (body.day_of_week !== undefined) updateData.day_of_week = body.day_of_week
    if (body.start_time !== undefined) updateData.start_time = normalizeTime(body.start_time)
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes
    if (body.max_spots !== undefined) updateData.max_spots = body.max_spots
    if (body.payment_type !== undefined) updateData.payment_type = body.payment_type
    if (body.price_per_session_pence !== undefined) updateData.price_per_session_pence = body.price_per_session_pence
    if (body.block_price_pence !== undefined) updateData.block_price_pence = body.block_price_pence
    if (body.block_session_count !== undefined) updateData.block_session_count = body.block_session_count
    if (body.status !== undefined) updateData.status = body.status
    // CF-PROG-SESSIONS-DB: camp_mode is now persisted (was a STUB no-op).
    if (body.campMode !== undefined) updateData.camp_mode = body.campMode === true

    // BUG-23 (approved ruling): camp programmes are per_session ONLY. Check
    // the EFFECTIVE values (body ∪ existing) so neither toggling camp on a
    // block programme nor switching a camp to block can slip through.
    const effectiveCampMode = updateData.camp_mode ?? existingProgramme.camp_mode === true
    const effectivePaymentType = updateData.payment_type ?? existingProgramme.payment_type
    if (effectiveCampMode && effectivePaymentType === 'block_upfront') {
      return NextResponse.json(
        { error: 'Camp-mode programmes must use per-session payment.' },
        { status: 400 },
      )
    }

    // Fix-58-DB-api: populate days_of_week — prefer explicit array, fall back to [day_of_week]
    if (Array.isArray(body.days_of_week) && body.days_of_week.length > 0) {
      updateData.days_of_week = body.days_of_week
    } else if (typeof body.day_of_week === 'number') {
      updateData.days_of_week = [body.day_of_week]
    }

    if (body.venue_name !== undefined) updateData.venue_name = body.venue_name || null
    if (body.venue_address !== undefined) updateData.venue_address = body.venue_address || null
    if (body.min_participants !== undefined) updateData.min_participants = body.min_participants
    if (body.cancellation_window_hours !== undefined) updateData.cancellation_window_hours = body.cancellation_window_hours
    // CF-PROGRAMMES-IMAGE-PICKER: coerce empty string to null so coaches can
    // remove a cover photo by sending image_url: null (or '').
    if (body.image_url !== undefined) {
      updateData.image_url = typeof body.image_url === 'string' && body.image_url ? body.image_url : null
    }

    // CF-PROG-AGE-GROUP: write only if a valid non-empty array was provided
    // (validation above guarantees shape + allowlist when defined).
    if (Array.isArray(body.age_groups) && body.age_groups.length > 0) {
      updateData.age_groups = body.age_groups
    }

    // CF-PROG-SESSION-LIST: when session_dates is non-empty, it is the canonical
    // source for starts_at / ends_at / session_count / days_of_week — overrides
    // the CF-PROG-START-DATE merged-state fallback below.
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
        updateData.starts_at = new Date(sortedDates[0] + 'T00:00:00').toISOString()
        updateData.ends_at = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00').toISOString()
        updateData.session_count = sortedDates.length
        const derivedDays = Array.from(new Set(
          sortedDates.map((d) => new Date(d + 'T00:00:00').getDay()),
        )).sort((a, b) => a - b)
        updateData.days_of_week = derivedDays
        updateData.day_of_week = derivedDays[0]
      }
    }

    // CF-PROG-START-DATE: write starts_at, then recompute ends_at against the
    // merged state (existing ∪ body) whenever any schedule input changes — but
    // only when session_dates wasn't provided.
    if (!sessionDatesBody && typeof body.starts_at === 'string' && body.starts_at) {
      updateData.starts_at = new Date(body.starts_at + 'T00:00:00').toISOString()
    }

    const scheduleFieldTouched =
      !sessionDatesBody &&
      (body.starts_at !== undefined ||
        body.programme_end_date !== undefined ||
        body.rolling_end_date !== undefined ||
        body.session_count !== undefined ||
        body.days_of_week !== undefined ||
        body.schedule_type !== undefined)

    if (scheduleFieldTouched) {
      const mergedScheduleType: string =
        typeof body.schedule_type === 'string' ? body.schedule_type : existingProgramme.schedule_type
      const mergedDays: number[] = Array.isArray(body.days_of_week)
        ? body.days_of_week
        : ((existingProgramme.days_of_week as number[] | null) ?? [])
      const mergedSessionCount: number | null =
        typeof body.session_count === 'number'
          ? body.session_count
          : ((existingProgramme.session_count as number | null) ?? null)
      const mergedStartsAt: string | null = updateData.starts_at
        ? new Date(updateData.starts_at).toISOString().split('T')[0]
        : existingProgramme.starts_at
          ? new Date(existingProgramme.starts_at).toISOString().split('T')[0]
          : null

      let nextEndsAt: string | null = null
      if (mergedScheduleType === 'fixed') {
        if (typeof body.programme_end_date === 'string' && body.programme_end_date) {
          nextEndsAt = body.programme_end_date
        } else if (
          mergedStartsAt &&
          typeof mergedSessionCount === 'number' &&
          mergedSessionCount > 0 &&
          mergedDays.length > 0
        ) {
          const computed = generateProgrammeSessionDates({
            startDate: mergedStartsAt,
            days: mergedDays,
            mode: 'count',
            count: mergedSessionCount,
            endDate: '',
          })
          nextEndsAt = computed.length > 0 ? computed[computed.length - 1] : null
        }
      } else if (mergedScheduleType === 'rolling') {
        if (typeof body.rolling_end_date === 'string' && body.rolling_end_date) {
          nextEndsAt = body.rolling_end_date
        } else if (body.rolling_end_date === null || body.rolling_end_date === '') {
          nextEndsAt = null
        } else if (
          body.schedule_type === 'rolling' &&
          existingProgramme.schedule_type !== 'rolling'
        ) {
          // Switching from fixed → rolling with no rolling_end_date provided.
          // The previously-derived ends_at was a fixed-mode value and no longer
          // applies. Null it out rather than carrying stale state forward.
          nextEndsAt = null
        } else {
          // Field not in body and schedule type unchanged — keep existing.
          nextEndsAt = existingProgramme.ends_at
            ? new Date(existingProgramme.ends_at).toISOString().split('T')[0]
            : null
        }
      }

      updateData.ends_at = nextEndsAt ? new Date(nextEndsAt + 'T00:00:00').toISOString() : null
    }

    // BUG-18: block session conflicts BEFORE mutating anything (programme row or
    // session rows), so a conflict leaves the programme fully unchanged. Only runs
    // when the programme is unlocked (current_spots === 0) and the form carried a
    // session list — mirrors the reconciliation guard below. excludeProgrammeId
    // stops the programme's own existing sessions from self-conflicting.
    const patchConflictLocked = (existingProgramme.current_spots as number) > 0
    if (!patchConflictLocked && sessionDatesBody && sessionDatesBody.length > 0) {
      for (const entry of sessionDatesBody as SessionEntry[]) {
        const startMin = hhmmToMinutes(entry.startTime)
        const endMin = hhmmToMinutes(entry.endTime)
        const commitments = await getCoachCommitments(adminSupabase, coachProfile.id, entry.date, {
          excludeProgrammeId: programmeId,
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

    // 7. Update programme (adminSupabase already created in step 4)
    const { data: updatedProgramme, error: updateError } = await adminSupabase
      .from('group_programmes')
      .update(updateData)
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .select('id, sport_id, title, description, schedule_type, day_of_week, days_of_week, start_time, duration_minutes, max_spots, current_spots, payment_type, price_per_session_pence, block_price_pence, block_session_count, currency, status, created_at, venue_name, venue_address, skill_level, session_count, min_participants, cancellation_window_hours, image_url, age_groups, starts_at, ends_at, camp_mode')
      .single()

    if (updateError) {
      console.error('[PATCH /api/coaches/programmes/[programmeId]] update error:', updateError)
      // 23P01 = exclusion_violation from the coach_time_claims trigger
      // (BUG-19 Phase 2). A status change here (e.g. reactivating a cancelled
      // programme) cascades claim reactivation, which the DB rejects when the
      // time is now committed elsewhere — a clean conflict, not a failure.
      if (updateError.code === '23P01') {
        return NextResponse.json(
          {
            error: 'Conflict detected',
            message:
              'This programme\'s sessions now overlap a booking or another programme scheduled for you. Adjust the times or dates first.',
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: 'Failed to update programme' }, { status: 500 })
    }

    // CF-PROG-SESSIONS-DB: session reconciliation. Only runs when the programme
    // is not locked (current_spots === 0) AND the body carried a non-empty
    // session_dates array. When current_spots > 0 we silently skip — the UI
    // already hides the SessionCalendar so this is just defence-in-depth.
    if (!patchConflictLocked && sessionDatesBody && sessionDatesBody.length > 0) {
      // Effective camp_mode for slot-write decisions: merged body ∪ existing.
      const effectiveCampMode =
        updateData.camp_mode !== undefined
          ? updateData.camp_mode
          : existingProgramme.camp_mode === true

      // Step 1: delete rows whose session_date is no longer in the form.
      // Fetch existing rows, set-diff in memory, then delete by id — avoids
      // PostgREST `.not('col', 'in', '(...)')` quoting subtleties.
      const { data: existingSessions, error: existingSessionsError } = await adminSupabase
        .from('group_programme_sessions')
        .select('id, session_date')
        .eq('group_programme_id', programmeId)
      if (existingSessionsError) {
        console.error('[PATCH /api/coaches/programmes/[programmeId]] session fetch failed:', existingSessionsError)
        return NextResponse.json({ error: 'Failed to update programme sessions' }, { status: 500 })
      }
      const formDateSet = new Set(
        (sessionDatesBody as SessionEntry[]).map((s) => s.date),
      )
      const toDeleteIds = (existingSessions ?? [])
        .filter((r) => !formDateSet.has(r.session_date as string))
        .map((r) => r.id as string)
      if (toDeleteIds.length > 0) {
        const { error: sessionDeleteError } = await adminSupabase
          .from('group_programme_sessions')
          .delete()
          .in('id', toDeleteIds)
        if (sessionDeleteError) {
          console.error('[PATCH /api/coaches/programmes/[programmeId]] session delete failed:', sessionDeleteError)
          return NextResponse.json({ error: 'Failed to update programme sessions' }, { status: 500 })
        }
      }

      // Step 2: UPSERT every form session via ON CONFLICT
      // (group_programme_id, session_date) — relies on the unique constraint
      // added in migration 031.
      const sessionRows = (sessionDatesBody as SessionEntry[]).map((entry) => ({
        group_programme_id: programmeId,
        session_date: entry.date,
        start_time: entry.startTime,
        end_time: entry.endTime,
        slots:
          effectiveCampMode && Array.isArray(entry.slots) && entry.slots.length > 0
            ? // SessionEntrySlot[] is structurally JSON-compatible but TS won't
              // unify it with the Json index-signature without a cast.
              (entry.slots as unknown as Json)
            : null,
      }))
      const { error: sessionUpsertError } = await adminSupabase
        .from('group_programme_sessions')
        .upsert(sessionRows, { onConflict: 'group_programme_id,session_date' })
      if (sessionUpsertError) {
        console.error('[PATCH /api/coaches/programmes/[programmeId]] session upsert failed:', sessionUpsertError)
        // 23P01 = exclusion_violation from the coach_time_claims trigger
        // (BUG-19 Phase 2): an edited session overlaps time already committed
        // (the app-level guard above races; the DB backstop is authoritative).
        if (sessionUpsertError.code === '23P01') {
          return NextResponse.json(
            {
              error: 'Conflict detected',
              message:
                'One of these sessions overlaps a booking or programme session already scheduled for you. Adjust the programme times or dates.',
            },
            { status: 409 },
          )
        }
        return NextResponse.json({ error: 'Failed to update programme sessions' }, { status: 500 })
      }
    }

    // 8. Fetch sport name separately (Fix-65-1 pattern — no nested join)
    let patchSportName = ''
    if (updatedProgramme.sport_id) {
      const { data: sportRow } = await supabase.from('sports').select('name').eq('id', updatedProgramme.sport_id).single()
      patchSportName = sportRow?.name || ''
    }

    // CF-PROG-SESSIONS-DB: re-fetch the (now reconciled) session list for the response.
    const { data: patchSessionRows } = await adminSupabase
      .from('group_programme_sessions')
      .select('session_date, start_time, end_time, slots')
      .eq('group_programme_id', programmeId)
      .order('session_date', { ascending: true })
    const patchSessionDates: SessionEntry[] = patchSessionRows
      ? rowsToSessionEntries(patchSessionRows)
      : []

    const response: ProgrammeResponse = {
      id: updatedProgramme.id,
      sport_id: updatedProgramme.sport_id,
      sport_name: patchSportName,
      title: updatedProgramme.title,
      description: updatedProgramme.description,
      schedule_type: updatedProgramme.schedule_type,
      day_of_week: updatedProgramme.day_of_week,
      day_name: getDayName(updatedProgramme.day_of_week),
      days_of_week: (updatedProgramme.days_of_week as number[] | null) ?? null,
      start_time: updatedProgramme.start_time,
      duration_minutes: updatedProgramme.duration_minutes,
      max_spots: updatedProgramme.max_spots,
      current_spots: updatedProgramme.current_spots,
      spots_remaining: updatedProgramme.max_spots - updatedProgramme.current_spots,
      payment_type: updatedProgramme.payment_type,
      price_per_session_pence: updatedProgramme.price_per_session_pence,
      block_price_pence: updatedProgramme.block_price_pence,
      block_session_count: updatedProgramme.block_session_count,
      currency: updatedProgramme.currency,
      status: updatedProgramme.status,
      created_at: updatedProgramme.created_at,
      venue_name: updatedProgramme.venue_name,
      venue_address: updatedProgramme.venue_address,
      image_url: updatedProgramme.image_url ?? null,
      age_groups: Array.isArray(updatedProgramme.age_groups) ? updatedProgramme.age_groups : [],
      starts_at: updatedProgramme.starts_at ?? null,
      ends_at: updatedProgramme.ends_at ?? null,
      skill_level: updatedProgramme.skill_level,
      session_count: updatedProgramme.session_count,
      min_participants: updatedProgramme.min_participants,
      cancellation_window_hours: updatedProgramme.cancellation_window_hours,
      session_dates: patchSessionDates,
      camp_mode: updatedProgramme.camp_mode === true,
    }

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('[PATCH /api/coaches/programmes/[programmeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/coaches/programmes/[programmeId]
 * 
 * Soft delete — sets deleted_at. Only allowed if draft or no enrolments.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ programmeId: string }> }
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { programmeId } = await params
    const supabase = await createClient()
    
    const { context, error } = await requireCoachContext(supabase)
    if (error) return error
    const { coachProfile } = context

    // 4. Verify coach owns this programme and check status/enrolments
    // Fix-69-2: admin client — same RLS auth_user_id mismatch as Fix-64.
    // Ownership enforced via explicit .eq('coach_profile_id', coachProfile.id).
    const adminSupabase = createAdminClient()
    const { data: existingProgramme, error: programmeCheckError } = await adminSupabase
      .from('group_programmes')
      .select('id, status, current_spots')
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)
      .is('deleted_at', null)
      .single()

    if (programmeCheckError || !existingProgramme) {
      return NextResponse.json({ error: 'Programme not found or access denied' }, { status: 404 })
    }

    // Only allow deletion if draft or no enrolments
    if (existingProgramme.status !== 'draft' && existingProgramme.current_spots > 0) {
      return NextResponse.json(
        { error: 'Cannot delete a programme with active enrolments. Cancel it instead.' },
        { status: 400 }
      )
    }

    // 5. Soft delete — set deleted_at
    const { error: deleteError } = await adminSupabase
      .from('group_programmes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', programmeId)
      .eq('coach_profile_id', coachProfile.id)

    if (deleteError) {
      console.error('[DELETE /api/coaches/programmes/[programmeId]] delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to delete programme' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })

  } catch (error) {
    console.error('[DELETE /api/coaches/programmes/[programmeId]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
