'use client'

// S-09 Homepage Redesign — Crikly landing page.
// Translated from the Claude Design handoff bundle (chats 5+6 + S-09 HTML).
// Apple × Airbnb premium-warm system on the existing Crikly DS tokens.
//
// Implementation notes per Lasith's brief:
//   - 'use client' — IntersectionObserver + scroll listener + toast state
//   - next/image for all images, priority on hero
//   - next/link only for /login routes (the brief's CTA contract)
//   - No GSAP — CSS transitions + IntersectionObserver + animation-delay
//   - Cookie consent persisted under 'crikly_cookie_consent' in localStorage
//   - Every non-"Log in" CTA shows the same toast and links to /login

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  FileCheck,
  MapPin,
  Search,
  Users,
  User,
} from 'lucide-react'
import {
  CoachCard,
  CoachCardSkeleton,
  normaliseCoach,
  type Coach,
  type PublicCoachListItem,
} from '@/components/public/CoachCard'
import s from './landing.module.css'

// ─── Data ────────────────────────────────────────────────────────────────────

const CRICKET_PHOTOS = [
  'https://images.unsplash.com/photo-1593766827228-8737b4534aa6?w=700&q=80',
  'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=700&q=80',
  'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=700&q=80',
  'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=700&q=80',
  'https://images.unsplash.com/photo-1607734834519-d8576ae60ea6?w=700&q=80',
]

const COACHES: Coach[] = [
  { name: 'Ravi Kumar', loc: 'The Oval · London', price: '£55', rating: '4.9', reviews: 48, avail: 'Tomorrow, 10am', initials: 'RK', tag: 'Top rated' },
  { name: 'Priya Sharma', loc: 'Edgbaston · Birmingham', price: '£48', rating: '4.8', reviews: 33, avail: 'Today, 5pm', initials: 'PS', tag: 'Instant book' },
  { name: 'Tom Whitfield', loc: 'Headingley · Leeds', price: '£45', rating: '5.0', reviews: 27, avail: 'Sat, 9am', initials: 'TW', tag: 'Top rated' },
  { name: "James O'Connor", loc: 'Old Trafford · Manchester', price: '£52', rating: '4.9', reviews: 61, avail: 'Sun, 11am', initials: 'JO', tag: 'Instant book' },
  { name: 'Aisha Bello', loc: 'Kennington · London', price: '£58', rating: '4.9', reviews: 40, avail: 'Thu, 4pm', initials: 'AB', tag: 'Top rated' },
]

interface Activity {
  name: string
  live: boolean
}

const ACTIVITIES: Activity[] = [
  { name: 'Cricket', live: true },
  { name: 'Football', live: false },
  { name: 'Tennis', live: false },
  { name: 'Swimming', live: false },
  { name: 'Rugby', live: false },
  { name: 'Netball', live: false },
  { name: 'Art', live: false },
  { name: 'Music', live: false },
]

const COOKIE_KEY = 'crikly_cookie_consent'
const CTA_TOAST_MSG = "Coming soon — we'll let you know!"

// ─── Toast hook ──────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((msg: string) => {
    setMessage(msg)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMessage(null), 2600)
  }, [])
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
  return { message, show }
}

// ─── Reveal-on-scroll hook (replaces GSAP ScrollTrigger) ─────────────────────

function useReveal() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(s.revealed)
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -14% 0px' },
    )
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

// ─── Count-up hook (replaces GSAP count-up tween) ────────────────────────────

function useCountUp() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const targets = document.querySelectorAll<HTMLElement>('[data-count]')
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          observer.unobserve(el)
          const target = parseFloat(el.dataset.count ?? '0')
          const prefix = el.dataset.prefix ?? ''
          const suffix = el.dataset.suffix ?? ''
          const start = performance.now()
          const duration = 1400
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - t, 3) // power2.out
            el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`
            if (t < 1) requestAnimationFrame(tick)
            else el.textContent = `${prefix}${Math.round(target)}${suffix}`
          }
          requestAnimationFrame(tick)
        }
      },
      { threshold: 0, rootMargin: '0px 0px -10% 0px' },
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

// ─── Nav scroll hook ─────────────────────────────────────────────────────────

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

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActivityMenu({
  open,
  onPick,
  onLiveToast,
  onSoonToast,
}: {
  open: boolean
  onPick: (name: string) => void
  onLiveToast: () => void
  onSoonToast: (name: string) => void
}) {
  if (!open) return null
  return (
    <div
      role="listbox"
      className="absolute top-full left-0 z-40 mt-3.5 w-[280px] overflow-hidden rounded-2xl border border-neutral-100 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.16)]"
    >
      {ACTIVITIES.map((a) => (
        <button
          key={a.name}
          type="button"
          disabled={!a.live}
          onClick={() => {
            if (a.live) {
              onPick(a.name)
              onLiveToast()
            } else {
              onSoonToast(a.name)
            }
          }}
          className="flex w-full items-center gap-3 rounded-lg border-0 bg-transparent p-2.5 text-left transition-colors hover:enabled:bg-neutral-50 disabled:cursor-default"
        >
          <span
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] ${
              a.live ? 'bg-brand-50 text-brand-600' : 'bg-neutral-50 text-neutral-400'
            }`}
          >
            {a.live ? <Check size={17} strokeWidth={2} /> : <Clock size={17} strokeWidth={2} />}
          </span>
          <span className="flex-1">
            <span
              className={`block text-[15px] font-medium ${a.live ? 'text-gray-900' : 'text-neutral-400'}`}
            >
              {a.name}
            </span>
            {a.live && <span className="block text-[12px] text-gray-500">Available across the UK</span>}
          </span>
          <span
            className={`ml-auto rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
              a.live ? 'bg-teal-50 text-teal-800' : 'bg-neutral-50 text-neutral-400'
            }`}
          >
            {a.live ? 'Live' : 'Soon'}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── The page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter()
  const navScrolled = useNavScroll()
  const { message: toastMessage, show: showToast } = useToast()
  useReveal()
  useCountUp()

  const [activity, setActivity] = useState('Cricket')
  const [menuOpen, setMenuOpen] = useState(false)
  const [location, setLocation] = useState('')
  const [cookieState, setCookieState] = useState<'hidden' | 'visible' | 'dismissed'>('hidden')
  const [liveCoaches, setLiveCoaches] = useState<PublicCoachListItem[]>([])
  const [coachesLoading, setCoachesLoading] = useState(true)
  const activityFieldRef = useRef<HTMLDivElement>(null)

  // CTA shorthand — every non-Log in CTA fires this and falls through to /login.
  const handleCta = useCallback(() => showToast(CTA_TOAST_MSG), [showToast])

  // Click-outside on the activity dropdown.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!activityFieldRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // Cookie banner: show 1.1s after mount unless a prior choice is persisted.
  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIE_KEY)) {
        setCookieState('dismissed')
        return
      }
    } catch {
      /* private mode — show banner as if no prior choice */
    }
    const t = setTimeout(() => setCookieState('visible'), 1100)
    return () => clearTimeout(t)
  }, [])

  // PUB-01: fetch the coach rail data on mount. Fallback to the hardcoded
  // COACHES mock on error or empty result, so the page never looks broken.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/public/coaches?sport=cricket&limit=8')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as { coaches?: PublicCoachListItem[] }
        if (cancelled) return
        setLiveCoaches(json.coaches ?? [])
      } catch (err) {
        // Swallow — fallback render covers it. Surface to console for triage.
        console.error('[landing] coach rail fetch failed; falling back to mock:', err)
        if (!cancelled) setLiveCoaches([])
      } finally {
        if (!cancelled) setCoachesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleCookie = useCallback((choice: 'accept' | 'decline') => {
    try {
      localStorage.setItem(COOKIE_KEY, choice)
    } catch {
      /* private mode — non-critical */
    }
    setCookieState('hidden')
    setTimeout(() => setCookieState('dismissed'), 420)
  }, [])

  // PUB-04: route the hero search. Cricket → /coaches; other sports → toast.
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (activity !== 'Cricket') {
      showToast('Cricket is live — parent booking opens soon.')
      return
    }
    const trimmedLocation = location.trim()
    const url = trimmedLocation
      ? `/coaches?sport=cricket&location=${encodeURIComponent(trimmedLocation)}`
      : '/coaches?sport=cricket'
    router.push(url)
  }

  return (
    <main className="min-h-screen bg-white font-sans text-neutral-900 antialiased">
      {/* ═══ NAV ═════════════════════════════════════════════════════════ */}
      <header
        className={`sticky top-0 z-[60] flex items-center justify-between border-b px-10 py-4 transition-all duration-200 ease-out ${
          navScrolled
            ? 'border-neutral-100 bg-white/80 backdrop-blur-[16px] backdrop-saturate-150'
            : 'border-transparent bg-transparent'
        } max-md:px-[22px]`}
      >
        <a href="#hero" aria-label="Crikly home" className="no-underline">
          <Image
            src="/logo.png"
            alt="Crikly"
            width={120}
            height={32}
            className="h-8 w-auto"
            priority
          />
        </a>
        <nav aria-label="Primary" className="absolute left-1/2 hidden -translate-x-1/2 gap-1.5 md:flex">
          <a
            href="#how"
            className="whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
          >
            How it works
          </a>
          <a
            href="#activities"
            className="whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
          >
            Activities
          </a>
          <a
            href="#personas"
            className="whitespace-nowrap rounded-[10px] px-3.5 py-2 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
          >
            For coaches
          </a>
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
            onClick={handleCta}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-5 text-[15px] font-medium text-white no-underline transition-all hover:bg-brand-700 active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* ═══ HERO ════════════════════════════════════════════════════════ */}
      <section id="hero" className="relative">
        <div className="mx-auto grid max-w-[1180px] items-center gap-14 px-10 pt-[72px] pb-[84px] md:grid-cols-[1.04fr_0.96fr] max-md:px-[22px] max-md:pt-12 max-md:pb-[60px]">
          {/* Copy column */}
          <div>
            <div className={`${s.heroFadeUp} mb-[18px] inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-brand-600`}>
              <span className={`${s.livePulse} inline-block h-2 w-2 rounded-full bg-teal-600`} />
              Now live in the UK · Cricket
            </div>
            <h1 className={`${s.heroH1} mb-5 font-semibold text-gray-900`}>
              {/* Each word fades in with a stagger — replaces GSAP word stagger. */}
              {[
                ['Great', 'coaching,'],
                ['one', 'tap', 'away.'],
              ].map((line, li) => (
                <span key={li} className="block">
                  {line.map((w, wi) => {
                    const totalIndexBefore = li === 0 ? 0 : 2
                    const idx = totalIndexBefore + wi
                    const isAccent = li === 1 && (w === 'one' || w === 'tap')
                    return (
                      <Fragment key={`${li}-${wi}`}>
                        <span
                          className={`${s.heroWord} ${isAccent ? 'text-brand-600' : ''}`}
                          style={{ animationDelay: `${0.18 + idx * 0.045}s` }}
                        >
                          {w}
                        </span>
                        {wi < line.length - 1 ? ' ' : ''}
                      </Fragment>
                    )
                  })}
                </span>
              ))}
            </h1>
            <p
              className={`${s.heroSub} ${s.heroFadeUp} mb-[30px] max-w-[46ch] leading-[1.55] text-neutral-600`}
              style={{ animationDelay: '0.55s' }}
            >
              The instant way to find and book a coach for your child — or for you. Real schedules,
              secure payment, sorted in a tap. Starting with cricket, across the UK.
            </p>

            {/* Search bar */}
            <form
              onSubmit={handleSearch}
              noValidate
              className={`${s.heroFadeUp} flex max-w-[560px] items-stretch rounded-full border border-neutral-100 bg-white p-[7px] shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-all focus-within:border-brand-600 focus-within:shadow-[0_8px_28px_rgba(0,119,204,0.16)] max-[540px]:flex-wrap max-[540px]:rounded-3xl max-[540px]:p-2.5`}
              style={{ animationDelay: '0.7s' }}
            >
              <div ref={activityFieldRef} className="relative flex flex-col justify-center px-4 py-1.5 max-[540px]:basis-full">
                <span className="mb-0.5 cursor-pointer text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500">
                  Activity
                </span>
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex w-full items-center gap-2 border-0 bg-transparent p-0 text-[15px] font-medium text-gray-900 cursor-pointer"
                >
                  <span className="whitespace-nowrap">{activity}</span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                <ActivityMenu
                  open={menuOpen}
                  onPick={(name) => {
                    setActivity(name)
                    setMenuOpen(false)
                  }}
                  onLiveToast={() => showToast('Cricket is live across the UK.')}
                  onSoonToast={(name) => showToast(`${name} is on the way — cricket is live today.`)}
                />
              </div>
              <div className="my-2 w-px self-stretch bg-neutral-100 max-[540px]:hidden" />
              <div className="flex flex-1 flex-col justify-center px-4 py-1.5 min-w-0 max-[540px]:basis-full">
                <label htmlFor="locInput" className="mb-0.5 cursor-pointer text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500">
                  Where
                </label>
                <div className="flex items-center gap-2 text-[15px] font-medium text-gray-900">
                  <MapPin size={16} className="shrink-0 text-gray-500" />
                  <input
                    id="locInput"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Town or postcode"
                    autoComplete="off"
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-[15px] text-gray-900 outline-none placeholder:font-normal placeholder:text-neutral-400"
                  />
                </div>
              </div>
              <button
                type="submit"
                aria-label="Search"
                className="ml-1.5 inline-flex items-center gap-2 self-stretch rounded-full border-0 bg-brand-600 px-[22px] text-[15px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.97] max-[540px]:ml-0 max-[540px]:h-12 max-[540px]:basis-full max-[540px]:justify-center"
              >
                <Search size={18} strokeWidth={2.2} />
                <span>Search</span>
              </button>
            </form>

            <div
              className={`${s.heroFadeUp} mt-[22px] flex flex-wrap gap-x-[22px] gap-y-2`}
              style={{ animationDelay: '0.85s' }}
            >
              {['Instant booking', 'Secure payment', 'Free cancellation'].map((t) => (
                <span key={t} className="inline-flex items-center gap-[7px] text-sm font-medium text-neutral-600">
                  <Check size={15} strokeWidth={2.2} className="text-teal-600" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Visual column — photo + proof cards (split layout default) */}
          <div className="relative max-md:hidden">
            <div className={`${s.heroPhoto} relative overflow-hidden rounded-3xl bg-brand-50 shadow-[0_4px_12px_rgba(0,0,0,0.10)]`}>
              <Image
                src="/hero-coaching.png"
                alt="Cricket coach working with a young player in a practice net"
                fill
                priority
                sizes="(max-width: 880px) 100vw, 50vw"
                quality={90}
                className="object-cover"
              />
            </div>

            <div
              className={`${s.proofIn} absolute -left-6 top-[26px] flex items-center gap-[11px] rounded-[14px] bg-white p-3 px-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)] max-[1080px]:-left-2.5`}
              style={{ animationDelay: '1.05s' }}
            >
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-medium text-brand-800">
                RK
              </div>
              <div>
                <div className="whitespace-nowrap text-sm font-medium text-gray-900">Ravi K. · Cricket</div>
                <div className="mt-0.5 whitespace-nowrap text-xs text-gray-500">
                  <span className="text-amber-700">★</span> 4.9 · 48 reviews
                </div>
              </div>
            </div>

            <div
              className={`${s.proofIn} absolute -right-6 bottom-[30px] flex items-center gap-[11px] rounded-[14px] bg-white p-3 px-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)] max-[1080px]:-right-2.5`}
              style={{ animationDelay: '1.2s' }}
            >
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                <Check size={18} strokeWidth={2} />
              </div>
              <div>
                <div className="whitespace-nowrap text-sm font-medium text-gray-900">Booking confirmed</div>
                <div className="mt-0.5 whitespace-nowrap text-xs text-gray-500">Sat, 10am · The Oval</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TRUST STRIP ═════════════════════════════════════════════════ */}
      <section className="border-y border-neutral-100 bg-neutral-50">
        <div className="mx-auto grid max-w-[1180px] grid-cols-4 gap-8 px-10 py-14 max-md:grid-cols-2 max-md:gap-x-6 max-md:gap-y-7 max-md:px-[22px]">
          {[
            { count: 100, suffix: '%', label: 'Of payment held securely', desc: 'Stripe-powered. Released after the session — no cash changes hands.' },
            { count: 60, prefix: '<', suffix: 's', label: 'To book a session', desc: 'See real availability and confirm in a tap. No phone tag, no deposit chasing.' },
            { count: 48, suffix: 'hr', label: 'Free cancellation window', desc: 'Plans change. Cancel or reschedule free up to 48 hours before.' },
            { count: 100, suffix: '%', label: 'Real, verified reviews', desc: 'Every review comes from a booking that actually happened.' },
          ].map((stat, i) => (
            <div
              key={i}
              data-reveal
              className={`${s.reveal} border-r border-[rgba(15,23,42,0.07)] pr-[18px] last:border-r-0 max-md:[&:nth-child(2)]:border-r-0`}
            >
              <div className={`${s.trustNum} font-semibold text-brand-600`}>
                <span data-count={stat.count} data-prefix={stat.prefix ?? ''} data-suffix={stat.suffix}>
                  {`${stat.prefix ?? ''}0${stat.suffix}`}
                </span>
              </div>
              <div className="mt-2.5 text-[15px] font-semibold text-gray-900">{stat.label}</div>
              <div className="mt-1.5 text-[13px] leading-[1.5] text-neutral-600">{stat.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ PERSONAS ════════════════════════════════════════════════════ */}
      <section id="personas" className="mx-auto max-w-[1180px] px-10 py-[104px] max-md:px-[22px]">
        <div data-reveal className={`${s.reveal} mb-12`}>
          <div className="mb-3.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-brand-600">
            One platform · three ways in
          </div>
          <h2 className={`${s.sectionTitle} max-w-[18ch] font-semibold text-gray-900`}>
            Whoever you are, there&apos;s a clear front door.
          </h2>
        </div>

        <div className="grid grid-cols-3 items-stretch gap-[22px] max-md:grid-cols-1">
          {/* Parent */}
          <article
            data-reveal
            className={`${s.reveal} flex flex-col rounded-[20px] border border-neutral-100 bg-white p-8 transition-all hover:-translate-y-[3px] hover:border-neutral-200`}
          >
            <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-neutral-50 text-brand-600">
              <Users size={24} strokeWidth={1.8} />
            </div>
            <h3 className="mb-2.5 text-[22px] font-semibold tracking-[-0.02em] text-gray-900">I&apos;m a parent</h3>
            <p className="mb-5 text-[15px] leading-[1.55] text-neutral-600">
              Find a coach your child will love and book their week in minutes. See who&apos;s qualified, when they&apos;re free, and what other parents say.
            </p>
            <PersonaList items={['Browse coaches near you', 'Book single sessions or whole programmes', 'Pay once, securely — no cash on the day']} />
            <Link
              href="/login"
              onClick={handleCta}
              className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-brand-600 bg-white text-[15px] font-medium text-brand-600 no-underline transition-all hover:bg-brand-50 active:scale-[0.98]"
            >
              Find a coach for my child
              <ArrowRight size={16} strokeWidth={2.2} />
            </Link>
          </article>

          {/* Player */}
          <article
            data-reveal
            className={`${s.reveal} flex flex-col rounded-[20px] border border-neutral-100 bg-white p-8 transition-all hover:-translate-y-[3px] hover:border-neutral-200`}
          >
            <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-neutral-50 text-brand-600">
              <User size={24} strokeWidth={1.8} />
            </div>
            <h3 className="mb-2.5 text-[22px] font-semibold tracking-[-0.02em] text-gray-900">I&apos;m a player</h3>
            <p className="mb-5 text-[15px] leading-[1.55] text-neutral-600">
              Sharpen your game on your schedule. Book a coach for a one-off session or commit to a block — whatever fits around work and life.
            </p>
            <PersonaList items={['Coaches for every level', 'Evening & weekend availability', 'Reschedule free up to 48 hours before']} />
            <Link
              href="/login"
              onClick={handleCta}
              className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-brand-600 bg-white text-[15px] font-medium text-brand-600 no-underline transition-all hover:bg-brand-50 active:scale-[0.98]"
            >
              Book a session for me
              <ArrowRight size={16} strokeWidth={2.2} />
            </Link>
          </article>

          {/* Coach — the premium one */}
          <article
            data-reveal
            className={`${s.reveal} ${s.coachGradient} relative flex flex-col overflow-hidden rounded-[20px] p-8 text-white`}
          >
            <div className={`${s.coachGlow} pointer-events-none absolute -right-[60px] -top-[60px] h-[240px] w-[240px] rounded-full`} aria-hidden />
            <div className="relative mb-[18px] self-start rounded-full bg-white/[0.14] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-white">
              For coaches
            </div>
            <div className="relative mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-white/[0.12] text-white">
              <FileCheck size={24} strokeWidth={1.8} />
            </div>
            <h3 className="relative mb-2.5 text-[22px] font-semibold tracking-[-0.02em] text-white">I&apos;m a coach</h3>
            <p className="relative mb-5 text-[15px] leading-[1.55] text-white/[0.78]">
              Turn the parents you already coach into a booking machine. Publish your schedule, share one link on WhatsApp, get paid automatically.
            </p>
            <CoachList items={['List free — keep the lion’s share of every booking', 'One link does the chasing for you', 'Payouts straight to your bank via Stripe']} />
            <Link
              href="/login"
              onClick={handleCta}
              className="relative mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-[12px] border-0 bg-white text-[15px] font-medium text-brand-800 no-underline transition-all hover:bg-white/90 active:scale-[0.98]"
            >
              Start coaching on Crikly
              <ArrowRight size={16} strokeWidth={2.2} />
            </Link>
            <div className="relative mt-4 text-xs text-white/[0.55]">
              Built for the coaches who are the heart of the game.
            </div>
          </article>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ════════════════════════════════════════════════ */}
      <section id="how" className="border-y border-neutral-100 bg-neutral-50">
        <div className="mx-auto max-w-[1180px] px-10 pt-[104px] max-md:px-[22px]">
          <div data-reveal className={`${s.reveal} mb-12`}>
            <div className="mb-3.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-brand-600">
              How it works
            </div>
            <h2 className={`${s.sectionTitle} max-w-[18ch] font-semibold text-gray-900`}>
              Booking coaching, finally as easy as it should be.
            </h2>
          </div>
        </div>
        <div className="mx-auto grid max-w-[1180px] grid-cols-3 gap-10 px-10 pb-[104px] max-md:grid-cols-1 max-md:gap-8 max-md:px-[22px]">
          {[
            { n: 1, title: 'Search what they love', copy: 'Tell us the activity and where you are. We show you coaches nearby with real, live availability.' },
            { n: 2, title: 'Book & pay in a tap', copy: 'Pick a slot, pay securely up front. Your spot is confirmed instantly — no deposit calls, no cash.' },
            { n: 3, title: 'Just turn up', copy: 'Get a confirmation and reminders. Show up, play, improve. Reschedule free up to 48 hours before.' },
          ].map((step, idx, arr) => (
            <div key={step.n} data-reveal className={`${s.reveal} relative`}>
              <div className="relative z-[2] mb-[22px] flex h-12 w-12 items-center justify-center rounded-full border border-neutral-100 bg-white text-xl font-semibold text-brand-600">
                {step.n}
              </div>
              {idx < arr.length - 1 && (
                <div
                  aria-hidden
                  className={`${s.stepConnector} absolute left-12 right-[-40px] top-6 h-px max-md:hidden`}
                />
              )}
              <h3 className="mb-2.5 text-xl font-semibold tracking-[-0.02em] text-gray-900">{step.title}</h3>
              <p className="m-0 max-w-[34ch] text-[15px] leading-[1.55] text-neutral-600">{step.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ COACHES RAIL ════════════════════════════════════════════════ */}
      <section id="coaches" className="mx-auto max-w-[1180px] px-10 py-[104px] max-md:px-[22px]">
        <div data-reveal className={`${s.reveal} mb-12 flex items-end justify-between gap-6 max-md:flex-col max-md:items-start max-md:gap-3.5`}>
          <div>
            <div className="mb-3.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-brand-600">
              Cricket coaches near you
            </div>
            <h2 className={`${s.sectionTitle} max-w-[18ch] font-semibold text-gray-900`}>Real coaches. Real pitches.</h2>
          </div>
          <Link
            href="/coaches"
            className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-none border-0 bg-transparent px-1 py-2 text-[15px] font-medium text-brand-600 no-underline transition-all hover:gap-[11px]"
          >
            See all coaches
            <ArrowRight size={16} strokeWidth={2.2} />
          </Link>
        </div>
        <div className={`${s.railScroll} -mx-10 grid auto-cols-[minmax(280px,1fr)] grid-flow-col gap-[22px] overflow-x-auto px-10 pt-1 pb-[18px] max-md:-mx-[22px] max-md:px-[22px]`}>
          {coachesLoading ? (
            // PUB-01: 5 skeletons sized to match CoachCard.
            Array.from({ length: 5 }).map((_, i) => (
              <CoachCardSkeleton key={`skeleton-${i}`} />
            ))
          ) : liveCoaches.length > 0 ? (
            // Live coaches — avatar fallback to CRICKET_PHOTOS; Link to /coaches/{slug}.
            liveCoaches.map((live, i) => {
              const normalised = normaliseCoach(live)
              const photo = live.avatar_url ?? CRICKET_PHOTOS[i % CRICKET_PHOTOS.length]
              return (
                <CoachCard
                  key={`${live.coach_profile_id}-${live.sport_slug}`}
                  coach={normalised}
                  photo={photo}
                  sportName={live.sport_name}
                  href={`/coaches/${live.slug}`}
                />
              )
            })
          ) : (
            // Fallback — mock data with toast click handler.
            COACHES.map((coach, i) => (
              <CoachCard
                key={coach.name}
                coach={coach}
                photo={CRICKET_PHOTOS[i % CRICKET_PHOTOS.length]}
                sportName="cricket"
                onClick={handleCta}
              />
            ))
          )}
        </div>
      </section>

      {/* ═══ ACTIVITIES ROADMAP ══════════════════════════════════════════ */}
      <section id="activities" className="border-t border-neutral-100 bg-neutral-50">
        <div className="mx-auto max-w-[1180px] px-10 pt-[104px] max-md:px-[22px]">
          <div data-reveal className={`${s.reveal} mb-12`}>
            <div className="mb-3.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-brand-600">
              The roadmap
            </div>
            <h2 className={`${s.sectionTitle} max-w-[20ch] font-semibold text-gray-900`}>
              Cricket today. Everything they&apos;re into, next.
            </h2>
            <p className="mt-[18px] max-w-[52ch] text-[17px] leading-[1.55] text-neutral-600">
              We&apos;re starting where we can do it brilliantly. Every activity below is on the way — sports, then art, music and beyond.
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-[1180px] grid-cols-4 gap-4 px-10 max-md:grid-cols-2 max-md:px-[22px]">
          {ACTIVITIES.map((a) => (
            <ActivityCard key={a.name} activity={a} onSoonClick={() => showToast(`${a.name} is on the way — cricket is live today.`)} />
          ))}
        </div>
        <p data-reveal className={`${s.reveal} mx-auto mt-9 flex max-w-[1180px] items-center gap-2 px-10 pb-[104px] text-[13px] text-gray-500 max-md:px-[22px]`}>
          Coach verification, including DBS checks, is rolling out as we grow — safeguarding comes first.
        </p>
      </section>

      {/* ═══ FINAL CTA ═══════════════════════════════════════════════════ */}
      <section className="mx-auto max-w-[1180px] px-10 py-[104px] max-md:px-[22px]">
        <div
          data-reveal
          className={`${s.reveal} ${s.finalGradient} relative overflow-hidden rounded-[28px] px-14 py-20 text-center text-white max-md:px-7 max-md:py-14`}
        >
          <div className={`${s.finalGlow} pointer-events-none absolute -top-[120px] left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full`} aria-hidden />
          <div className="relative z-[2]">
            <div className="mb-3.5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-white/[0.72]">
              Coaches — this one&apos;s for you
            </div>
            <h2 className={`${s.finalTitle} my-3.5 font-semibold text-white`}>
              Your network is already there.
              <br />
              Give them a way to book.
            </h2>
            <p className="mx-auto mb-9 max-w-[52ch] text-lg leading-[1.55] text-white/[0.78]">
              Publish your schedule, share one Crikly link, and let the bookings and payments run themselves. Free to list. Live in minutes.
            </p>
            <div className="flex flex-wrap justify-center gap-3.5">
              <Link
                href="/login"
                onClick={handleCta}
                className="inline-flex h-14 items-center gap-2 rounded-full border-0 bg-brand-600 px-7 text-base font-medium text-white no-underline transition-all hover:bg-brand-700 active:scale-[0.98]"
              >
                Get your Crikly link
                <ArrowRight size={18} strokeWidth={2.2} />
              </Link>
              <Link
                href="/login"
                onClick={handleCta}
                className="inline-flex h-14 items-center gap-2 rounded-full border border-white/[0.28] bg-white/[0.10] px-7 text-base font-medium text-white no-underline transition-all hover:bg-white/[0.18] active:scale-[0.98]"
              >
                I&apos;m looking for a coach
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ══════════════════════════════════════════════════════ */}
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
            <p className="mt-3.5 max-w-[24ch] text-sm text-gray-500">Book a coach. No cash, no admin.</p>
          </div>
          <div className="grid grid-cols-3 gap-8 max-md:gap-4 max-[540px]:grid-cols-1">
            <FooterCol heading="Explore">
              <a href="#hero">Find a coach</a>
              <a href="#how">How it works</a>
              <a href="#activities">Activities</a>
            </FooterCol>
            <FooterCol heading="Coaches">
              <a href="#personas">Become a coach</a>
              <a href="#how">Getting paid</a>
              <span className="flex items-center gap-2 py-1.5 text-sm text-neutral-600">
                Schools &amp; clubs
                <span className="rounded-full bg-neutral-50 px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.04em] text-neutral-400">
                  Coming soon
                </span>
              </span>
            </FooterCol>
            <FooterCol heading="Legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Cookie Policy</a>
              <a href="#">Terms &amp; Conditions</a>
              <a href="#">Contact</a>
            </FooterCol>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 border-t border-neutral-100 px-10 py-[22px] text-xs text-gray-500 max-md:px-[22px] max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2">
          <span>© 2026 Tekly Solutions Ltd. Crikly is a product of Tekly Solutions.</span>
          <span>Made in the UK</span>
        </div>
      </footer>

      {/* ═══ COOKIE BANNER ═══════════════════════════════════════════════ */}
      {cookieState !== 'dismissed' && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          aria-live="polite"
          className={`${s.cookieEnter} ${cookieState === 'visible' ? s.cookieShown : ''} fixed bottom-6 left-6 z-[80] w-[min(440px,calc(100vw-48px))] rounded-[18px] border border-neutral-100 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)]`}
        >
          <div className="mb-1.5 text-[15px] font-semibold text-gray-900">We value your privacy</div>
          <p className="m-0 text-[13px] leading-[1.5] text-neutral-600">
            We use cookies to run Crikly and to understand how it&apos;s used. You choose — accept all, or stick to essentials only. Read our{' '}
            <a href="#" className="font-medium text-brand-600 underline">
              Cookie Policy
            </a>
            .
          </p>
          <div className="mt-[18px] flex gap-2.5 max-[540px]:flex-col">
            <button
              onClick={() => handleCookie('decline')}
              className="h-11 flex-1 cursor-pointer rounded-[11px] border border-neutral-200 bg-white text-sm font-medium text-gray-900 transition-all hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.98]"
            >
              Decline all
            </button>
            <button
              onClick={() => handleCookie('accept')}
              className="h-11 flex-1 cursor-pointer rounded-[11px] border border-neutral-200 bg-white text-sm font-medium text-gray-900 transition-all hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.98]"
            >
              Accept all
            </button>
          </div>
        </div>
      )}

      {/* ═══ TOAST ═══════════════════════════════════════════════════════ */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-7 left-1/2 z-[120] -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-3.5 text-sm font-medium text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)] max-w-[90vw] text-center"
        >
          {toastMessage}
        </div>
      )}
    </main>
  )
}

// ─── Helper components ───────────────────────────────────────────────────────

function PersonaList({ items }: { items: string[] }) {
  return (
    <ul className="m-0 mb-7 flex list-none flex-col gap-2.5 p-0">
      {items.map((item) => (
        <li key={item} className="relative pl-6 text-sm leading-snug text-gray-900">
          <span className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Check size={11} strokeWidth={3} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function CoachList({ items }: { items: string[] }) {
  return (
    <ul className="relative m-0 mb-7 flex list-none flex-col gap-2.5 p-0">
      {items.map((item) => (
        <li key={item} className="relative pl-6 text-sm leading-snug text-white/[0.92]">
          <span className="absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/[0.18] text-white">
            <Check size={11} strokeWidth={3} />
          </span>
          {item}
        </li>
      ))}
    </ul>
  )
}

function FooterCol({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 text-xs font-semibold uppercase tracking-[0.05em] text-gray-500">{heading}</div>
      <div className="[&_a]:block [&_a]:py-1.5 [&_a]:text-sm [&_a]:text-neutral-600 [&_a]:no-underline [&_a]:transition-colors hover:[&_a]:text-gray-900">
        {children}
      </div>
    </div>
  )
}

function ActivityCard({ activity, onSoonClick }: { activity: Activity; onSoonClick: () => void }) {
  if (activity.live) {
    return (
      <div
        data-reveal
        className={`${s.reveal} ${s.liveActivityShadow} relative flex min-h-[138px] flex-col gap-3 rounded-2xl border border-brand-100 bg-white p-5 transition-all hover:-translate-y-[3px] hover:border-brand-600`}
      >
        <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-brand-50 text-brand-600">
          <Check size={22} strokeWidth={1.8} />
        </div>
        <div className="text-base font-semibold text-gray-900">{activity.name}</div>
        <div className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-teal-600">
          <span className="h-[7px] w-[7px] rounded-full bg-teal-600" />
          Live now
        </div>
      </div>
    )
  }
  return (
    <button
      data-reveal
      onClick={onSoonClick}
      className={`${s.reveal} relative flex min-h-[138px] cursor-pointer flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-5 text-left transition-all hover:-translate-y-[3px] hover:border-neutral-200`}
    >
      <div className="flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-neutral-50 text-neutral-400">
        <Clock size={22} strokeWidth={1.8} />
      </div>
      <div className="text-base font-semibold text-gray-900">{activity.name}</div>
      <div className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400">
        Coming soon
      </div>
    </button>
  )
}
