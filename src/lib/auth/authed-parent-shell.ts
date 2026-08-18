import { createClient } from '@/lib/supabase/server'
import { isShellRole, type ShellRole } from '@/components/shell/roles'

// BUG-73/BUG-75: server-side signed-in-PARENT detection for public pages —
// extracted verbatim from src/app/coaches/page.tsx (BUG-73) so the coach
// profile page can share it. Same getUser() → user_profiles → user_roles
// pattern as loadAuthedCheckout on /book/[coachId]; requires the 'parent'
// role. Anyone else — anonymous, coach-only, player-only (availability page
// P-10 behaviour, Lasith ruling) — gets null and the public experience.
//
// Detection failure is never fatal: any error degrades to null (public
// experience) with a server-side log.

/** Server-resolved shell identity for a signed-in parent (subset of the
 *  AppShell identity props — see src/components/shell/AppShell.tsx). */
export interface AuthedParentShell {
  name: string
  email: string
  avatarUrl: string | null
  activeRole: ShellRole
  roles: ShellRole[]
}

export async function loadAuthedParentShell(): Promise<AuthedParentShell | null> {
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
    console.error('[loadAuthedParentShell] detection failed:', error)
    return null
  }
}
