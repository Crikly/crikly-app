import React from 'react'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  className?: string
}

/**
 * Toggle
 *
 * A keyboard-accessible on/off switch with label on the left.
 */
export function Toggle({ checked, onChange, label, disabled = false, className = '' }: ToggleProps) {
  const handleToggle = () => {
    if (disabled) return
    onChange(!checked)
  }

  const onTrack = 'bg-brand-600'
  const offTrack = 'bg-neutral-100'

  return (
    <div className={['flex items-center justify-between gap-3', className].join(' ')}>
      <span className="text-sm text-neutral-900">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (disabled) return
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            handleToggle()
          }
        }}
        className={[
          'relative inline-flex items-center flex-shrink-0',
          'w-11 h-6 rounded-full transition-colors duration-200 ease-in-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          checked ? onTrack : offTrack,
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'inline-block w-5 h-5 bg-white rounded-full shadow-sm',
            'transform transition-transform duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
