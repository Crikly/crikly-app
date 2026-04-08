import React from 'react'

import { Button } from './Button'

export interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

/**
 * EmptyState
 *
 * Centred empty state with optional primary action.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className="text-neutral-400" style={{ width: 48, height: 48 }}>
        {icon}
      </div>
      <h3 className="text-[17px] font-semibold text-neutral-900">{title}</h3>
      <p className="text-[13px] text-neutral-600 max-w-sm">{description}</p>
      {action ? (
        <div className="mt-2">
          <Button variant="primary" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
