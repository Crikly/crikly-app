import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCoachContext } from '@/lib/auth/require-coach'
import { PAYOUT_OWED_STATUSES } from '@/types/domain'

/**
 * DELETE /api/coaches/account
 *
 * C-Settings-01-API: irreversibly deletes a coach account.
 *
 * Order (strict):
 *   1. requireCoachContext — auth + role + coach profile
 *   2. Block if upcoming bookings exist (status confirmed/pending_approval, session_date >= today UTC)
 *   3. Block if owed Stripe payouts exist (status pending/processing/held — PAYOUT_OWED_STATUSES)
 *   4. Determine is_only_coach (no other active roles on this user)
 *   5+7. Soft-delete coach_profiles (set deleted_at + clear stripe_onboarding_complete in one UPDATE)
 *   6. Deactivate the 'coach' role on user_roles (is_active=false; preserves audit trail per schema doc L102)
 *   8. If is_only_coach: auth.admin.deleteUser(auth_user_id). BUG-49: failure
 *      is a 500 (BOOKING_HISTORY) — past bookings FK-block the hard delete
 *      (bookings.coach_profile_id is ON DELETE RESTRICT) and the old silent
 *      { success: true } logged the coach out with the account still alive.
 *   9. Return { success: true } only when every step genuinely succeeded
 *
 * Idempotency: a second call hits requireCoachContext, which now 404s on the
 * soft-deleted coach_profiles row. No double-deletion possible.
 *
 * Read-only pre-checks use the regular server client (RLS as defence in depth).
 * Destructive writes use the admin client (bypass RLS — server-side already
 * authenticated and authorised at step 1).
 */
export async function DELETE(): Promise<NextResponse<{ success: true } | { error: string; code?: string }>> {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // 1. Auth + coach context
    const { context, error: authError } = await requireCoachContext(supabase)
    if (authError) return authError
    const { user, userProfile, coachProfile } = context

    // requireCoachContext returns only {id} for coachProfile; we need stripe_account_id
    // to decide whether to clear stripe_onboarding_complete in step 5+7.
    const { data: coachRow, error: coachReadError } = await supabase
      .from('coach_profiles')
      .select('stripe_account_id')
      .eq('id', coachProfile.id)
      .single()
    if (coachReadError) {
      console.error('[DELETE /api/coaches/account] coach_profiles read error:', coachReadError)
      return NextResponse.json({ error: 'Failed to read coach profile' }, { status: 500 })
    }

    // 2. Block on upcoming bookings only — the coach can act on these
    // (cancel/complete), so a 409 with a next step is right. Past-only booking
    // history is NOT blocked here; it surfaces at step 8 instead (BUG-49).
    // session_date is a date column; compare with today's date string (Vercel runs UTC).
    const today = new Date().toISOString().slice(0, 10)
    const { count: upcomingCount, error: upcomingError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)
      .in('status', ['confirmed', 'pending_approval'])
      .gte('session_date', today)
    if (upcomingError) {
      console.error('[DELETE /api/coaches/account] bookings count error:', upcomingError)
      return NextResponse.json({ error: 'Failed to check upcoming bookings' }, { status: 500 })
    }
    if ((upcomingCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'You have upcoming sessions. Please cancel them first.',
          code: 'UPCOMING_BOOKINGS',
        },
        { status: 409 }
      )
    }

    // 3. Block on payouts still owed to the coach.
    // C-PAY-03: 'held' counts alongside 'pending'/'processing' — a held payout
    // is money owed pending Stripe reconnection, so the account must not be
    // deletable while one exists (PAYOUT_OWED_STATUSES, types/domain.ts).
    const { count: pendingPayoutCount, error: payoutError } = await supabase
      .from('payouts')
      .select('id', { count: 'exact', head: true })
      .eq('coach_profile_id', coachProfile.id)
      .in('status', [...PAYOUT_OWED_STATUSES])
    if (payoutError) {
      console.error('[DELETE /api/coaches/account] payouts count error:', payoutError)
      return NextResponse.json({ error: 'Failed to check pending payouts' }, { status: 500 })
    }
    if ((pendingPayoutCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: 'You have pending payouts. Please wait for them to clear.',
          code: 'PENDING_PAYOUTS',
        },
        { status: 409 }
      )
    }

    // 4. is_only_coach — count active non-coach roles.
    // Filter is_active=true so already-deactivated old roles don't falsely keep
    // auth.users alive.
    const { count: otherRoleCount, error: rolesError } = await supabase
      .from('user_roles')
      .select('id', { count: 'exact', head: true })
      .eq('user_profile_id', userProfile.id)
      .neq('role', 'coach')
      .eq('is_active', true)
    if (rolesError) {
      console.error('[DELETE /api/coaches/account] user_roles count error:', rolesError)
      return NextResponse.json({ error: 'Failed to check user roles' }, { status: 500 })
    }
    const isOnlyCoach = (otherRoleCount ?? 0) === 0

    // 5+7. Soft-delete coach_profiles in one UPDATE (atomicity + one fewer round-trip).
    const nowIso = new Date().toISOString()
    const { error: softDeleteError } = await admin
      .from('coach_profiles')
      .update({
        deleted_at: nowIso,
        ...(coachRow.stripe_account_id ? { stripe_onboarding_complete: false } : {}),
        updated_at: nowIso,
      })
      .eq('id', coachProfile.id)
    if (softDeleteError) {
      console.error('[DELETE /api/coaches/account] coach_profiles soft-delete error:', softDeleteError)
      return NextResponse.json({ error: 'Failed to delete coach profile' }, { status: 500 })
    }

    // 6. Deactivate the coach role (preserves audit trail per schema doc Section 2.2 L102:
    // "Can deactivate a role without deleting").
    const { error: roleDeactivateError } = await admin
      .from('user_roles')
      .update({ is_active: false, updated_at: nowIso })
      .eq('user_profile_id', userProfile.id)
      .eq('role', 'coach')
    if (roleDeactivateError) {
      // Profile is already soft-deleted; coach can no longer reach this endpoint
      // (next requireCoachContext will 404 on the deleted coach_profiles row).
      // Log but don't fail — manual cleanup may be needed for the role row.
      console.error('[DELETE /api/coaches/account] user_roles deactivate error:', roleDeactivateError)
    }

    // 8. If only-coach, delete the auth.users row entirely.
    // BUG-49: this hard delete FK-fails for any coach with past bookings — the
    // auth.users → user_profiles → coach_profiles cascade hits
    // bookings.coach_profile_id ON DELETE RESTRICT (booking rows are financial
    // records and must survive). The old code swallowed that error and
    // returned { success: true }: silent 200, client logged the coach out,
    // account still alive. Now any deleteUser failure is a 500 the client
    // surfaces WITHOUT logging out. The coach profile is already soft-deleted
    // at this point (steps 5-7), so the coach surface is gone either way;
    // support (hello@) resolves the remainder manually.
    if (isOnlyCoach) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id)
      if (authDeleteError) {
        console.error('[DELETE /api/coaches/account] auth.admin.deleteUser error:', authDeleteError)
        return NextResponse.json(
          {
            error: 'Your account cannot be fully deleted because it has booking history. Please contact hello@crikly.app for assistance.',
            code: 'BOOKING_HISTORY',
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[DELETE /api/coaches/account]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
