import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, Clock, Mail, Shield } from 'lucide-react'
import { PublicFooter } from '@/components/public/PublicFooter'
import { ContactForm } from './ContactForm'

// CONTACT-02 (S-10 Contact Page redesign): warm-premium contact surface.
// Server component owns metadata + chrome (nav, header band, footer). The
// /contact page no longer fits inside LegalPageLayout's narrow main column
// because the S-10 design has a full-bleed gradient header with the form
// card overlapping into it — so the shell is inlined here. The API route
// at /api/contact/route.ts is untouched (per brief).

export const metadata: Metadata = {
  title: 'Contact — Crikly',
  description:
    'Get in touch with the Crikly team — coaches, parents, partners and more.',
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <ContactHeader />
      <ContactBody />
      <PublicFooter variant="full" />
    </div>
  )
}

// ─── Nav (mirrors LegalPageLayout shape + S-09 middle nav links) ──────────────

function PublicNav() {
  return (
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
      <nav
        aria-label="Primary"
        className="absolute left-1/2 hidden -translate-x-1/2 gap-1.5 md:flex"
      >
        <Link
          href="/#how"
          className="whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
        >
          How it works
        </Link>
        <Link
          href="/#activities"
          className="whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
        >
          Activities
        </Link>
        <Link
          href="/#personas"
          className="whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
        >
          For coaches
        </Link>
      </nav>
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
  )
}

// ─── Header band — brand-soft gradient + teal radial glow ────────────────────

function ContactHeader() {
  return (
    <section className="relative overflow-hidden border-b border-neutral-100 bg-[linear-gradient(180deg,#F0F7FF_0%,#F6FAFE_60%,#ffffff_100%)]">
      {/* Teal radial glow, top-left, bleeds off-canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-40 h-[420px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,153,170,0.16)_0%,rgba(0,153,170,0)_70%)]"
      />
      <div className="relative z-10 mx-auto max-w-[1180px] px-10 pt-[60px] pb-[150px] max-md:px-[22px] max-md:pt-[46px] max-md:pb-[130px]">
        <div className="text-[13px] font-semibold uppercase tracking-[0.05em] text-brand-600">
          Contact
        </div>
        <h1 className="mt-4 max-w-[16ch] text-[clamp(34px,4.4vw,60px)] font-semibold leading-[1.02] tracking-[-0.035em] text-gray-900 [text-wrap:balance]">
          Talk to the Crikly team.
        </h1>
        <p className="mt-4 max-w-[50ch] text-[clamp(16px,1.4vw,19px)] leading-[1.55] text-neutral-600">
          Coach, parent, player or just curious — drop us a line and a real person
          will get back to you. No bots, no ticket queues. We read every message.
        </p>
      </div>
    </section>
  )
}

// ─── Body — 2-col grid pulled into the header band by negative margin ────────

function ContactBody() {
  return (
    <section className="relative z-20">
      <div className="mx-auto -mt-24 grid max-w-[1180px] grid-cols-1 gap-6 px-10 pb-[104px] max-md:px-[22px] max-lg:-mt-[72px] lg:grid-cols-[1.5fr_1fr]">
        <ContactForm />
        <ContactDetailsCard />
      </div>
    </section>
  )
}

// ─── Details card — dark navy gradient, white text ───────────────────────────

function ContactDetailsCard() {
  return (
    <aside className="relative h-full overflow-hidden rounded-3xl bg-[linear-gradient(165deg,#0c447c_0%,#0f172a_100%)] px-9 pb-8 pt-9 text-white shadow-[0_24px_60px_rgba(15,23,42,0.10)] max-md:rounded-xl max-md:px-7 max-md:pb-7 max-md:pt-7 max-lg:order-2">
      {/* Brand-400 radial glow, top-right, bleeds off-canvas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[70px] -top-[70px] h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,rgba(55,138,221,0.5)_0%,rgba(55,138,221,0)_70%)]"
      />
      <div className="relative">
        <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-white/70">
          Other ways to reach us
        </div>
        <h2 className="mb-6 max-w-[18ch] text-[21px] font-semibold leading-[1.25] tracking-[-0.02em] text-white">
          Prefer email? Here&apos;s everything in one place.
        </h2>

        <DetailItem icon={<Mail size={20} strokeWidth={1.8} />} label="Email us">
          <a
            href="mailto:crikly@teklysolutions.com"
            className="text-white no-underline hover:underline hover:underline-offset-[3px]"
          >
            crikly@teklysolutions.com
          </a>
        </DetailItem>

        <DetailItem
          icon={<Clock size={20} strokeWidth={1.8} />}
          label="Response time"
          note="Most messages get a reply much sooner."
        >
          1–2 business days
        </DetailItem>

        <DetailItem
          icon={<Calendar size={20} strokeWidth={1.8} />}
          label="Support hours"
          note="UK time (GMT/BST)."
        >
          Mon–Fri, 9am–6pm
        </DetailItem>

        <div className="mt-6 flex items-center gap-2 border-t border-white/10 pt-5 text-[12.5px] text-white/60">
          <Shield size={14} className="shrink-0 text-white/50" />
          Crikly is a product of Tekly Solutions Ltd · Made in the UK
        </div>
      </div>
    </aside>
  )
}

function DetailItem({
  icon,
  label,
  children,
  note,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
  note?: string
}) {
  return (
    <div className="flex items-start gap-3.5 border-t border-white/10 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-white/10 text-white">
        {icon}
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.04em] text-white/60">
          {label}
        </div>
        <div className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-white">
          {children}
        </div>
        {note && (
          <div className="mt-1 text-[13px] font-normal leading-[1.45] text-white/55">
            {note}
          </div>
        )}
      </div>
    </div>
  )
}

