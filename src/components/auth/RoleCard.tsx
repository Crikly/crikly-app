'use client'

import { ChevronRight, FileCheck, Loader2, User, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { RoleSelectionData } from '@/types/auth'

type Role = RoleSelectionData['role']

// P-04-PREP-01: all three roles are selectable — the AUTH-JOURNEY-01
// "Coming soon" disabled treatment is gone. One tap selects and advances,
// so the card shows a chevron affordance (spinner while its save is in
// flight) instead of a selection radio. Icons match the landing persona
// cards (Users / User / FileCheck).
const roleConfig: Record<Role, { name: string; description: string; Icon: LucideIcon }> = {
  parent: {
    name: "I'm a parent",
    description: "I'm booking for my child",
    Icon: Users,
  },
  player: {
    name: "I'm a player",
    description: "I'm booking for myself (16+)",
    Icon: User,
  },
  coach: {
    name: "I'm a coach",
    description: 'I want to coach on Crikly',
    Icon: FileCheck,
  },
}

interface RoleCardProps {
  role: Role
  onSelect: (role: Role) => void
  // True while this card's tap is being saved — swaps the chevron for a
  // spinner. The form guards against further taps globally.
  isSubmitting?: boolean
}

export function RoleCard({ role, onSelect, isSubmitting = false }: RoleCardProps) {
  const { name, description, Icon } = roleConfig[role]

  return (
    <button
      type="button"
      onClick={() => onSelect(role)}
      data-testid={`role-card-${role}`}
      aria-busy={isSubmitting}
      className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl bg-white p-4 text-left font-sans shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.08)] transition-all hover:shadow-[0_2px_4px_rgba(15,23,42,0.08),0_8px_20px_rgba(15,23,42,0.12)] active:scale-[0.99]"
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600"
        aria-hidden="true"
      >
        <Icon size={22} strokeWidth={1.8} />
      </div>

      <div className="flex-1">
        <p className="text-base font-semibold leading-tight text-gray-900">{name}</p>
        <p className="mt-0.5 text-xs leading-snug text-neutral-600">{description}</p>
      </div>

      {isSubmitting ? (
        <Loader2 size={18} className="shrink-0 animate-spin text-brand-600" aria-hidden="true" />
      ) : (
        <ChevronRight size={18} className="shrink-0 text-neutral-400" aria-hidden="true" />
      )}
    </button>
  )
}
