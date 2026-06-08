'use client'

type Role = 'parent' | 'player' | 'coach'

interface RoleCardProps {
  role: Role
  isSelected: boolean
  onSelect: (role: Role) => void
  // AUTH-JOURNEY-01: when true the card is greyed out, not selectable, and
  // shows a "Coming soon" badge instead of the selection radio.
  disabled?: boolean
}

const roleConfig: Record<Role, { name: string; description: string }> = {
  parent: {
    name: "I'm a parent",
    description: 'Book sessions for my child',
  },
  player: {
    name: "I'm a player",
    description: 'Book coaching for myself (16+)',
  },
  coach: {
    name: "I'm a coach",
    description: 'Offer sessions and get paid reliably',
  },
}

const getRoleIcon = (role: Role, isSelected: boolean) => {
  const iconColor = isSelected ? '#0077CC' : '#475569'

  switch (role) {
    case 'parent':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      )
    case 'player':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <circle cx="12" cy="5" r="2"/>
          <path d="M10.6 14l-2.6 7"/>
          <path d="M14 21l-1.4-4"/>
          <path d="M7 14h10l-1-5H8z"/>
          <path d="M8 9l-2 3"/>
          <path d="M16 9l2 3"/>
        </svg>
      )
    case 'coach':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: iconColor }}>
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          <line x1="9" y1="12" x2="15" y2="12"/>
          <line x1="9" y1="16" x2="12" y2="16"/>
        </svg>
      )
  }
}

export function RoleCard({ role, isSelected, onSelect, disabled = false }: RoleCardProps) {
  const config = roleConfig[role]

  return (
    <button
      onClick={() => { if (!disabled) onSelect(role) }}
      type="button"
      data-testid={`role-card-${role}`}
      aria-pressed={isSelected}
      aria-disabled={disabled}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        background: isSelected ? '#E6F3FB' : '#fff',
        border: `1.5px solid ${isSelected ? '#0077CC' : '#E2E8F0'}`,
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
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
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        {getRoleIcon(role, isSelected)}
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

      {disabled ? (
        <span
          style={{
            flexShrink: 0,
            fontSize: '11px',
            fontWeight: 600,
            color: '#64748B',
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: '999px',
            padding: '3px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          Coming soon
        </span>
      ) : (
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
      )}
    </button>
  )
}
