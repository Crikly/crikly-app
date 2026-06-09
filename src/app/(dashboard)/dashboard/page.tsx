import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Fix-AUDIT-02: the old "You're in" stub (with the logout form that 405'd) is
// removed. /dashboard is now a pure router:
//   - no session            → /login
//   - active_role === coach  → /coach/dashboard
//   - anything else / no role → /onboarding/role (only Coach is supported at
//     launch; /login is avoided here because the proxy bounces an authenticated
//     user from /login back to /dashboard, which would loop).
export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('active_role')
    .eq('auth_user_id', user.id)
    .single()

  if (profile?.active_role === 'coach') {
    redirect('/coach/dashboard')
  }

  redirect('/onboarding/role')
}
