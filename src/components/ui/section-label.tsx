import React from 'react'

export interface SectionLabelProps {
  label: string
  className?: string
}

/**
 * SectionLabel
 *
 * Small uppercase label used to denote a section header.
 */
export function SectionLabel({ label, className = '' }: SectionLabelProps) {
  return (
    <span
      className={[
        'text-[11px] font-medium uppercase tracking-[0.05em] text-neutral-400',
        className,
      ].join(' ')}
    >
      {label}
    </span>
  )
}
