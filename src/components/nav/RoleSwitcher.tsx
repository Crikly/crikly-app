'use client'

import { useState } from 'react'
import type { UserRole, UserRoleContext } from '@/types/user'
import { ROLE_CONTEXTS } from '@/types/user'

interface RoleSwitcherProps {
  availableRoles: UserRole[]
  activeRole: UserRole
  onRoleChange?: (role: UserRole) => void
}

export function RoleSwitcher({
  availableRoles,
  activeRole,
  onRoleChange,
}: RoleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const active = ROLE_CONTEXTS[activeRole]

  if (availableRoles.length <= 1) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: '#E6F3FB',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 500,
          color: '#0C447C',
          fontFamily: 'DM Sans, sans-serif',
        }}
        data-testid="role-switcher-single"
      >
        <span aria-hidden="true">{active.emoji}</span>
        <span>{active.label}</span>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }} data-testid="role-switcher">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Current role: ${active.label}. Click to switch.`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: '#E6F3FB',
          border: '1px solid #B5D4F4',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 500,
          color: '#0C447C',
          cursor: 'pointer',
          fontFamily: 'DM Sans, sans-serif',
        }}
      >
        <span aria-hidden="true">{active.emoji}</span>
        <span>{active.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="#0077CC"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Switch role"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '160px',
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.10)',
            overflow: 'hidden',
            zIndex: 50,
          }}
        >
          {availableRoles.map((role) => {
            const ctx: UserRoleContext = ROLE_CONTEXTS[role]
            const isActive = role === activeRole
            return (
              <button
                key={role}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onRoleChange?.(role)
                  setIsOpen(false)
                }}
                data-testid={`role-option-${role}`}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  background: isActive ? '#E6F3FB' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#0C447C' : '#0F172A',
                  textAlign: 'left',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                <span aria-hidden="true">{ctx.emoji}</span>
                <span>{ctx.label}</span>
                {isActive && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    style={{ marginLeft: 'auto' }}
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 7l3 3 6-6"
                      stroke="#0077CC"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
          }}
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
