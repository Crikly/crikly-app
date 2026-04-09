import React from 'react'

export interface ProgressBarProps {
  value: number
  colour?: string
  height?: number
  className?: string
}

function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * ProgressBar
 *
 * A simple progress bar with an inline colour override (approved exception).
 */
export function ProgressBar({ value, colour = '#0077CC', height = 4, className = '' }: ProgressBarProps) {
  const clamped = clampPercent(value)

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={['w-full rounded-full bg-neutral-100 overflow-hidden', className].join(' ')}
      style={{ height }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${clamped}%`, backgroundColor: colour }}
      />
    </div>
  )
}
