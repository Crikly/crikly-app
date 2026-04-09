import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-neutral-600 uppercase tracking-label"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={[
            'h-input-mobile md:h-input-desktop w-full px-4',
            'bg-neutral-50 border rounded-md',
            'text-base text-neutral-900 placeholder:text-neutral-400',
            'transition-colors duration-fast',
            'focus:outline-none focus:border-brand-600 focus:shadow-focus',
            error
              ? 'border-danger focus:border-danger focus:shadow-none'
              : 'border-neutral-100',
            className,
          ].join(' ')}
          {...props}
        />
        {error ? (
          <span className="text-sm text-danger">{error}</span>
        ) : null}
        {hint && !error ? (
          <span className="text-sm text-neutral-400">{hint}</span>
        ) : null}
      </div>
    )
  }
)
Input.displayName = 'Input'
