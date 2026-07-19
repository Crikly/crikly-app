'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Clock, User, TrendingUp, Star, CreditCard, Settings, ChevronRight,
} from 'lucide-react'
import { fetchCoachProfileCached } from '@/lib/onboarding-cache'

// BUG-42: mobile hub for every coach surface without a bottom-nav tab of its
// own (Availability, My Profile, Earnings, Reviews, Get Paid, Settings).
// Mirrors the desktop sidebar's Manage/Account clusters and status dots
// (CoachLayoutClient) so the two navigations never disagree about state.

interface MoreMenuItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  // Static amber dot — mirrors the sidebar's Get Paid warningDot.
  warningDot?: boolean
  // Animated status dot — success = profile live, warning = paused.
  pulseDot?: 'success' | 'warning'
  pulseTitle?: string
}

export function CoachMoreMenu() {
  // Same status source as the sidebar pulse dot (BUG-GO-LIVE-PATH): null =
  // unknown, don't render a dot until the fetch resolves to avoid a flash.
  const [profileLive, setProfileLive] = useState<boolean | null>(null)
  const [profilePaused, setProfilePaused] = useState(false)

  useEffect(() => {
    fetchCoachProfileCached()
      .then((p: { is_profile_live?: boolean; is_paused?: boolean } | null) => {
        if (p) {
          setProfileLive(!!p.is_profile_live)
          setProfilePaused(!!p.is_paused)
        }
      })
      .catch(() => {})
  }, [])

  const profilePulse: MoreMenuItem['pulseDot'] =
    profileLive === true && profilePaused
      ? 'warning'
      : profileLive === true
        ? 'success'
        : undefined
  const profilePulseTitle =
    profilePulse === 'warning'
      ? 'Your profile is paused'
      : profilePulse === 'success'
        ? 'Your profile is live'
        : undefined

  const sections: { heading: string; items: MoreMenuItem[] }[] = [
    {
      heading: 'Manage',
      items: [
        { label: 'Availability', href: '/coach/availability', icon: Clock },
        {
          label: 'My Profile',
          href: '/coach/profile/edit',
          icon: User,
          pulseDot: profilePulse,
          pulseTitle: profilePulseTitle,
        },
      ],
    },
    {
      heading: 'Account',
      items: [
        { label: 'Earnings', href: '/coach/earnings', icon: TrendingUp },
        { label: 'Reviews', href: '/coach/reviews', icon: Star },
        { label: 'Get Paid', href: '/coach/get-paid', icon: CreditCard, warningDot: true },
        { label: 'Settings', href: '/coach/settings', icon: Settings },
      ],
    },
  ]

  return (
    <div className="min-h-full px-5 pt-8 pb-10 lg:px-12 lg:pb-20 bg-white">
      <div className="max-w-[600px] mx-auto">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-neutral-900 mb-7">More</h1>

        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <div key={section.heading} className="flex flex-col gap-1.5">
              <div className="px-4 text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-1">
                {section.heading}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="relative flex items-center justify-between px-4 py-3.5 rounded-xl text-neutral-700 font-medium hover:bg-neutral-50 hover:text-neutral-900 transition-all"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="relative">
                        <Icon size={20} />
                        {item.warningDot && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-white" />
                        )}
                      </div>
                      <span className="text-[15px]">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {item.pulseDot && (
                        <span title={item.pulseTitle} className="relative h-2.5 w-2.5">
                          <span
                            className={`absolute inset-0 rounded-full opacity-75 animate-ping ${item.pulseDot === 'success' ? 'bg-green-600' : 'bg-amber-600'}`}
                          />
                          <span
                            className={`absolute inset-px rounded-full ${item.pulseDot === 'success' ? 'bg-green-600' : 'bg-amber-600'}`}
                          />
                        </span>
                      )}
                      <ChevronRight size={18} className="text-neutral-300" />
                    </div>
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
