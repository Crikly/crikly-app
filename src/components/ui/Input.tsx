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
            className="text-xs font-semibold text-[#64748B] uppercase tracking-label"
          >
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={[
            'h-[48px] md:h-[44px] w-full px-[14px]',
            'bg-[#F8FAFC] border rounded-[10px]',
            'text-base text-neutral-900 placeholder:text-neutral-400',
            'transition-colors duration-fast',
            'focus:outline-none focus:border-brand-600 focus:shadow-[0_0_0_3px_rgba(0,119,204,0.18)] focus:bg-white',
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
