import { createClient } from '@/lib/supabase/server'
import { isShellRole } from '@/components/shell/roles'
import {
  CoachesPageClient,
  type AuthedParentShell,
} from './CoachesPageClient'

// BUG-73: thin server wrapper for the /coaches listing. Detects a signed-in
// PARENT server-side (same getUser() → user_profiles → user_roles pattern as
// loadAuthedCheckout on /book/[coachId]) and hands the shell identity to the
// client page, which then renders the parent AppShell and routes coach cards
// to the auth-aware booking flow. Anyone else — anonymous, coach-only,
// player-only (matches the availability page's P-10 behaviour, Lasith
// decision 2) — gets null and the public experience, unchanged.
//
// Detection failure is never fatal: any error degrades to the public page
// with a server-side log. The page content itself still loads client-side
// from /api/public/coaches exactly as before.

export const dynamic = 'force-dynamic'

async function loadAuthedParentShell(): Promise<AuthedParentShell | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url, active_role')
      .eq('auth_user_id', user.id)
      .single()
    if (!profile) return null

    const { data: roleRows } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_profile_id', profile.id)
    const roles = (roleRows ?? []).map((row) => row.role).filter(isShellRole)
    if (!roles.includes('parent')) return null

    return {
      name: profile.full_name || '',
      email: user.email ?? '',
      avatarUrl: profile.avatar_url ?? null,
      // Same pill resolution as parent/layout.tsx: player active_role keeps
      // its pill; anything else shows parent (this branch requires the
      // parent role, so a coach-active multi-role still books as a parent).
      activeRole: profile.active_role === 'player' ? 'player' : 'parent',
      roles,
    }
  } catch (error) {
    console.error('[/coaches] authed-shell detection failed:', error)
    return null
  }
}

export default async function CoachesPage() {
  const authedParent = await loadAuthedParentShell()
  return <CoachesPageClient authedParent={authedParent} />
}
