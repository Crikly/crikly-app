'use client'

// P-00b-Nav: shared public header for parent-facing pages (home, coach profile,
// and any future public page). Extracted from the home page header
// (src/app/page.tsx) so every public page renders one consistent header — no
// drift, no duplication. Owns the transparent→white-on-scroll behaviour
// (useNavScroll) and the auth-aware ProfileDropdown (Log in / Get started for
// visitors; avatar dropdown when signed in). Middle-nav links are absolute
// (/#…) via next/link so they resolve from any page (in-document hash scroll on
// home, client-navigate + scroll from elsewhere), not just the home page.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ProfileDropdown } from '@/components/nav/ProfileDropdown'

function useNavScroll() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

const NAV_LINK_CLASS =
  'whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900'

export function PublicHeader() {
  const navScrolled = useNavScroll()
  return (
    <header
      className={`sticky top-0 z-[60] flex items-center justify-between border-b px-10 py-4 transition-all duration-200 ease-out ${
        navScrolled
          ? 'border-neutral-100 bg-white/80 backdrop-blur-[16px] backdrop-saturate-150'
          : 'border-transparent bg-transparent'
      } max-md:px-[22px]`}
    >
      <Link href="/#hero" aria-label="Crikly home" className="no-underline">
        <Image
          src="/logo.png"
          alt="Crikly"
          width={120}
          height={32}
          className="h-8 w-auto"
          priority
        />
      </Link>
      <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 gap-1.5 md:flex">
        <Link href="/#how" className={NAV_LINK_CLASS}>How it works</Link>
        <Link href="/#activities" className={NAV_LINK_CLASS}>Activities</Link>
        <Link href="/#personas" className={NAV_LINK_CLASS}>For coaches</Link>
      </nav>
      {/* Fix-NAV-01: avatar + dropdown when logged in, Log in / Get started
          buttons when logged out (handled inside the component). */}
      <ProfileDropdown />
    </header>
  )
}
