// BUG-59/60: the landing marketing links render in two places — PublicHeader
// (logged out) and the AppShell middle nav (logged in). One shared constant so
// a copy or anchor-id change can never make the two states drift.
export const LANDING_NAV_LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#activities', label: 'Activities' },
  { href: '/#personas', label: 'For coaches' },
] as const
