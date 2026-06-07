'use client'

import React from 'react'
import Link from 'next/link'
import {
  Home,
  Calendar,
  BookOpen,
  Users,
  Clock,
  TrendingUp,
  User,
  CreditCard,
} from 'lucide-react'

import { Avatar } from '@/components/ui/Avatar'
import { SectionLabel } from '@/components/ui/section-label'
import { RoleSwitcher, UserRole } from './RoleSwitcher'

export interface CoachSidebarProps {
  activePath: string
  coachName: string
  coachRole: string
  coachPhotoUrl?: string
  pendingBookingsCount?: number
  hasStripeWarning?: boolean
  onRoleSwitch: () => void
}

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  showBadge?: boolean
  showWarningDot?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

/**
 * CoachSidebar
 *
 * Desktop/web navigation sidebar for coach screens.
 */
export function CoachSidebar({
  activePath,
  coachName,
  coachRole,
  coachPhotoUrl,
  pendingBookingsCount = 0,
  hasStripeWarning = false,
  onRoleSwitch,
}: CoachSidebarProps) {
  const navSections: NavSection[] = [
    {
      label: 'MAIN',
      items: [
        { label: 'Home', href: '/coach/dashboard', icon: Home },
        { label: 'Schedule', href: '/coach/schedule', icon: Calendar },
        {
          label: 'Bookings',
          href: '/coach/bookings',
          icon: BookOpen,
          showBadge: pendingBookingsCount > 0,
        },
        { label: 'Programmes', href: '/coach/programmes', icon: Users },
      ],
    },
    {
      label: 'MANAGE',
      items: [
        { label: 'Availability', href: '/coach/availability', icon: Clock },
        { label: 'Earnings', href: '/coach/earnings', icon: TrendingUp },
        { label: 'My Profile', href: '/coach/profile/edit', icon: User },
      ],
    },
    {
      label: 'ACCOUNT',
      items: [
        {
          label: 'Get Paid',
          href: '/coach/get-paid',
          icon: CreditCard,
          showWarningDot: hasStripeWarning,
        },
      ],
    },
  ]

  return (
    <aside className="w-60 h-full bg-white border-r border-neutral-100 flex flex-col">
      {/* Logo */}
      <Link href="/coach/dashboard" className="flex items-center px-6 py-4" style={{ height: 40 }}>
        <span className="text-xl font-bold text-brand-600" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          Crikly
        </span>
      </Link>

      {/* Profile Block */}
      <div className="px-6 py-4 border-b border-neutral-100">
        <Link href="/coach/dashboard" className="flex items-start gap-3">
          <Avatar src={coachPhotoUrl} name={coachName} size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-neutral-900 truncate">{coachName}</p>
            <p className="text-xs text-neutral-400 truncate">{coachRole}</p>
          </div>
        </Link>
        <div className="mt-2">
          <RoleSwitcher
            activeRole="coach"
            availableRoles={['coach', 'parent'] as UserRole[]}
            onSwitch={onRoleSwitch}
          />
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section, sectionIdx) => (
          <div key={section.label} className={sectionIdx > 0 ? 'mt-6' : ''}>
            <div className="px-6 mb-2">
              <SectionLabel label={section.label} />
            </div>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = activePath === item.href
                const Icon = item.icon

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        'flex items-center gap-3 px-6 py-2.5 text-sm font-medium transition-colors relative',
                        isActive
                          ? 'bg-brand-50 text-brand-600'
                          : 'text-neutral-600 hover:bg-neutral-50',
                      ].join(' ')}
                      style={
                        isActive
                          ? {
                              borderLeft: '3px solid #0077CC',
                              borderTopRightRadius: 8,
                              borderBottomRightRadius: 8,
                            }
                          : {}
                      }
                    >
                      <Icon size={20} className="flex-shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {item.showBadge && pendingBookingsCount > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-danger text-white text-xs font-semibold rounded-full">
                          {pendingBookingsCount}
                        </span>
                      ) : null}
                      {item.showWarningDot ? (
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: '#F59E0B' }}
                          aria-label="Attention required"
                        />
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
