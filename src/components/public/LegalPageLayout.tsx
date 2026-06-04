import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

// ─── Layout shell ────────────────────────────────────────────────────────────

// Shared shell for the static legal pages (/privacy, /terms, /cookies)
// and /contact. Server component — no hooks, no 'use client'. Nav +
// footer match the /coaches public surface; the main column is narrower
// (max-w-[740px]) for readable long-form content, or widened to
// max-w-[960px] via `wide` for layouts that need more horizontal room
// (e.g. the /contact form's 2-column grid).
export function LegalPageLayout({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-neutral-100 bg-white/80 px-10 py-4 backdrop-blur-[16px] backdrop-saturate-150 max-md:px-[22px]">
        <Link href="/" aria-label="Crikly home" className="no-underline">
          <Image
            src="/logo.png"
            alt="Crikly"
            width={120}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </Link>
        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className="whitespace-nowrap rounded-[10px] px-3.5 py-2.5 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-5 text-[15px] font-medium text-white no-underline transition-all hover:bg-brand-700 active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </header>

      <main
        className={`mx-auto px-10 py-16 max-md:px-[22px] max-md:py-10 ${
          wide ? 'max-w-[960px]' : 'max-w-[740px]'
        }`}
      >
        {children}
      </main>

      <footer className="border-t border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-[740px] items-center justify-between gap-4 px-10 py-[22px] text-xs text-gray-500 max-md:px-[22px]">
          <span>© 2026 Tekly Solutions Ltd. Crikly is a product of Tekly Solutions.</span>
          <span>Made in the UK</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Typography helpers ──────────────────────────────────────────────────────

// Small subcomponents that encode the legal-page typography spec exactly
// once. Each page composes <H1>, <H2>, <P>, <A>, <EffectiveDate> directly
// — keeps the long-form content readable while preventing className drift
// across pages.

export function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">{children}</h1>
  )
}

export function EffectiveDate({ children }: { children: ReactNode }) {
  return <p className="text-sm text-neutral-500 mt-1 mb-10">{children}</p>
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl font-semibold text-gray-900 mt-10 mb-3">{children}</h2>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-base text-neutral-700 leading-relaxed mb-4">{children}</p>
}

// External-only flag opens the link in a new tab with noopener+noreferrer.
// mailto: and same-origin links omit it.
export function A({
  href,
  external = false,
  children,
}: {
  href: string
  external?: boolean
  children: ReactNode
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 underline"
      >
        {children}
      </a>
    )
  }
  return (
    <a href={href} className="text-brand-600 underline">
      {children}
    </a>
  )
}
