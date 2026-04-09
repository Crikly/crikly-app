import { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
}

export function Card({ elevated = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={[
        'bg-white dark:bg-neutral-50 rounded-lg p-4',
        elevated
          ? 'shadow-md'
          : 'border border-neutral-100',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
