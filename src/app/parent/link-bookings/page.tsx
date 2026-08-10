import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { findGuestBookings } from '@/lib/auth/guest-linking'
import { LinkBookingsScreen } from '@/components/parent/LinkBookingsScreen'

// P-04-B (Screen 04): guest-booking link confirmation, reached only from
// TermsAcceptanceForm right after a new parent/player registration when
// unclaimed guest bookings exist for the verified email. Auth/role/terms
// gates come from the parent layout. Matches are re-derived server-side
// here (never trusted from the client); if nothing is left to link —
// including on refresh after a completed link — fall through to the
// dashboard.

export default async function LinkBookingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) redirect('/parent/dashboard')

  let scan: Awaited<ReturnType<typeof findGuestBookings>>
  try {
    scan = await findGuestBookings(user.email)
  } catch (error) {
    // Registration-path surface: degrade to the dashboard, never block.
    console.error('[link-bookings] scan failed:', error)
    redirect('/parent/dashboard')
  }

  if (scan.matches.length === 0) redirect('/parent/dashboard')

  return <LinkBookingsScreen matches={scan.matches} />
}
