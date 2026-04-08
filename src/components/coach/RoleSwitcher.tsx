import React from 'react'

export type UserRole = 'coach' | 'parent' | 'player'

export interface RoleSwitcherProps {
  activeRole: UserRole
  availableRoles: UserRole[]
  onSwitch: (role: UserRole) => void
}

const roleLabels: Record<UserRole, string> = {
  coach: 'Coach',
  parent: 'Parent',
  player: 'Player',
}

/**
 * RoleSwitcher
 *
 * Pill toggle for switching between available user roles.
 * Renders nothing if only one role is available.
 */
export function RoleSwitcher({ activeRole, availableRoles, onSwitch }: RoleSwitcherProps) {
  if (availableRoles.length <= 1) return null

  return (
    <div className="inline-flex items-center border border-neutral-100 rounded-full h-7 p-0.5">
      {availableRoles.map((role) => {
        const isActive = role === activeRole

        return (
          <button
            key={role}
            type="button"
            onClick={() => onSwitch(role)}
            className={[
              'px-3 h-6 rounded-full text-xs font-medium transition-colors duration-200',
              isActive
                ? 'bg-brand-600 text-white'
                : 'bg-transparent text-neutral-600 hover:text-neutral-900',
            ].join(' ')}
          >
            {roleLabels[role]}
          </button>
        )
      })}
    </div>
  )
}
