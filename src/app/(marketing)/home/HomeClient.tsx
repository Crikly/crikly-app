'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ShieldCheck, Clock, CreditCard, Zap, MapPin, Camera, Plus } from 'lucide-react'
import { ForCoachesBar } from '@/components/marketing/ForCoachesBar'
import { ComingSoonModal } from '@/components/marketing/ComingSoonModal'
import { AuthModal } from '@/components/marketing/AuthModal'

const CYCLE_WORDS = [
  'cricket coach',
  'junior cricket coach',
  'weekend cricket coaching',
  '1-to-1 cricket coach',
  "women's cricket coach",
]

const SPORT_COLORS: Record<string, { bg: string; fg: string }> = {
  Cricket:       { bg: '#F0FDFE', fg: '#164E63' },
  Football:      { bg: '#EFF6FF', fg: '#1E3A5F' },
  Tennis:        { bg: '#FEF3C7', fg: '#92400E' },
  Swimming:      { bg: '#DBEAFE', fg: '#1E40AF' },
  Yoga:          { bg: '#F3EFFE', fg: '#5B21B6' },
  'Martial arts':{ bg: '#FEF0E6', fg: '#9A3412' },
  Art:           { bg: '#FDE8F0', fg: '#831843' },
}

const HOW_STEPS = [
  {
    num: '01',
    title: 'Find',
    body: 'Search by sport, location, or name. Filter by DBS, price, and availability.',
  },
  {
    num: '02',
    title: 'Book',
    body: 'Pick a time slot and pay securely online. Instant confirmation, no back and forth.',
  },
  {
    num: '03',
    title: 'Play',
    body: 'Show up and focus on the game. We handle scheduling, payments, and admin.',
  },
]

const TRUST = [
  { Icon: ShieldCheck, label: 'DBS', desc: 'Verified coaches' },
  { Icon: Clock, label: '48hr', desc: 'Free cancellation' },
  { Icon: CreditCard, label: 'Secure', desc: 'Stripe payments' },
  { Icon: Zap, label: 'Instant', desc: 'Online booking' },
]

interface Props {
  sports: { id: string; name: string }[]
}

export function HomeClient({ sports }: Props) {
  const router = useRouter()
  const [cycleIdx, setCycleIdx] = useState(0)
  const [cycleOut, setCycleOut] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [bookingCtx, setBookingCtx] = useState<{ coachSlug: string; selectedSlot?: string } | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  // Cycling headline animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCycleOut(true)
      setTimeout(() => {
        setCycleIdx(i => (i + 1) % CYCLE_WORDS.length)
        setCycleOut(false)
      }, 350)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  function handleSearch() {
    const q = searchQuery.trim()
    if (!q) return
    const params = new URLSearchParams({ q })
    if (activeCategory) params.set('sport', activeCategory)
    router.push(`/coaches?${params.toString()}`)
  }

  function handleHint(q: string) {
    setSearchQuery(q)
    inputRef.current?.focus()
  }

  function handleCategoryPill(name: string) {
    setActiveCategory(prev => (prev === name ? null : name))
  }

  const displaySports = sports.length > 0
    ? sports
    : [
        { id: '1', name: 'Cricket' },
        { id: '2', name: 'Football' },
        { id: '3', name: 'Tennis' },
        { id: '4', name: 'Swimming' },
        { id: '5', name: 'Yoga' },
        { id: '6', name: 'Martial arts' },
        { id: '7', name: 'Art' },
      ]

  const heroTitle = activeCategory
    ? `${activeCategory} coaches near you`
    : `${CYCLE_WORDS[cycleIdx].charAt(0).toUpperCase()}${CYCLE_WORDS[cycleIdx].slice(1)} near you`

  return (
    <>
      {/* ---- Hero ---- */}
      <section
        className="relative text-center overflow-hidden"
        style={{ padding: '96px 24px 88px', isolation: 'isolate' }}
      >
        {/* Background photo */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundColor: '#d9c9a8',
            backgroundImage: 'url(https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=2000&q=80)',
            backgroundSize: 'cover',
            backgroundPosition: 'center 40%',
            zIndex: -2,
          }}
        />
        {/* Veil */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.62) 60%, rgba(255,255,255,0.55) 100%)',
            zIndex: -1,
          }}
        />

        <h1
          className="font-medium m-0 mx-auto"
          style={{
            fontSize: 'clamp(38px, 5vw, 60px)',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            color: '#0F172A',
            marginBottom: '32px',
            maxWidth: '880px',
          }}
        >
          Find a
          <br />
          <span
            style={{
              display: 'inline-block',
              minHeight: '1.2em',
            }}
          >
            <span
              style={{
                color: '#0077CC',
                display: 'inline-block',
                transition: 'opacity 350ms ease-out',
                opacity: cycleOut ? 0 : 1,
              }}
            >
              {CYCLE_WORDS[cycleIdx]}
            </span>
          </span>
          <br />
          near you
        </h1>

        {/* Search bar */}
        <div className="mx-auto" style={{ maxWidth: '580px' }}>
          <div
            className="flex items-center"
            style={{
              border: '1.5px solid #0077CC',
              borderRadius: '999px',
              background: '#fff',
              padding: '6px 6px 6px 20px',
              boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
            }}
          >
            <Search size={18} strokeWidth={2} color="#94A3B8" style={{ marginRight: '12px', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Sport, location, or coach name…"
              className="flex-1 min-w-0 border-none outline-none bg-transparent"
              style={{ height: '48px', fontSize: '15px', color: '#0F172A', fontFamily: 'inherit' }}
            />
            <button
              onClick={handleSearch}
              className="inline-flex items-center font-medium"
              style={{
                height: '48px',
                padding: '0 24px',
                background: '#0077CC',
                color: '#fff',
                border: 'none',
                borderRadius: '999px',
                fontSize: '14px',
                cursor: 'pointer',
                gap: '6px',
                transition: 'background 150ms',
                flexShrink: 0,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#005EA3')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#0077CC')}
            >
              Search
            </button>
          </div>

          <p
            className="m-0 text-center"
            style={{ marginTop: '14px', fontSize: '13px', color: '#64748B' }}
          >
            We&apos;re starting with cricket. More sports coming this year.
          </p>
        </div>
      </section>

      {/* ---- Category pill strip ---- */}
      <div
        className="border-b border-neutral-100"
        style={{ background: '#fff', padding: '18px 0' }}
      >
        <div
          className="mx-auto flex flex-wrap justify-center"
          style={{ maxWidth: '1100px', gap: '8px', padding: '0 24px' }}
        >
          {displaySports.map(sport => {
            const active = activeCategory === sport.name
            return (
              <button
                key={sport.id}
                onClick={() => handleCategoryPill(sport.name)}
                className="inline-flex items-center font-medium whitespace-nowrap"
                style={{
                  height: '38px',
                  padding: '0 16px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  border: active ? '1.5px solid #0077CC' : '1px solid #E2E8F0',
                  background: active ? '#E6F3FB' : '#fff',
                  color: active ? '#0077CC' : '#334155',
                  cursor: 'pointer',
                  gap: '6px',
                  transition: 'all 150ms',
                }}
              >
                {sport.name}
              </button>
            )
          })}
          <button
            onClick={() => router.push('/coaches')}
            className="inline-flex items-center font-medium whitespace-nowrap"
            style={{
              height: '38px',
              padding: '0 16px',
              borderRadius: '999px',
              fontSize: '13px',
              border: '1px solid #E2E8F0',
              background: '#fff',
              color: '#64748B',
              cursor: 'pointer',
              gap: '4px',
              transition: 'all 150ms',
            }}
          >
            <Plus size={13} strokeWidth={2} />
            More
          </button>
        </div>
      </div>

      {/* ---- Trust strip ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-neutral-100">
        {TRUST.map(({ Icon, label, desc }, i) => (
          <div
            key={label}
            className="flex flex-col items-center text-center"
            style={{
              padding: '24px 20px',
              gap: '4px',
              borderRight: i < 3 ? '0.5px solid #F1F5F9' : 'none',
            }}
          >
            <Icon size={22} strokeWidth={1.8} color="#0077CC" style={{ marginBottom: '4px' }} />
            <div className="font-medium" style={{ fontSize: '13px', color: '#0F172A' }}>{label}</div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>{desc}</div>
          </div>
        ))}
      </div>

      {/* ---- Featured coaches ---- */}
      <section
        className="mx-auto"
        style={{ padding: '72px 40px', maxWidth: '1200px' }}
        id="featured"
      >
        <div className="flex items-baseline justify-between" style={{ marginBottom: '28px' }}>
          <h2
            className="font-medium m-0"
            style={{ fontSize: '28px', letterSpacing: '-0.02em', color: '#0F172A' }}
          >
            {heroTitle}
          </h2>
          <button
            onClick={() => setShowComingSoon(true)}
            className="font-medium"
            style={{
              background: 'none',
              border: 'none',
              color: '#0077CC',
              fontSize: '14px',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            See all →
          </button>
        </div>

        {/* Skeleton cards — displayed while we wait for real data in a future iteration */}
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '24px' }}>
          {[0, 1, 2].map(i => (
            <CoachSkeletonCard key={i} />
          ))}
        </div>
      </section>

      {/* ---- Browse by sport ---- */}
      <section className="mx-auto" style={{ padding: '0 40px 72px', maxWidth: '1200px' }}>
        <div className="flex items-baseline justify-between" style={{ marginBottom: '28px' }}>
          <h2
            className="font-medium m-0"
            style={{ fontSize: '28px', letterSpacing: '-0.02em', color: '#0F172A' }}
          >
            Browse by sport &amp; skill
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: '14px' }}>
          {displaySports.map((sport, idx) => {
            const colors = SPORT_COLORS[sport.name] ?? {
              bg: idx % 2 === 0 ? '#F0F9FF' : '#F0FDF4',
              fg: idx % 2 === 0 ? '#0C4A6E' : '#14532D',
            }
            return (
              <button
                key={sport.id}
                onClick={() => router.push(`/coaches?sport=${encodeURIComponent(sport.name)}`)}
                className="flex flex-col cursor-pointer"
                style={{
                  background: colors.bg,
                  border: '1px solid transparent',
                  borderRadius: '14px',
                  padding: '24px 20px',
                  gap: '12px',
                  minHeight: '132px',
                  transition: 'all 200ms cubic-bezier(0.22,1,0.36,1)',
                  textAlign: 'left',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.01)'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = colors.fg
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                  ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'
                }}
              >
                <MapPin size={28} strokeWidth={1.8} color={colors.fg} />
                <div className="font-medium" style={{ fontSize: '15px', color: '#0F172A', letterSpacing: '-0.005em' }}>
                  {sport.name}
                </div>
                <div
                  style={{
                    width: '56px',
                    height: '11px',
                    background: 'rgba(15,23,42,0.06)',
                    borderRadius: '999px',
                    marginTop: 'auto',
                  }}
                />
              </button>
            )
          })}

          {/* More soon tile */}
          <div
            className="flex flex-col"
            style={{
              background: '#fff',
              border: '1.5px dashed #CBD5E1',
              borderRadius: '14px',
              padding: '24px 20px',
              gap: '12px',
              minHeight: '132px',
            }}
          >
            <Plus size={28} strokeWidth={1.8} color="#94A3B8" />
            <div className="font-medium" style={{ fontSize: '15px', color: '#64748B' }}>More soon</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '-4px' }}>Adding sports weekly</div>
          </div>
        </div>
      </section>

      {/* ---- Parent / player value band ---- */}
      <section
        style={{
          background: '#F8FAFC',
          borderTop: '1px solid #F1F5F9',
          borderBottom: '1px solid #F1F5F9',
          padding: '80px 40px',
        }}
      >
        <div className="mx-auto text-center" style={{ maxWidth: '640px' }}>
          <h2
            className="font-medium m-0"
            style={{
              fontSize: 'clamp(24px, 3.5vw, 34px)',
              letterSpacing: '-0.025em',
              color: '#0F172A',
              marginBottom: '20px',
            }}
          >
            Coaching shouldn&apos;t be a guessing game.
          </h2>
          <p
            className="m-0 mx-auto"
            style={{ fontSize: '16px', color: '#475569', lineHeight: 1.65, maxWidth: '560px' }}
          >
            Trying to find a good coach for your child or yourself means asking around the parent
            group chat, hoping someone has a recommendation, then chasing the coach by text to
            confirm times and payment.
          </p>
          <p
            className="m-0 mx-auto"
            style={{ fontSize: '16px', color: '#475569', lineHeight: 1.65, maxWidth: '560px', marginTop: '16px' }}
          >
            Crikly puts verified coaches in front of you, lets you book and pay in one place, and
            stays out of the way.
          </p>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section
        id="how"
        style={{
          background: '#EFF6FF',
          padding: '80px 40px',
          borderTop: '1px solid #F1F5F9',
          borderBottom: '1px solid #F1F5F9',
        }}
      >
        <div className="mx-auto" style={{ maxWidth: '1200px' }}>
          <div className="text-center" style={{ marginBottom: '48px' }}>
            <h2
              className="font-medium m-0"
              style={{ fontSize: '32px', letterSpacing: '-0.025em', color: '#0F172A', marginBottom: '10px' }}
            >
              How Crikly works
            </h2>
            <p
              className="mx-auto m-0"
              style={{ fontSize: '15px', color: '#475569', maxWidth: '480px' }}
            >
              Three steps from &ldquo;I need a coach&rdquo; to &ldquo;we&apos;re playing on Saturday.&rdquo;
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '32px' }}>
            {HOW_STEPS.map(step => (
              <div
                key={step.num}
                style={{
                  background: '#fff',
                  border: '0.5px solid #F1F5F9',
                  borderRadius: '16px',
                  padding: '32px 28px',
                }}
              >
                <div
                  className="font-medium flex items-center"
                  style={{
                    fontSize: '32px',
                    color: '#0077CC',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                    marginBottom: '18px',
                    gap: '10px',
                  }}
                >
                  {step.num}
                  <div style={{ flex: 1, height: '1px', background: '#BFDBFE' }} />
                </div>
                <h3
                  className="font-medium m-0"
                  style={{ fontSize: '19px', color: '#0F172A', letterSpacing: '-0.01em', marginBottom: '8px' }}
                >
                  {step.title}
                </h3>
                <p className="m-0" style={{ fontSize: '14px', color: '#475569', lineHeight: 1.55 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- For coaches bar ---- */}
      <ForCoachesBar />

      <ComingSoonModal isOpen={showComingSoon} onClose={() => setShowComingSoon(false)} />
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultMode="login"
        postAuthAction="booking"
        bookingContext={bookingCtx}
      />
    </>
  )
}

function CoachSkeletonCard() {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid #F1F5F9',
        borderRadius: '14px',
        overflow: 'hidden',
      }}
    >
      {/* Photo skeleton */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{ height: '180px', background: '#F1F5F9' }}
      >
        <Camera size={32} strokeWidth={1.5} color="#CBD5E1" style={{ opacity: 0.55 }} />
        <ShimmerOverlay />
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px 18px' }}>
        <SkeletonLine width="60%" />
        <SkeletonLine width="40%" />
        <SkeletonLine width="75%" />

        <div
          className="flex justify-between items-center"
          style={{
            marginTop: '14px',
            paddingTop: '14px',
            borderTop: '1px solid #F1F5F9',
          }}
        >
          <SkeletonLine width="80px" inline />
          <SkeletonLine width="56px" inline />
        </div>
      </div>
    </div>
  )
}

function SkeletonLine({ width, inline }: { width: string | number; inline?: boolean }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: '12px',
        width,
        background: '#F1F5F9',
        borderRadius: '6px',
        marginBottom: inline ? 0 : '10px',
      }}
    >
      <ShimmerOverlay />
    </div>
  )
}

function ShimmerOverlay() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
        animation: 'shimmer 1.6s ease-out infinite',
      }}
    />
  )
}
