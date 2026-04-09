import { ButtonHTMLAttributes, forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-800 disabled:opacity-40',
  secondary: 'bg-transparent text-brand-600 border border-brand-600 hover:bg-brand-50 disabled:opacity-40',
  destructive: 'bg-danger text-white hover:opacity-90 disabled:opacity-40',
  ghost: 'bg-transparent text-neutral-600 hover:bg-neutral-50 disabled:opacity-40',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm:  'h-9 px-4 text-sm',
  md:  'h-btn-mobile md:h-btn-desktop px-6 text-base',
  lg:  'h-14 px-8 text-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex items-center justify-center font-medium rounded-md',
          'transition-all duration-fast active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
          variantClasses[variant],
          sizeClasses[size],
          className,
        ].join(' ')}
        {...props}
      >
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        ) : null}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
