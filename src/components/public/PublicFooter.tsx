import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

// CONTACT-02 followup: shared public footer for LegalPageLayout pages and
// /contact. `variant="minimal"` is the copyright row used by /privacy /terms
// /cookies; `variant="full"` is the 3-col Explore / Coaches / Legal stack
// from the landing page footer, used by /contact (and any future public
// page that wants the full chrome). `variant="links"` (P-00c-POLISH) is a
// slim single-row links + copyright footer for the focused public booking
// pages (programme detail, coach availability, guest checkout). Server component.

type Variant = 'minimal' | 'full' | 'links'

export function PublicFooter({ variant = 'minimal' }: { variant?: Variant }) {
  if (variant === 'full') {
    return <FullFooter />
  }
  if (variant === 'links') {
    return <LinksFooter />
  }
  return <MinimalFooter />
}

// ─── Links (slim single-row nav + copyright) ─────────────────────────────────

function LinksFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-gray-500 sm:px-6 md:flex-row md:items-center md:justify-between">
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Site links">
          <Link href="/#how" className="transition-colors hover:text-gray-900">How it works</Link>
          <Link href="/#activities" className="transition-colors hover:text-gray-900">Activities</Link>
          <Link href="/#personas" className="transition-colors hover:text-gray-900">For coaches</Link>
          <Link href="/privacy" className="transition-colors hover:text-gray-900">Privacy Policy</Link>
          <Link href="/terms" className="transition-colors hover:text-gray-900">Terms</Link>
        </nav>
        <span>© 2026 Tekly Solutions Ltd. Crikly is a product of Tekly Solutions.</span>
      </div>
    </footer>
  )
}

// ─── Minimal (copyright row + Made in the UK) ────────────────────────────────

function MinimalFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-white">
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-10 py-[22px] text-xs text-gray-500 max-md:px-[22px] max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2">
        <span>© 2026 Tekly Solutions Ltd. Crikly is a product of Tekly Solutions.</span>
        <span>Made in the UK</span>
      </div>
    </footer>
  )
}

// ─── Full (mirrors landing footer with cross-page /#... anchors) ─────────────

function FullFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-white">
      <div className="mx-auto grid max-w-[1180px] grid-cols-[1.2fr_2fr] gap-12 px-10 pb-10 pt-16 max-md:grid-cols-1 max-md:gap-9 max-md:px-[22px]">
        <div>
          <Image
            src="/logo.png"
            alt="Crikly"
            width={100}
            height={28}
            className="h-7 w-auto"
          />
          <p className="mt-3.5 max-w-[24ch] text-sm text-gray-500">
            Book a coach. No cash, no admin.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8 max-md:gap-4 max-[540px]:grid-cols-1">
          <FooterCol heading="Explore">
            <Link href="/#hero">Find a coach</Link>
            <Link href="/#how">How it works</Link>
            <Link href="/#activities">Activities</Link>
          </FooterCol>
          <FooterCol heading="Coaches">
            <Link href="/#personas">Become a coach</Link>
            <Link href="/#how">Getting paid</Link>
            <span className="flex items-center gap-2 py-1.5 text-sm text-neutral-600">
              Schools &amp; clubs
              <span className="text-[11px] text-neutral-400">· soon</span>
            </span>
          </FooterCol>
          <FooterCol heading="Legal">
            <a href="/privacy">Privacy Policy</a>
            <a href="/cookies">Cookie Policy</a>
            <a href="/terms">Terms &amp; Conditions</a>
            <a href="/contact">Contact</a>
          </FooterCol>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 border-t border-neutral-100 px-10 py-[22px] text-xs text-gray-500 max-md:px-[22px] max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2">
        <span>© 2026 Tekly Solutions Ltd. Crikly is a product of Tekly Solutions.</span>
        <span>Made in the UK</span>
      </div>
    </footer>
  )
}

function FooterCol({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">
        {heading}
      </div>
      <div className="[&_a]:block [&_a]:py-1.5 [&_a]:text-sm [&_a]:text-neutral-600 [&_a]:no-underline [&_a]:transition-colors hover:[&_a]:text-gray-900">
        {children}
      </div>
    </div>
  )
}
