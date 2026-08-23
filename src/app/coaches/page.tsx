import { loadAuthedParentShell } from '@/lib/auth/authed-parent-shell'
import { CoachesPageClient } from './CoachesPageClient'

// BUG-73: thin server wrapper for the /coaches listing. Detects a signed-in
// PARENT server-side and hands the shell identity to the client page, which
// then renders the parent AppShell and routes coach cards to the auth-aware
// booking flow. Anyone else — anonymous, coach-only, player-only — gets null
// and the public experience, unchanged.
//
// BUG-75: the detection loader moved verbatim to
// src/lib/auth/authed-parent-shell.ts so the coach profile page can share it.
// The page content itself still loads client-side from /api/public/coaches
// exactly as before.

export const dynamic = 'force-dynamic'

export default async function CoachesPage() {
  const authedParent = await loadAuthedParentShell()
  return <CoachesPageClient authedParent={authedParent} />
}
