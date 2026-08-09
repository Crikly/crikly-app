import { Shirt, User, PersonStanding, type LucideIcon } from 'lucide-react'

// P-04-C: shared role metadata for the app shell. One place owns the
// role → icon/label/dashboard mapping so RolePill, AppShell and the
// add-role flows can never drift apart.

export type ShellRole = 'coach' | 'parent' | 'player'

export const SHELL_ROLE_ORDER: ShellRole[] = ['coach', 'parent', 'player']

interface ShellRoleMeta {
  /** Pill label — "Coach" */
  label: string
  /** Dropdown row label — "Coach mode" */
  modeLabel: string
  icon: LucideIcon
  dashboardHref: string
}

export const SHELL_ROLE_META: Record<ShellRole, ShellRoleMeta> = {
  coach: {
    label: 'Coach',
    modeLabel: 'Coach mode',
    icon: Shirt,
    dashboardHref: '/coach/dashboard',
  },
  parent: {
    label: 'Parent',
    modeLabel: 'Parent mode',
    icon: User,
    dashboardHref: '/parent/dashboard',
  },
  player: {
    label: 'Player',
    modeLabel: 'Player mode',
    icon: PersonStanding,
    // Player module routes to the parent dashboard for now (matches
    // src/app/(dashboard)/dashboard/page.tsx).
    dashboardHref: '/parent/dashboard',
  },
}

export function isShellRole(value: string): value is ShellRole {
  return value === 'coach' || value === 'parent' || value === 'player'
}
