import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  Star,
  MapPin,
  ShieldCheck,
  Award,
  Clock,
  Users,
  ChevronRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Globe,
  ArrowDown,
} from 'lucide-react'
import { BioExpander } from './_components/BioExpander'
import { PublicHeader } from '@/components/nav/PublicHeader'
import { BookingCard } from './_components/BookingCard'
import { ProgrammesCarousel } from './_components/ProgrammesCarousel'
import { fetchCoachProgrammes } from './_components/_data/programmes'
import { PublicFooter } from '@/components/public/PublicFooter'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoachSport {
  sport_id: string
  sport_name: string
  sport_slug: string
  session_types: string[]
  skill_levels: string[]
  price_individual_pence: number | null
  price_group_pence: number | null
  max_group_size: number | null
  session_duration_minutes: number
  currency: string
}

interface Qualification {
  id: string
  name: string
  issuing_body: string | null
  issued_date: string | null
  expiry_date: string | null
  status: 'active' | 'expired'
  notes: string | null
  certificate_url: string | null
}

interface Photo {
  id: string
  photo_url: string
  is_primary: boolean
  sort_order: number
}

interface AvailabilityTemplate {
  id: string
  sport_id: string | null
  day_of_week: number
  start_time: string
  end_time: string
}

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
}

interface CoachProfile {
  id: string
  slug: string | null
  full_name: string
  bio: string | null
  years_experience: number | null
  location_city: string | null
  location_postcode: string | null
  location_lat: number | null
  location_lng: number | null
  gender: string | null
  languages: string[]
  dbs_status: string
  dbs_verified_at: string | null
  is_featured: boolean
  rating_avg: number | null
  rating_count: number
  sessions_completed: number
  cancellation_window_hours: number
  min_advance_hours: number
  max_advance_days: number
  sports: CoachSport[]
  qualifications: Qualification[]
  photos: Photo[]
  availability: AvailabilityTemplate[]
  reviews: Review[]
}

interface AvailabilityData {
  availability: AvailabilityTemplate[]
  blocked_dates: string[]
  booking_policy: {
    cancellation_window_hours: number
    min_advance_hours: number
    max_advance_days: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pence / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getMinPrice(sports: CoachSport[]): number | null {
  const prices: number[] = []
  for (const s of sports) {
    if (s.price_individual_pence) prices.push(s.price_individual_pence)
    if (s.price_group_pence) prices.push(s.price_group_pence)
  }
  return prices.length > 0 ? Math.min(...prices) : null
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Today'
  if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`
  const years = Math.floor(days / 365)
  return `${years} year${years !== 1 ? 's' : ''} ago`
}


// ─── Data Fetching ────────────────────────────────────────────────────────────

async function fetchCoachProfile(id: string): Promise<CoachProfile | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${id}`, {
    next: { revalidate: 30 },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to fetch coach profile: ${res.status}`)
  return res.json() as Promise<CoachProfile>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchAvailability(id: string): Promise<AvailabilityData | null> {
  if (!UUID_RE.test(id)) return null
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${id}/availability`, {
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json() as Promise<AvailabilityData>
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

// Overrides the inherited "Find a cricket coach — Crikly" title from
// src/app/coaches/layout.tsx so each coach's tab shows their name. The
// description falls back to a generic CTA when the coach hasn't written
// a bio yet, capped at 155 chars to fit the typical search-snippet length.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const coach = await fetchCoachProfile(id)
  if (!coach) {
    return { title: 'Coach not found — Crikly' }
  }
  return {
    title: `${coach.full_name} · Cricket Coach — Crikly`,
    description:
      coach.bio?.slice(0, 155) ?? `Book a session with ${coach.full_name} on Crikly.`,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CoachProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const coach = await fetchCoachProfile(id)
  if (!coach) notFound()

  // P-00c: when reached via the canonical UUID, permanently redirect (308) to the
  // slug URL so all downstream navigation (availability, checkout, back links)
  // inherits the slug, and crawlers attribute link equity to the slug URL.
  if (UUID_RE.test(id) && coach.slug && coach.slug !== id) {
    permanentRedirect(`/coaches/${coach.slug}`)
  }

  const avail = await fetchAvailability(coach.id)
  // P-00b: bookable group programmes (Model A) — separate RLS-respecting fetch,
  // not via the coach API route. Empty array hides the programmes UI entirely.
  const programmes = await fetchCoachProgrammes(coach.id)

  const minPrice = getMinPrice(coach.sports)
  const minProgrammePrice =
    programmes.length > 0 ? Math.min(...programmes.map(p => p.pricePence)) : null
  const fromCandidates = [minPrice, minProgrammePrice].filter((v): v is number => v !== null)
  const mobileFromPence = fromCandidates.length > 0 ? Math.min(...fromCandidates) : null
  const primaryPhoto = coach.photos.find(p => p.is_primary) ?? coach.photos[0] ?? null
  // eslint-disable-next-line react-hooks/purity
  const galleryPhotos = [...coach.photos].sort(() => Math.random() - 0.5).slice(0, 5)

  return (
    <div className="min-h-screen bg-white">
      {/* ── Top nav — shared public header (P-00b-Nav): logo + middle nav +
          auth-aware Log in / Get started. Replaces the old minimal nav. ── */}
      <PublicHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-32 lg:pb-16 pt-6">
        {/* Breadcrumb — desktop only */}
        <nav
          className="hidden lg:flex items-center gap-2 text-sm text-gray-500 mb-6"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-gray-900">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/search" className="hover:text-gray-900">Coaches</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-gray-900 font-medium">{coach.full_name}</span>
        </nav>

        {/* ── Coach name + meta row ───────────────────────────────────────── */}
        {/* P-00b: DM Sans weight-600 (design system) — was Fraunces in the mock. */}
        <div className="mt-6 mb-4">
          <h1 className="text-[34px] font-semibold tracking-tight text-gray-900 leading-tight">
            {coach.full_name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-sm text-gray-700">
            {coach.rating_avg !== null && coach.rating_count > 0 && (
              <>
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="font-bold text-gray-900">{coach.rating_avg.toFixed(1)}</span>
                  <span className="text-gray-500">({coach.rating_count} review{coach.rating_count !== 1 ? 's' : ''})</span>
                </span>
                <span className="text-gray-300">·</span>
              </>
            )}
            {coach.dbs_status === 'verified' && (
              <>
                <span className="flex items-center gap-1 font-semibold text-[#006677]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  DBS verified
                </span>
                <span className="text-gray-300">·</span>
              </>
            )}
            {(coach.location_city || coach.location_postcode) && (
              <span className="flex items-center gap-1 text-gray-500">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                {coach.location_city || coach.location_postcode}
              </span>
            )}
          </div>
        </div>

        {/* ── Hero gallery ────────────────────────────────────────────────── */}
        <HeroGallery photos={galleryPhotos} coachName={coach.full_name} />

        {/* ── Trust row ───────────────────────────────────────────────────── */}
        <TrustRow coach={coach} />

        {/* ── Train with [coach] — primary CTA (P-00b) ────────────────────── */}
        <section aria-labelledby="getstarted-heading" className="mt-9">
          <h2 id="getstarted-heading" className="text-xl font-bold text-gray-900 mb-1">
            Train with {coach.full_name.split(' ')[0]}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Book a private session{programmes.length > 0 ? ', or join one of their group programmes' : ''}.
          </p>
          <div className={`grid gap-4 ${programmes.length > 0 ? 'sm:grid-cols-2' : ''}`}>
            {/* Primary: 1-on-1 */}
            <div className="flex flex-col rounded-2xl border border-gray-200 p-5">
              <h3 className="text-[16px] font-bold text-gray-900">One-to-one coaching</h3>
              <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                Private sessions built around your child. You pick the day and time.
              </p>
              <div className="flex items-center justify-between gap-3 mt-auto pt-5">
                <span className="text-[15px] text-gray-900">
                  {minPrice !== null ? (
                    <>
                      <span className="font-bold">{formatPence(minPrice)}</span>
                      <span className="text-gray-500 text-sm"> / session</span>
                    </>
                  ) : (
                    <span className="text-gray-500 text-sm">Price on request</span>
                  )}
                </span>
                <Link
                  href={`/coaches/${id}/availability`}
                  data-testid="cta-book-1to1"
                  className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 active:scale-[0.99] transition-all"
                >
                  Book a session
                </Link>
              </div>
            </div>

            {/* Secondary: programmes (only when the coach has live programmes) */}
            {programmes.length > 0 && (
              <div className="flex flex-col rounded-2xl border border-gray-200 p-5">
                <h3 className="text-[16px] font-bold text-gray-900">Group programmes</h3>
                <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                  Weekly academies and holiday camps in small groups.
                </p>
                <div className="flex items-center justify-between gap-3 mt-auto pt-5">
                  <span className="text-[15px] text-gray-900">
                    {minProgrammePrice !== null && (
                      <span className="font-bold">From {formatPence(minProgrammePrice)}</span>
                    )}
                  </span>
                  <Link
                    href="#programmes"
                    className="group inline-flex items-center gap-1.5 h-11 px-5 rounded-xl border border-gray-300 text-gray-900 font-semibold text-sm hover:border-brand-600 hover:text-brand-600 transition-colors"
                  >
                    See programmes <ArrowDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-12 items-start mt-10">
          {/* Left — main content */}
          <div className="min-w-0">
            {/* About */}
            {coach.bio && (
              <section aria-labelledby="about-heading">
                <h2 id="about-heading" className="text-xl font-bold text-gray-900 mb-4">
                  About {coach.full_name.split(' ')[0]}
                </h2>
                <div className="flex flex-wrap gap-10">
                  {/* Left — bio */}
                  <div style={{ flex: '1 1 420px' }}>
                    <BioExpander bio={coach.bio} />
                  </div>
                  {/* Right — fact sidebar */}
                  <div style={{ flex: '0 0 260px', minWidth: '220px' }} className="space-y-5">
                    {coach.years_experience !== null && (
                      <div>
                        <p className="text-[12px] uppercase tracking-wide font-semibold text-gray-500">Coaching for</p>
                        <p className="text-[15px] text-gray-900 mt-1">{coach.years_experience} year{coach.years_experience !== 1 ? 's' : ''}</p>
                      </div>
                    )}
                    {coach.languages.length > 0 && (
                      <div>
                        <p className="text-[12px] uppercase tracking-wide font-semibold text-gray-500">Speaks</p>
                        <p className="flex items-center gap-1.5 text-[15px] text-gray-900 mt-1">
                          <Globe className="w-4 h-4 flex-shrink-0 text-gray-400" />
                          {coach.languages.join(', ')}
                        </p>
                      </div>
                    )}
                    {(coach.location_city || coach.location_postcode) && (
                      <div>
                        <p className="text-[12px] uppercase tracking-wide font-semibold text-gray-500">Based in</p>
                        <p className="text-[15px] text-gray-900 mt-1">{coach.location_city || coach.location_postcode}</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Group programmes (P-00b) — only when the coach has live programmes */}
            {programmes.length > 0 && (
              <section id="programmes" aria-labelledby="programmes-heading" className="pt-10 pb-8 border-t border-gray-100">
                <h2 id="programmes-heading" className="text-xl font-bold text-gray-900">
                  Group programmes
                </h2>
                <p className="text-sm text-gray-500 mb-5">
                  Weekly academies and holiday camps. Reserve a spot — payment is held until the first session.
                </p>
                <ProgrammesCarousel programmes={programmes} coachId={coach.id} />
              </section>
            )}

            {/* 1-on-1 Sessions & Pricing */}
            {coach.sports.length > 0 && (
              <section aria-labelledby="sports-heading" className="pt-10 pb-8 border-t border-gray-100">
                <h2 id="sports-heading" className="text-xl font-bold text-gray-900 mb-4">
                  1-on-1 sessions &amp; pricing
                </h2>
                <div className="space-y-4">
                  {coach.sports.map(sport => (
                    <SportCard key={sport.sport_id} sport={sport} />
                  ))}
                </div>
              </section>
            )}

            {/* Qualifications */}
            {coach.qualifications.length > 0 && (
              <section aria-labelledby="quals-heading" className="pt-10 pb-8 border-t border-gray-100">
                <h2 id="quals-heading" className="text-xl font-bold text-gray-900 mb-4">
                  Qualifications
                </h2>
                <div className="space-y-3">
                  {coach.qualifications.map(q => (
                    <QualificationCard key={q.id} qual={q} />
                  ))}
                </div>
              </section>
            )}

            {/* Where I coach */}
            {(coach.location_city || coach.location_postcode) && (
              <section aria-labelledby="location-heading" className="pt-10 pb-8 border-t border-gray-100">
                <h2 id="location-heading" className="text-xl font-bold text-gray-900 mb-4">
                  Where I coach
                </h2>
                <div className="border border-gray-100 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-5 h-5 text-[#0077CC] flex-shrink-0" />
                    <span className="font-semibold text-gray-900">
                      {coach.location_city || coach.location_postcode}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {coach.cancellation_window_hours > 0 && (
                      <span className="bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-600">
                        Free cancellation {coach.cancellation_window_hours}hrs before
                      </span>
                    )}
                    <span className="bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-600">
                      Instant booking confirmation
                    </span>
                    <span className="bg-gray-50 border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-600">
                      Payment held until after first session
                    </span>
                  </div>
                </div>
              </section>
            )}

            {/* Availability */}
            {avail && avail.availability.length > 0 && (
              <section aria-labelledby="availability-heading" className="pt-10 pb-8 border-t border-gray-100">
                <h2 id="availability-heading" className="text-xl font-bold text-gray-900 mb-4">
                  Availability
                </h2>
                <AvailabilityGrid
                  templates={avail.availability}
                  blockedDates={avail.blocked_dates}
                  minAdvanceHours={avail.booking_policy.min_advance_hours}
                />
                {/* P-00b: styled CTA to the full availability page. Use the URL
                    `id` param (not coach.id) so the slug is preserved — a visitor
                    on /coaches/<slug> stays on the slug, not the UUID. The
                    availability route resolves slug-or-UUID via the same API. */}
                <Link
                  href={`/coaches/${id}/availability`}
                  data-testid="view-full-calendar"
                  className="mt-5 flex items-center justify-center gap-2 w-full h-12 rounded-xl border-[1.5px] border-brand-600 text-brand-600 font-semibold hover:bg-brand-50 active:scale-[0.99] transition-all"
                >
                  <CalendarDays className="w-[18px] h-[18px]" />
                  View full calendar
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </section>
            )}

            {/* Reviews */}
            <section aria-labelledby="reviews-heading" className="pt-10 pb-8 border-t border-gray-100">
              <h2 id="reviews-heading" className="text-xl font-bold text-gray-900 mb-4">
                Reviews
              </h2>
              {coach.reviews.length > 0 ? (
                <div className="flex flex-wrap gap-8">
                  <div className="w-[200px] flex-shrink-0">
                    <RatingBreakdown
                      reviews={coach.reviews}
                      avg={coach.rating_avg ?? 0}
                      count={coach.rating_count}
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-4">
                    {coach.reviews.map(review => (
                      <ReviewCard key={review.id} review={review} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-gray-500">No reviews yet.</p>
              )}
            </section>

            {/* Safety */}
            <section aria-labelledby="safety-heading" className="pt-10 pb-8 border-t border-gray-100">
              <h2 id="safety-heading" className="text-xl font-bold text-gray-900 mb-4">
                Safety &amp; Trust
              </h2>
              <SafetySection dbsStatus={coach.dbs_status} dbsVerifiedAt={coach.dbs_verified_at} />
            </section>
          </div>

          {/* Right — desktop booking card */}
          <aside className="hidden lg:block sticky top-24">
            <Suspense fallback={<div className="border border-gray-200 rounded-2xl p-6 h-64 animate-pulse" />}>
              <BookingCard
                coachId={coach.id}
                sports={coach.sports}
                priceFrom={minPrice}
                ratingAvg={coach.rating_avg}
                ratingCount={coach.rating_count}
              />
            </Suspense>
          </aside>
        </div>
      </main>

      {/* ── Site footer (P-00b fix) — shared full footer, matches the listing page ── */}
      <PublicFooter variant="full" />

      {/* ── Mobile sticky booking bar ───────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-4 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <div>
          {mobileFromPence !== null ? (
            <>
              <p className="text-base font-bold text-gray-900 leading-tight">
                From {formatPence(mobileFromPence)}
                <span className="font-normal text-gray-500 text-sm"> / session</span>
              </p>
              <p className="text-[11px] text-gray-500">
                {programmes.length > 0 ? '1-on-1 & group programmes' : '1-on-1 coaching'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">Price on request</p>
          )}
        </div>
        <Link
          href={`/coaches/${id}/availability`}
          className="flex-shrink-0 inline-flex items-center justify-center h-12 px-7 rounded-xl bg-brand-600 text-white font-bold text-sm hover:bg-brand-700 active:scale-[0.98] transition-all shadow-sm"
          data-testid="mobile-book-cta"
        >
          Book a session
        </Link>
      </div>
    </div>
  )
}

// ─── Hero Gallery ─────────────────────────────────────────────────────────────

function HeroGallery({ photos, coachName }: { photos: Photo[]; coachName: string }) {
  const tiles = Array.from({ length: 5 }, (_, i) => photos[i] ?? null)

  const gradient = (i: number) => {
    const gradients = [
      'from-blue-100 to-blue-200',
      'from-teal-100 to-teal-200',
      'from-sky-100 to-sky-200',
      'from-indigo-100 to-indigo-200',
      'from-cyan-100 to-cyan-200',
    ]
    return gradients[i % gradients.length]
  }

  return (
    <div
      className="grid gap-2 overflow-hidden rounded-none -mx-4 sm:-mx-6 sm:rounded-2xl lg:mx-0
        [grid-template-columns:1fr] [grid-template-rows:260px] h-[260px]
        md:[grid-template-columns:1fr_1fr] md:[grid-template-rows:240px_140px] md:h-auto
        lg:[grid-template-columns:2fr_1fr_1fr] lg:[grid-template-rows:220px_220px] lg:h-[440px]"
      data-testid="hero-gallery"
    >
      {tiles.map((photo, i) => {
        const isMain = i === 0
        const hiddenMd = i >= 2 && i < 4
        const hiddenLg = i >= 2

        return (
          <div
            key={i}
            className={[
              'relative overflow-hidden bg-gradient-to-br',
              gradient(i),
              isMain
                ? 'md:[grid-column:1/-1] lg:[grid-column:auto] lg:row-span-2'
                : '',
              // i=1: span full width at md (2-tile tablet layout), revert at lg
              i === 1 ? 'md:[grid-column:1/-1] lg:[grid-column:auto]' : '',
              hiddenLg && i === 2 ? 'hidden lg:block' : '',
              hiddenLg && i === 3 ? 'hidden lg:block' : '',
              i === 4 ? 'hidden lg:block' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {photo ? (
              <Image
                src={photo.photo_url}
                alt={i === 0 ? coachName : `${coachName} photo ${i + 1}`}
                fill
                className="object-cover"
                sizes={
                  i === 0
                    ? '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 66vw'
                    : '(max-width: 1024px) 50vw, 33vw'
                }
                priority={i === 0}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl font-bold text-white/40 select-none">
                  {i === 0 ? coachName.charAt(0) : ''}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Trust Row ────────────────────────────────────────────────────────────────

function TrustRow({ coach }: { coach: CoachProfile }) {
  const stats = [
    coach.dbs_status === 'verified' && {
      icon: <ShieldCheck className="w-[22px] h-[22px] text-[#006677]" />,
      label: 'DBS verified',
      sub: 'Background checked',
    },
    {
      icon: <Star className="w-[22px] h-[22px] text-[#0077CC]" />,
      label: `${coach.sessions_completed} session${coach.sessions_completed !== 1 ? 's' : ''}`,
      sub: 'Completed',
    },
    coach.years_experience !== null && {
      icon: <Clock className="w-[22px] h-[22px] text-[#0077CC]" />,
      label: `${coach.years_experience} year${coach.years_experience !== 1 ? 's' : ''}`,
      sub: 'Coaching experience',
    },
    {
      icon: <Calendar className="w-[22px] h-[22px] text-[#0077CC]" />,
      label: 'Free cancellation',
      sub: `${coach.cancellation_window_hours}hrs before session`,
    },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; sub: string }[]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-t border-b border-gray-100 mt-4">
      {stats.map(stat => (
        <div key={stat.label} className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">{stat.icon}</div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-snug">{stat.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Sport Card ───────────────────────────────────────────────────────────────

function SportCard({ sport }: { sport: CoachSport }) {
  return (
    <div className="border border-gray-200 rounded-2xl p-5" data-testid="sport-card">
      <h3 className="font-bold text-gray-900 mb-3">{sport.sport_name}</h3>
      <div className="space-y-2.5">
        {sport.session_types.includes('individual') && sport.price_individual_pence && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4" />
              <span>1-to-1 session · {sport.session_duration_minutes} min</span>
            </div>
            <span className="font-semibold text-gray-900">
              {formatPence(sport.price_individual_pence)}
            </span>
          </div>
        )}
        {sport.session_types.includes('group') && sport.price_group_pence && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Users className="w-4 h-4" />
              <span>
                Group session · {sport.session_duration_minutes} min
                {sport.max_group_size ? ` · up to ${sport.max_group_size}` : ''}
              </span>
            </div>
            <span className="font-semibold text-gray-900">
              {formatPence(sport.price_group_pence)}
              <span className="font-normal text-gray-500"> /person</span>
            </span>
          </div>
        )}
        {sport.skill_levels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {sport.skill_levels.map(level => (
              <span
                key={level}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-[#0077CC]"
              >
                {capitalise(level)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Qualification Card ───────────────────────────────────────────────────────

function QualificationCard({ qual }: { qual: Qualification }) {
  return (
    <div
      className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50"
      data-testid="qualification-card"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
        <Award className="w-5 h-5 text-[#0077CC]" />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{qual.name}</p>
        {qual.issuing_body && (
          <p className="text-sm text-gray-500">{qual.issuing_body}</p>
        )}
        <div className="flex flex-wrap gap-3 mt-1">
          {qual.issued_date && (
            <p className="text-xs text-gray-400">Issued {formatDate(qual.issued_date)}</p>
          )}
          {qual.expiry_date && (
            <p className={`text-xs ${qual.status === 'expired' ? 'text-red-500' : 'text-gray-400'}`}>
              {qual.status === 'expired' ? 'Expired' : 'Expires'} {formatDate(qual.expiry_date)}
            </p>
          )}
        </div>
      </div>
      {qual.status === 'active' && (
        <div className="ml-auto flex-shrink-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            Active
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Availability Grid ────────────────────────────────────────────────────────

function AvailabilityGrid({
  templates,
  blockedDates,
  minAdvanceHours,
}: {
  templates: AvailabilityTemplate[]
  blockedDates: string[]
  minAdvanceHours: number
}) {
  const DAY_LABEL = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const now = new Date()
  const blockedSet = new Set(blockedDates)
  const minAdvanceMs = minAdvanceHours * 3600 * 1000

  // Use local date parts to avoid UTC midnight shift in non-UTC timezones (e.g. BST)
  const localISODate = (d: Date): string => {
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${dd}`
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return d
  })

  // Find first upcoming slot respecting min_advance_hours and blocked dates
  let nextDate: Date | null = null
  let nextTime: string | null = null

  for (let i = 0; i < 60 && !nextDate; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dateStr = localISODate(d)
    if (blockedSet.has(dateStr)) continue

    const daySlots = templates
      .filter(t => t.day_of_week === d.getDay())
      .sort((a, b) => a.start_time.localeCompare(b.start_time))

    for (const slot of daySlots) {
      const [h, m] = slot.start_time.split(':').map(Number)
      const slotTime = new Date(d)
      slotTime.setHours(h, m, 0, 0)
      if (slotTime.getTime() - now.getTime() >= minAdvanceMs) {
        nextDate = d
        nextTime = slot.start_time
        break
      }
    }
  }

  return (
    <>
      <div className="grid grid-cols-7 gap-1.5" data-testid="availability-grid">
        {days.map((day, i) => {
          const dateStr = localISODate(day)
          const isBlocked = blockedSet.has(dateStr)
          const daySlots = isBlocked
            ? []
            : templates
                .filter(t => t.day_of_week === day.getDay())
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
          const slotCount = daySlots.length
          const hasSlots = slotCount > 0

          // First slot that respects min_advance_hours (for click target)
          let firstSlot: string | null = null
          for (const slot of daySlots) {
            const [h, m] = slot.start_time.split(':').map(Number)
            const slotTime = new Date(day)
            slotTime.setHours(h, m, 0, 0)
            if (slotTime.getTime() - now.getTime() >= minAdvanceMs) {
              firstSlot = slot.start_time
              break
            }
          }

          const cellContent = (
            <>
              <span className={`text-[11px] uppercase tracking-wide font-semibold mb-1.5 ${
                hasSlots ? 'text-[#0077CC]' : 'text-gray-400'
              }`}>
                {DAY_LABEL[day.getDay()]}
              </span>
              <span className={`text-base font-bold ${hasSlots ? 'text-[#0077CC]' : 'text-gray-400'}`}>
                {day.getDate()}
              </span>
              {hasSlots ? (
                <span className="text-sm font-medium text-[#0077CC] mt-0.5">
                  {slotCount} slot{slotCount !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-gray-300 mt-0.5">—</span>
              )}
            </>
          )

          if (firstSlot) {
            return (
              <Link
                key={i}
                href={`?date=${dateStr}&time=${firstSlot}`}
                scroll={false}
                className="flex flex-col items-center rounded-xl py-3 px-1 text-center bg-[#E6F3FB] border border-[#B5D4F4] hover:bg-[#D5EBF8] transition-colors"
                data-testid={`availability-day-${i}`}
              >
                {cellContent}
              </Link>
            )
          }

          return (
            <div
              key={i}
              className={`flex flex-col items-center rounded-xl py-3 px-1 text-center ${
                hasSlots
                  ? 'bg-[#E6F3FB] border border-[#B5D4F4]'
                  : 'bg-white border border-gray-200 opacity-55'
              }`}
            >
              {cellContent}
            </div>
          )
        })}
      </div>

      {nextDate !== null && nextTime !== null && (
        <div className="flex items-center gap-2 mt-4 text-sm text-gray-600">
          <Clock className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <span>
            Typically responds in under 2 hours. Next session:{' '}
            <span className="font-bold">
              {DAY_SHORT[nextDate.getDay()]} {nextDate.getDate()} {MONTH_SHORT[nextDate.getMonth()]} {nextTime}
            </span>
          </span>
        </div>
      )}
    </>
  )
}

// ─── Review Card ─────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: Review }) {
  return (
    <div
      className="p-4 rounded-xl border border-gray-100 bg-gray-50"
      data-testid="review-card"
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center">
          <span className="text-sm font-semibold text-[#0077CC]">P</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star
                    key={n}
                    className={`w-3.5 h-3.5 ${n <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-gray-500">Verified parent</span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">
              {formatRelativeDate(review.created_at)}
            </span>
          </div>
          {review.comment && (
            <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Rating Breakdown ─────────────────────────────────────────────────────────

function RatingBreakdown({ reviews, avg, count }: { reviews: Review[]; avg: number; count: number }) {
  const total = reviews.length || 1
  const breakdown = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
  }))

  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide font-semibold text-gray-500 mb-3">Overall Rating</p>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl font-bold text-gray-900">{avg.toFixed(1)}</span>
        <div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
              <Star
                key={n}
                className={`w-3.5 h-3.5 ${n <= Math.round(avg) ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 mt-0.5 block">{count} review{count !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div className="space-y-2">
        {breakdown.map(({ star, count: c }) => (
          <div key={star} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-3 text-right shrink-0">{star}</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-gray-900 rounded-full"
                style={{ width: `${(c / total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 w-3 shrink-0">{c}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Safety Section ───────────────────────────────────────────────────────────

function SafetySection({
  dbsStatus,
}: {
  dbsStatus: string
  dbsVerifiedAt: string | null
}) {
  const isVerified = dbsStatus === 'verified'

  return (
    <div className="space-y-4">
      {isVerified && (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-[#E0F6F8] border border-[#BFE4E8] mb-5">
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-[#006677] flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-base font-semibold text-[#006677]">This coach is DBS verified by Crikly</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(0,102,119,0.85)' }}>
              Every coach on Crikly undergoes an enhanced DBS check and safeguarding review before their first session.
            </p>
          </div>
        </div>
      )}

      <ul className="space-y-2.5">
        {[
          'All coaches verified by Crikly before going live',
          'Qualifications reviewed by our team',
          'Payments secured — never pay outside the platform',
          'Instant booking confirmation — no chasing',
        ].map(item => (
          <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
            <CheckCircle2 className="w-4 h-4 text-[#0077CC] flex-shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

