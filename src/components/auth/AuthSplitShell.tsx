import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
// Cross-route CSS module import — reuses the landing page's coachGradient
// and coachGlow definitions so the auth left panel and landing "Why Crikly"
// section stay visually identical. Cost: the auth shell would break if
// landing's gradients were renamed. Cheap to deflake by extracting to a
// shared module if a third consumer appears.
import s from '@/app/landing.module.css'

// PUB-03 split-screen shell for /login and /register. Server component.
// Left panel: dark brand gradient + glow + hero photo + tagline + proof
// card. Hidden below lg (1024px). Right panel: back link + centered form
// column (max-w-[400px]).
export function AuthSplitShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* ── Left panel — desktop only ─────────────────────────────── */}
      <aside
        className={`${s.coachGradient} relative hidden flex-col justify-between overflow-hidden lg:flex`}
      >
        {/* Radial glow overlay, bleeds off the right edge. */}
        <div
          className={`${s.coachGlow} pointer-events-none absolute -right-32 top-1/3 h-[520px] w-[520px]`}
          aria-hidden="true"
        />

        {/* Background photo, lowered to opacity-20 so gradient + glow read through. */}
        <Image
          src="/hero-coaching.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 0px"
          className="pointer-events-none object-cover opacity-20"
        />

        {/* Top — white logo */}
        <div className="relative z-10 p-10">
          <Link href="/" aria-label="Crikly home" className="no-underline">
            <Image
              src="/logo.png"
              alt="Crikly"
              width={120}
              height={32}
              className="h-8 w-auto brightness-0 invert"
              priority
            />
          </Link>
        </div>

        {/* Middle — tagline + subtext */}
        <div className="relative z-10 px-10">
          <h2 className="max-w-[18ch] text-[clamp(28px,3vw,40px)] font-semibold leading-[1.06] tracking-[-0.025em] text-white">
            Great coaching, one tap away.
          </h2>
          <p className="mt-3 max-w-[36ch] text-base leading-relaxed text-white/70">
            The instant way to find and book a coach — or become one.
          </p>
        </div>

        {/* Bottom — proof card */}
        <div className="relative z-10 p-10">
          <ProofCard />
        </div>
      </aside>

      {/* ── Right panel — form column ─────────────────────────────── */}
      <section className="flex flex-col bg-white">
        {/* Top — back link + mobile-only logo */}
        <div className="flex items-center justify-between px-6 py-6 lg:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 no-underline transition-colors hover:text-gray-900"
          >
            <ArrowLeft size={16} strokeWidth={2.2} />
            Back to crikly.app
          </Link>
          {/* Mobile-only logo — left panel is hidden below lg. */}
          <Image
            src="/logo.png"
            alt="Crikly"
            width={92}
            height={24}
            className="h-6 w-auto lg:hidden"
            priority
          />
        </div>

        {/* Form column — centered, max-w-[400px] */}
        <div className="flex flex-1 flex-col justify-center px-6 pb-12 lg:px-10">
          <div className="mx-auto w-full max-w-[400px]">{children}</div>
        </div>
      </section>
    </div>
  )
}

// Inline proof card matching the landing hero proof card style — soft white
// scrim over the gradient, initials avatar, star+rating row.
function ProofCard() {
  return (
    <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] p-3.5 backdrop-blur-[8px]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
        RK
      </div>
      <div className="text-white">
        <div className="text-sm font-semibold">Ravi K. · Cricket</div>
        <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-white/70">
          <span className="text-amber-400">★</span> 4.9 · 48 reviews
        </div>
      </div>
    </div>
  )
}
