import { redirect } from 'next/navigation'

// Server-side redirect — no blank flash before hydration.
// Everyone lands at /splash first.
// The splash page handles the returning-visitor → /home shortcut
// by checking sessionStorage on mount.
export default function RootPage() {
  redirect('/splash')
}
