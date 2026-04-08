'use client'

import React from 'react'
import Link from 'next/link'
import { Home, Calendar, BookOpen, User, MoreHorizontal } from 'lucide-react'

export interface CoachBottomNavProps {
  activePath: string
  pendingBookingsCount?: number
}

interface NavTab {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  showBadge?: boolean
}

/**
 * CoachBottomNav
 *
 * Mobile bottom navigation for coach screens.
 */
export function CoachBottomNav({ activePath, pendingBookingsCount = 0 }: CoachBottomNavProps) {
  const tabs: NavTab[] = [
    { label: 'Home', href: '/coach/dashboard', icon: Home },
    { label: 'Schedule', href: '/coach/schedule', icon: Calendar },
    {
      label: 'Bookings',
      href: '/coach/bookings',
      icon: BookOpen,
      showBadge: pendingBookingsCount > 0,
    },
    { label: 'Profile', href: '/coach/profile', icon: User },
    { label: 'More', href: '/coach/more', icon: MoreHorizontal },
  ]

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-100 z-40"
      style={{ height: 64, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-full">
        {tabs.map((tab) => {
          const isActive = activePath === tab.href
          const Icon = tab.icon

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                'flex flex-col items-center justify-center flex-1 h-full relative transition-colors',
                isActive ? 'text-brand-600' : 'text-neutral-400',
              ].join(' ')}
            >
              {isActive ? (
                <div
                  className="absolute top-0 left-0 right-0 bg-brand-600"
                  style={{ height: 2 }}
                />
              ) : null}
              <div className="relative">
                <Icon size={24} />
                {tab.showBadge && pendingBookingsCount > 0 ? (
                  <span
                    className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 bg-danger text-white text-[10px] font-semibold rounded-full"
                    style={{ fontSize: 10 }}
                  >
                    {pendingBookingsCount > 9 ? '9+' : pendingBookingsCount}
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
