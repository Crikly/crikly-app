type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps {
  src?: string
  name: string
  size?: AvatarSize
  className?: string
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-avatar-sm h-avatar-sm text-xs',
  md: 'w-avatar-md h-avatar-md text-sm',
  lg: 'w-avatar-lg h-avatar-lg text-xl',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  return (
    <div
      className={[
        'rounded-full flex items-center justify-center',
        'bg-brand-50 text-brand-800 font-medium',
        'overflow-hidden flex-shrink-0',
        sizeClasses[size],
        className,
      ].join(' ')}
      aria-label={name}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  )
}
