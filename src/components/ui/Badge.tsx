type BadgeVariant = 'dbs' | 'premium' | 'confirmed' | 'cancelled' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const badgeClasses: Record<BadgeVariant, string> = {
  dbs:       'bg-teal-50 text-teal-800',
  premium:   'bg-brand-50 text-brand-800',
  confirmed: 'bg-green-50 text-green-800',
  cancelled: 'bg-red-50 text-red-800',
  default:   'bg-neutral-100 text-neutral-600',
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5',
        'text-xs font-medium rounded-sm',
        badgeClasses[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
