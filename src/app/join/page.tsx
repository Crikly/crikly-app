import { redirect } from 'next/navigation'

// AUTH-JOURNEY-01: /join is retired in favour of /register. Kept as a redirect
// so any external links to /join still resolve. JoinPageClient.tsx is now
// unused but intentionally left in place.
export default function JoinPage() {
  redirect('/register')
}
