import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireParentContext } from '@/lib/auth/require-parent'
import {
  CHILD_SELECT,
  UUID_RE,
  serializeChild,
  validateChildWrite,
  verifyActiveSports,
  type ChildResponse,
  type ChildRowWithSports,
} from '@/lib/children/child-api'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type RouteParams = { params: Promise<{ id: string }> }

// Ownership + liveness gate shared by GET/PATCH/DELETE. RLS already blocks
// cross-parent access; the explicit parent_profile_id filter keeps the API
// correct even under a future policy change (defence in depth).
async function fetchOwnedChild(
  supabase: SupabaseServerClient,
  childId: string,
  parentProfileId: string,
): Promise<{ row: ChildRowWithSports | null; dbError: boolean }> {
  const { data, error } = await supabase
    .from('child_profiles')
    .select(CHILD_SELECT)
    .eq('id', childId)
    .eq('parent_profile_id', parentProfileId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) {
    console.error('[/api/children/[id]] child fetch error:', error)
    return { row: null, dbError: true }
  }
  return { row: (data as unknown as ChildRowWithSports) ?? null, dbError: false }
}

/**
 * GET /api/children/[id]
 *
 * One child (with sports), owned by the authenticated parent.
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse<ChildResponse | { error: string }>> {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }

    const supabase = await createClient()
    const { context, error } = await requireParentContext(supabase)
    if (error) return error

    const { row, dbError } = await fetchOwnedChild(supabase, id, context.parentProfile.id)
    if (dbError) {
      return NextResponse.json({ error: 'Failed to load child' }, { status: 500 })
    }
    if (!row) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }

    return NextResponse.json(serializeChild(row), { status: 200 })
  } catch (error) {
    console.error('[GET /api/children/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/children/[id]
 *
 * Partial update. When `sports` is present the child's child_sports rows are
 * replaced (hard-DELETE then insert — junction rows are managed membership,
 * not user content; migration 050). On a failed re-insert the previous rows
 * are restored best-effort so the child never silently loses their sports.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse<ChildResponse | { error: string; details?: string[] }>> {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }

    const supabase = await createClient()
    const { context, error } = await requireParentContext(supabase)
    if (error) return error
    const parentProfileId = context.parentProfile.id

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { input, errors } = validateChildWrite(body, 'update')
    if (errors) {
      return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 })
    }

    const { row: existing, dbError } = await fetchOwnedChild(supabase, id, parentProfileId)
    if (dbError) {
      return NextResponse.json({ error: 'Failed to load child' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }

    if (input.sports !== undefined) {
      const sportsValid = await verifyActiveSports(supabase, input.sports)
      if (!sportsValid) {
        return NextResponse.json(
          { error: 'Validation failed', details: ['one or more sports are not available'] },
          { status: 400 },
        )
      }
    }

    if (Object.keys(input.childFields).length > 0) {
      const { error: updateError } = await supabase
        .from('child_profiles')
        .update({ ...input.childFields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('parent_profile_id', parentProfileId)
      if (updateError) {
        console.error('[PATCH /api/children/[id]] update error:', updateError)
        return NextResponse.json({ error: 'Failed to update child profile' }, { status: 500 })
      }
    }

    if (input.sports !== undefined) {
      const previous = (existing.child_sports ?? []).map((sport) => ({
        child_profile_id: id,
        sport_id: sport.sport_id,
        skill_level: sport.skill_level,
      }))

      const { error: deleteError } = await supabase
        .from('child_sports')
        .delete()
        .eq('child_profile_id', id)
      if (deleteError) {
        console.error('[PATCH /api/children/[id]] child_sports delete error:', deleteError)
        return NextResponse.json({ error: 'Failed to update sports' }, { status: 500 })
      }

      if (input.sports.length > 0) {
        const { error: insertError } = await supabase.from('child_sports').insert(
          input.sports.map((sport) => ({
            child_profile_id: id,
            sport_id: sport.sport_id,
            skill_level: sport.skill_level,
          })),
        )
        if (insertError) {
          console.error('[PATCH /api/children/[id]] child_sports insert error:', insertError)
          if (previous.length > 0) {
            const { error: restoreError } = await supabase
              .from('child_sports')
              .insert(previous)
            if (restoreError) {
              console.error('[PATCH /api/children/[id]] child_sports restore error:', restoreError)
            }
          }
          return NextResponse.json({ error: 'Failed to update sports' }, { status: 500 })
        }
      }
    }

    const { row: updated, dbError: refetchError } = await fetchOwnedChild(
      supabase,
      id,
      parentProfileId,
    )
    if (refetchError || !updated) {
      return NextResponse.json({ error: 'Failed to fetch updated child' }, { status: 500 })
    }

    return NextResponse.json(serializeChild(updated), { status: 200 })
  } catch (error) {
    console.error('[PATCH /api/children/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/children/[id]
 *
 * Soft delete (deleted_at) — platform rule, never hard DELETE user content.
 * child_sports rows are left in place; the child is hidden everywhere by the
 * deleted_at filter and past bookings keep their FK intact.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse<{ success: true } | { error: string }>> {
  try {
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }

    const supabase = await createClient()
    const { context, error } = await requireParentContext(supabase)
    if (error) return error

    const { data: deleted, error: deleteError } = await supabase
      .from('child_profiles')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('parent_profile_id', context.parentProfile.id)
      .is('deleted_at', null)
      .select('id')
    if (deleteError) {
      console.error('[DELETE /api/children/[id]] soft delete error:', deleteError)
      return NextResponse.json({ error: 'Failed to remove child' }, { status: 500 })
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: 'Child not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[DELETE /api/children/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
