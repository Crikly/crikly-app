import React from 'react'

export type StatusChipVariant =
  | 'confirmed'
  | 'pending'
  | 'group'
  | 'full'
  | 'active'
  | 'draft'
  | 'blocked'
  | 'cancelled'
  | 'completed'
  | 'starting-soon'

export interface StatusChipProps {
  variant: StatusChipVariant
  label?: string
  className?: string
}

const statusColours: Record<StatusChipVariant, { backgroundColor: string; color: string; defaultLabel: string }> = {
  confirmed: { backgroundColor: '#E0F6F8', color: '#0099AA', defaultLabel: 'Confirmed' },
  pending: { backgroundColor: '#FEF3C7', color: '#B45309', defaultLabel: 'Pending' },
  group: { backgroundColor: '#E6F3FB', color: '#0077CC', defaultLabel: 'Group' },
  full: { backgroundColor: '#E0F6F8', color: '#0099AA', defaultLabel: 'Full' },
  active: { backgroundColor: '#DCFCE7', color: '#15803D', defaultLabel: 'Active' },
  draft: { backgroundColor: '#F3F4F6', color: '#6B7280', defaultLabel: 'Draft' },
  blocked: { backgroundColor: '#F3F4F6', color: '#6B7280', defaultLabel: 'Blocked' },
  cancelled: { backgroundColor: '#FEE2E2', color: '#B91C1C', defaultLabel: 'Cancelled' },
  completed: { backgroundColor: '#DCFCE7', color: '#15803D', defaultLabel: 'Completed' },
  'starting-soon': { backgroundColor: '#FEF3C7', color: '#B45309', defaultLabel: 'Starting soon' },
}

/**
 * StatusChip
 *
 * A small labelled status pill used throughout coach UI.
 */
export function StatusChip({ variant, label, className = '' }: StatusChipProps) {
  const colours = statusColours[variant]

  return (
    <span
      className={['inline-flex items-center font-medium', className].join(' ')}
      style={{
        backgroundColor: colours.backgroundColor,
        color: colours.color,
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 6,
        padding: '3px 8px',
        lineHeight: '14px',
      }}
    >
      {label ?? colours.defaultLabel}
    </span>
  )
}
