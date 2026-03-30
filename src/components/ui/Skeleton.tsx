interface SkeletonProps {
  className?: string
  lines?: number
}

export function Skeleton({ className = '', lines = 1 }: SkeletonProps) {
  if (lines > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={[
              'skeleton rounded',
              i === lines - 1 ? 'w-3/4' : 'w-full',
              'h-4',
              className,
            ].join(' ')}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={['skeleton rounded', className].join(' ')} />
  )
}
