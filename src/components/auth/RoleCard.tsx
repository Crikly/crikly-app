'use client'

type Role = 'parent' | 'player' | 'coach'

interface RoleCardProps {
  role: Role
  isSelected: boolean
  onSelect: (role: Role) => void
}

const roleConfig: Record<Role, { emoji: string; name: string; description: string }> = {
  parent: {
    emoji: '👨‍👧',
    name: "I'm a parent",
    description: 'Book sessions for my child',
  },
  player: {
    emoji: '🏏',
    name: "I'm a player",
    description: 'Book coaching for myself (16+)',
  },
  coach: {
    emoji: '🎽',
    name: "I'm a coach",
    description: 'Offer sessions and get paid reliably',
  },
}

export function RoleCard({ role, isSelected, onSelect }: RoleCardProps) {
  const config = roleConfig[role]

  return (
    <button
      onClick={() => onSelect(role)}
      type="button"
      data-testid={`role-card-${role}`}
      aria-pressed={isSelected}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        background: isSelected ? '#E6F3FB' : '#fff',
        border: `1.5px solid ${isSelected ? '#0077CC' : '#E2E8F0'}`,
        borderRadius: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          background: isSelected ? '#B5D4F4' : '#F0F7FF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '20px',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {config.emoji}
      </div>

      <div style={{ flex: 1 }}>
        <p style={{
          fontSize: '15px',
          fontWeight: 600,
          color: '#0F172A',
          margin: 0,
          lineHeight: 1.3,
        }}>
          {config.name}
        </p>
        <p style={{
          fontSize: '12px',
          color: '#64748B',
          margin: '2px 0 0',
          lineHeight: 1.4,
        }}>
          {config.description}
        </p>
      </div>

      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          border: `2px solid ${isSelected ? '#0077CC' : '#CBD5E1'}`,
          background: isSelected ? '#0077CC' : 'transparent',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden="true"
      >
        {isSelected && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </button>
  )
}
