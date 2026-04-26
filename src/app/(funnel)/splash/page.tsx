'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Users, User, ArrowRight } from 'lucide-react'

type Role = 'coach' | 'parent' | 'player'

interface RoleOption {
  role: Role
  label: string
  description: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  href: string
}

const ROLES: RoleOption[] = [
  {
    role: 'coach',
    label: 'Coach',
    description: 'Offer sessions and get paid reliably',
    Icon: ClipboardList,
    href: '/coach-intro',
  },
  {
    role: 'parent',
    label: 'Parent',
    description: 'Book sessions for my child',
    Icon: Users,
    href: '/intro',
  },
  {
    role: 'player',
    label: 'Player',
    description: 'Book coaching for myself (16+)',
    Icon: User,
    href: '/intro',
  },
]

export default function RoleSplashPage() {
  const router = useRouter()
  const [hoveredRole, setHoveredRole] = useState<Role | null>(null)

  function handleSelect(role: Role, href: string) {
    sessionStorage.setItem('crikly_role', role)
    sessionStorage.setItem('crikly_role_selected', 'true')
    router.push(href)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[1080px] text-center">

        {/* Logo */}
        <div
          className="font-bold select-none leading-none"
          style={{
            fontSize: 'clamp(44px, 6vw, 56px)',
            letterSpacing: '-0.035em',
            color: '#0F172A',
            marginBottom: '56px',
          }}
        >
          crikl<span style={{ color: '#0077CC' }}>y</span>
        </div>

        {/* Heading */}
        <h1
          className="font-medium text-[#0F172A] m-0 mb-2"
          style={{ fontSize: 'clamp(24px, 3vw, 28px)', letterSpacing: '-0.02em' }}
        >
          Who are you here as?
        </h1>

        {/* Subheading */}
        <p
          className="text-[14px] text-[#475569] m-0"
          style={{ marginBottom: '56px' }}
        >
          We&apos;ll personalise your experience.
        </p>

        {/* Role cards */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 mx-auto"
          style={{ gap: '20px', maxWidth: '960px' }}
        >
          {ROLES.map(({ role, label, description, Icon, href }) => {
            const hovered = hoveredRole === role
            return (
              <button
                key={role}
                onClick={() => handleSelect(role, href)}
                onMouseEnter={() => setHoveredRole(role)}
                onMouseLeave={() => setHoveredRole(null)}
                className="flex flex-row md:flex-col items-center text-left md:text-center w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0077CC] active:scale-[0.99]"
                style={{
                  background: hovered ? '#E6F3FB' : '#ffffff',
                  border: hovered ? '1.5px solid #0077CC' : '0.5px solid #E2E8F0',
                  borderRadius: '14px',
                  // compensate padding for border thickness change (0.5px → 1.5px = 1px difference)
                  padding: hovered ? '39px 27px 35px' : '40px 28px 36px',
                  gap: '18px',
                  transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                {/* Icon circle */}
                <div
                  className="rounded-full flex items-center justify-center shrink-0 md:mb-6 md:mx-auto"
                  style={{
                    width: 'clamp(60px, 8vw, 88px)',
                    height: 'clamp(60px, 8vw, 88px)',
                    background: hovered ? '#ffffff' : '#E6F3FB',
                    transition: 'background 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <Icon
                    size={44}
                    strokeWidth={1.8}
                    color="#0077CC"
                  />
                </div>

                {/* Text column */}
                <div className="flex-1">
                  <div
                    className="font-medium text-[#0F172A] mb-1.5"
                    style={{ fontSize: 'clamp(17px, 2vw, 20px)', letterSpacing: '-0.01em' }}
                  >
                    {label}
                  </div>
                  <p
                    className="text-[14px] text-[#475569] leading-[1.5] m-0 md:mx-auto"
                    style={{ maxWidth: '220px' }}
                  >
                    {description}
                  </p>
                </div>

                {/* Arrow */}
                <div
                  className="rounded-full flex items-center justify-center shrink-0 md:mt-6 md:mx-auto"
                  style={{
                    width: '36px',
                    height: '36px',
                    background: hovered ? '#0077CC' : 'transparent',
                    border: hovered ? '1px solid #0077CC' : '1px solid #E2E8F0',
                    color: hovered ? '#ffffff' : '#94A3B8',
                    transition: 'all 200ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <ArrowRight size={14} strokeWidth={2} color="currentColor" />
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="text-[12px] text-[#94A3B8] mt-14 m-0">
          You can change this later in your account.
        </p>
      </div>
    </div>
  )
}
