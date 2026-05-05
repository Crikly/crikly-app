import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCoachContextOrCreate } from '@/lib/auth/require-coach'

/**
 * Blocked date response
 */
interface BlockedDateResponse {
  id: string
  blocked_date: string
  blocked_date_end: string | null
  label: string | null
  reason: string | null
  is_range: boolean
  days_blocked: number
  created_at: string
}

/**
 * Helper to calculate days between two dates (inclusive)
 */
function calculateDaysBlocked(startDate: string, endDate: string | null): number {
  if (!endDate) return 1
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = end.getTime() - start.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays + 1 // +1 because range is inclusive
}

/**
 * Helper to check if date ranges overlap
 */
function rangesOverlap(
  start1: string,
  end1: string | null,
  start2: string,
  end2: string | null
): boolean {
  const s1 = new Date(start1)
  const e1 = end1 ? new Date(end1) : new Date(start1)
  const s2 = new Date(start2)
  const e2 = end2 ? new Date(end2) : new Date(start2)
  
  // Ranges overlap if: start1 <= end2 AND end1 >= start2
  return s1 <= e2 && e1 >= s2
}

/**
 * GET /api/coaches/blocked-dates
 * 
 * Returns all blocked dates/ranges for the authenticated coach.
 */
export async function GET(): Promise<NextResponse<{ blocked_dates: BlockedDateResponse[] } | { error: string }>> {
  try {
    const supabase = await createClient()
    
    const { context, error: authError } = await requireCoachContextOrCreate(supabase)
    if (authError) return authError
    const { coachProfile } = context

    // 4. Fetch blocked dates
    const { data: blockedDates, error: blockedError } = await supabase
      .from('blocked_dates')
      .select('id, blocked_date, blocked_date_end, label, reason, created_at')
      .eq('coach_profile_id', coachProfile.id)
      .order('blocked_date', { ascending: true })

    if (blockedError) {
      console.error('[GET /api/coaches/blocked-dates] fetch error:', blockedError)
      return NextResponse.json({ error: 'Failed to fetch blocked dates' }, { status: 500 })
    }

    // 5. Build response
    const response: BlockedDateResponse[] = (blockedDates || []).map((block) => ({
      id: block.id,
      blocked_date: block.blocked_date,
      blocked_date_end: block.blocked_date_end,
      label: block.label,
      reason: block.reason,
      is_range: block.blocked_date_end !== null,
      days_blocked: calculateDaysBlocked(block.blocked_date, block.blocked_date_end),
      created_at: block.created_at,
    }))

    return NextResponse.json({ blocked_dates: response }, { status: 200 })

  } catch (error) {
    console.error('[GET /api/coaches/blocked-dates]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/coaches/blocked-dates
 * 
 * Block a single date or date range with overlap validation.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<BlockedDateResponse | { error: string; details?: unknown; conflicting_block_id?: string; message?: string }>> {
  try {
    const supabase = await createClient()
    
    const { context, error: authError } = await requireCoachContextOrCreate(supabase)
    if (authError) return authError
    const { coachProfile } = context

    // 4. Parse and validate body
    const body = await request.json()
    const validationErrors: string[] = []

    if (!body.blocked_date || typeof body.blocked_date !== 'string') {
      validationErrors.push('blocked_date is required and must be a string (ISO date)')
    } else {
      // Validate date format
      const blockedDate = new Date(body.blocked_date)
      if (isNaN(blockedDate.getTime())) {
        validationErrors.push('blocked_date must be a valid ISO date')
      } else {
        // Check if date is today or future
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        blockedDate.setHours(0, 0, 0, 0)
        
        if (blockedDate < today) {
          validationErrors.push('Cannot block dates in the past')
        }
      }
    }

    if (body.blocked_date_end !== undefined && body.blocked_date_end !== null) {
      if (typeof body.blocked_date_end !== 'string') {
        validationErrors.push('blocked_date_end must be a string (ISO date)')
      } else {
        const endDate = new Date(body.blocked_date_end)
        if (isNaN(endDate.getTime())) {
          validationErrors.push('blocked_date_end must be a valid ISO date')
        } else if (body.blocked_date) {
          const startDate = new Date(body.blocked_date)
          if (!isNaN(startDate.getTime()) && endDate < startDate) {
            validationErrors.push('blocked_date_end must be >= blocked_date')
          }

          // Check max range (365 days)
          const diffTime = endDate.getTime() - startDate.getTime()
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          if (diffDays > 365) {
            validationErrors.push('Maximum range is 365 days')
          }
        }
      }
    }

    if (body.label !== undefined && body.label !== null) {
      if (typeof body.label !== 'string') {
        validationErrors.push('label must be a string')
      } else if (body.label.length > 100) {
        validationErrors.push('label must be 100 characters or less')
      }
    }

    if (body.reason !== undefined && body.reason !== null) {
      if (typeof body.reason !== 'string') {
        validationErrors.push('reason must be a string')
      } else if (body.reason.length > 500) {
        validationErrors.push('reason must be 500 characters or less')
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // 5. Overlap check
    const { data: existingBlocks, error: existingError } = await supabase
      .from('blocked_dates')
      .select('id, blocked_date, blocked_date_end, label')
      .eq('coach_profile_id', coachProfile.id)

    if (existingError) {
      console.error('[POST /api/coaches/blocked-dates] existing blocks error:', existingError)
      return NextResponse.json({ error: 'Failed to check for overlaps' }, { status: 500 })
    }

    // Check for overlaps
    if (existingBlocks && existingBlocks.length > 0) {
      for (const existing of existingBlocks) {
        if (rangesOverlap(
          body.blocked_date,
          body.blocked_date_end || null,
          existing.blocked_date,
          existing.blocked_date_end
        )) {
          // Format dates for message
          const formatDate = (date: string) => {
            const d = new Date(date)
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          }

          const existingStart = formatDate(existing.blocked_date)
          const existingEnd = existing.blocked_date_end ? formatDate(existing.blocked_date_end) : existingStart
          const dateRange = existing.blocked_date_end 
            ? `${existingStart} – ${existingEnd}`
            : existingStart
          const labelPart = existing.label ? ` (${existing.label})` : ''

          return NextResponse.json(
            {
              error: 'Date conflict',
              message: `These dates overlap with an existing blocked period: ${dateRange}${labelPart}`,
              conflicting_block_id: existing.id,
            },
            { status: 409 }
          )
        }
      }
    }

    // 6. Insert blocked date
    const insertData: {
      coach_profile_id: string
      blocked_date: string
      blocked_date_end?: string | null
      label?: string | null
      reason?: string | null
    } = {
      coach_profile_id: coachProfile.id,
      blocked_date: body.blocked_date,
    }

    if (body.blocked_date_end !== undefined) {
      insertData.blocked_date_end = body.blocked_date_end
    }

    if (body.label !== undefined) {
      insertData.label = body.label
    }

    if (body.reason !== undefined) {
      insertData.reason = body.reason
    }

    const { data: newBlock, error: insertError } = await supabase
      .from('blocked_dates')
      .insert(insertData)
      .select('id, blocked_date, blocked_date_end, label, reason, created_at')
      .single()

    if (insertError) {
      console.error('[POST /api/coaches/blocked-dates] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to add blocked date' }, { status: 500 })
    }

    // 7. Build response
    const response: BlockedDateResponse = {
      id: newBlock.id,
      blocked_date: newBlock.blocked_date,
      blocked_date_end: newBlock.blocked_date_end,
      label: newBlock.label,
      reason: newBlock.reason,
      is_range: newBlock.blocked_date_end !== null,
      days_blocked: calculateDaysBlocked(newBlock.blocked_date, newBlock.blocked_date_end),
      created_at: newBlock.created_at,
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[POST /api/coaches/blocked-dates]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
