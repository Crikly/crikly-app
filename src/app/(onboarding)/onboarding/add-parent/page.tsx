import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shell/AppShell'
import { isShellRole } from '@/components/shell/roles'
import { AddParentModeCard } from '@/components/parent/AddParentModeCard'

// P-04-C (Screen 05): one-screen add-parent onboarding, reached from the
// role pill's "+ Add parent mode". Coach-only entry point: an account that
// already holds parent goes straight to the parent dashboard, and a
// non-coach account has no business here (the pill never links them in, but
// the URL is typeable). Gate order mirrors coach/layout.tsx.

export default async function AddParentPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('id, full_name, avatar_url, terms_accepted_at')
    .eq('auth_user_id', user.id)
    .single()
  if (!userProfile) redirect('/login')

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_profile_id', userProfile.id)
  const roles = (roleRows ?? []).map((row) => row.role).filter(isShellRole)

  if (roles.includes('parent')) redirect('/parent/dashboard')
  if (!roles.includes('coach')) redirect('/dashboard')
  if (!userProfile.terms_accepted_at) redirect('/onboarding/terms')

  // BUG-37: coach chrome shows the public display_name, falling back to the
  // account full_name — same precedence as coach/layout.tsx. The card below
  // deliberately keeps full_name: "Your name" is the account name.
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('display_name')
    .eq('user_profile_id', userProfile.id)
    .maybeSingle()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppShell
        context="coach"
        name={coachProfile?.display_name || userProfile.full_name || ''}
        email={user.email ?? ''}
        avatarUrl={userProfile.avatar_url ?? null}
        activeRole="coach"
        roles={roles}
      />
      <div className="flex flex-1 justify-center px-5 pb-24 pt-10 sm:pt-[72px]">
        <AddParentModeCard initialName={userProfile.full_name || ''} />
      </div>
    </div>
  )
}
