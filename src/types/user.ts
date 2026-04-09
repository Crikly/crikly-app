import type { RoleSelectionData } from '@/types/auth'

export type UserRole = RoleSelectionData['role']

export interface UserRoleContext {
  role: UserRole
  label: string
  emoji: string
}

export const ROLE_CONTEXTS: Record<UserRole, UserRoleContext> = {
  parent: { role: 'parent', label: 'Parent', emoji: '👨‍👧' },
  player: { role: 'player', label: 'Player', emoji: '🏏' },
  coach: { role: 'coach', label: 'Coach', emoji: '🎽' },
}
