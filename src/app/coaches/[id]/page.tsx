import { notFound } from 'next/navigation'
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
  CheckCircle2,
  BadgeCheck,
  Globe,
} from 'lucide-react'
import { BioExpander } from './_components/BioExpander'

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

interface CoachProfile {
  id: string
  full_name: string
  bio: string | null
  years_experience: number | null
  location_city: string | null
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

const WEEK_DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
]

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

async function fetchAvailability(id: string): Promise<AvailabilityData | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${base}/api/coaches/${id}/availability`, {
    next: { revalidate: 30 },
  })
  if (!res.ok) return null
  return res.json() as Promise<AvailabilityData>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CoachProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [coach, avail] = await Promise.all([
    fetchCoachProfile(id),
    fetchAvailability(id),
  ])

  if (!coach) notFound()

  const minPrice = getMinPrice(coach.sports)
  const primaryPhoto = coach.photos.find(p => p.is_primary) ?? coach.photos[0] ?? null
  const galleryPhotos = coach.photos.slice(0, 5)

  return (
    <div className="min-h-screen bg-white">
      {/* ── Top nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-bold text-xl text-[#0077CC]" data-testid="nav-logo">
          Crikly
        </Link>
        <Link
          href="/search"
          className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to search
        </Link>
      </nav>

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

        {/* ── Hero gallery ────────────────────────────────────────────────── */}
        <HeroGallery photos={galleryPhotos} coachName={coach.full_name} />

        {/* ── Coach name + rating ─────────────────────────────────────────── */}
        <div className="mt-6 mb-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {coach.full_name}
              </h1>
              {coach.location_city && (
                <p className="flex items-center gap-1.5 mt-1 text-gray-500 text-sm">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  {coach.location_city}
                </p>
              )}
            </div>
            {coach.rating_avg !== null && coach.rating_count > 0 && (
              <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-4 py-2">
                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                <span className="font-bold text-gray-900">
                  {coach.rating_avg.toFixed(1)}
                </span>
                <span className="text-gray-500 text-sm">
                  ({coach.rating_count} review{coach.rating_count !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Trust row ───────────────────────────────────────────────────── */}
        <TrustRow coach={coach} />

        {/* ── Main layout ─────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-12 items-start mt-10">
          {/* Left — main content */}
          <div className="space-y-10 min-w-0">
            {/* About */}
            {coach.bio && (
              <section aria-labelledby="about-heading">
                <h2 id="about-heading" className="text-xl font-bold text-gray-900 mb-4">
                  About {coach.full_name.split(' ')[0]}
                </h2>
                <BioExpander bio={coach.bio} />
                {coach.years_experience !== null && (
                  <p className="mt-3 text-sm text-gray-500">
                    {coach.years_experience} year{coach.years_experience !== 1 ? 's' : ''} of coaching experience
                  </p>
                )}
                {coach.languages.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                    <Globe className="w-4 h-4 flex-shrink-0" />
                    Coaches in {coach.languages.join(', ')}
                  </div>
                )}
              </section>
            )}

            {/* Sports & Pricing */}
            {coach.sports.length > 0 && (
              <section aria-labelledby="sports-heading">
                <h2 id="sports-heading" className="text-xl font-bold text-gray-900 mb-4">
                  Sessions &amp; Pricing
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
              <section aria-labelledby="quals-heading">
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

            {/* Availability */}
            {avail && avail.availability.length > 0 && (
              <section aria-labelledby="availability-heading">
                <h2 id="availability-heading" className="text-xl font-bold text-gray-900 mb-4">
                  Typical Availability
                </h2>
                <AvailabilityGrid templates={avail.availability} />
                <p className="mt-3 text-sm text-gray-500">
                  Availability may vary — select a date when booking to see open slots.
                </p>
              </section>
            )}

            {/* Rating summary */}
            {coach.rating_count > 0 && coach.rating_avg !== null && (
              <section aria-labelledby="reviews-heading">
                <h2 id="reviews-heading" className="text-xl font-bold text-gray-900 mb-4">
                  Reviews
                </h2>
                <RatingSummary avg={coach.rating_avg} count={coach.rating_count} sessionsCompleted={coach.sessions_completed} />
              </section>
            )}

            {/* Safety */}
            <section aria-labelledby="safety-heading">
              <h2 id="safety-heading" className="text-xl font-bold text-gray-900 mb-4">
                Safety &amp; Trust
              </h2>
              <SafetySection dbsStatus={coach.dbs_status} dbsVerifiedAt={coach.dbs_verified_at} />
            </section>
          </div>

          {/* Right — desktop booking card */}
          <aside className="hidden lg:block sticky top-24">
            <BookCard coachId={coach.id} minPrice={minPrice} sports={coach.sports} policy={avail?.booking_policy ?? null} />
          </aside>
        </div>
      </main>

      {/* ── Mobile sticky booking bar ───────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div>
          {minPrice !== null ? (
            <p className="text-base font-bold text-gray-900">
              From {formatPence(minPrice)}
              <span className="font-normal text-gray-500 text-sm"> / session</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500">Price on request</p>
          )}
        </div>
        <Link
          href={`/book/${coach.id}`}
          className="flex-shrink-0 inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#0077CC] text-white font-semibold text-sm hover:bg-[#005fa3] transition-colors"
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
              hiddenLg && i === 2 ? 'hidden lg:block' : '',
              hiddenLg && i === 3 ? 'hidden lg:block' : '',
              hiddenMd && !hiddenLg ? 'hidden md:block' : '',
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
  const items = [
    coach.dbs_status === 'verified' && {
      icon: <ShieldCheck className="w-4 h-4 text-[#0077CC]" />,
      label: 'DBS Verified',
    },
    coach.sessions_completed > 0 && {
      icon: <CheckCircle2 className="w-4 h-4 text-[#0077CC]" />,
      label: `${coach.sessions_completed} session${coach.sessions_completed !== 1 ? 's' : ''} completed`,
    },
    coach.qualifications.some(q => q.status === 'active') && {
      icon: <Award className="w-4 h-4 text-[#0077CC]" />,
      label: 'Qualified coach',
    },
    coach.is_featured && {
      icon: <BadgeCheck className="w-4 h-4 text-[#0077CC]" />,
      label: 'Featured coach',
    },
  ].filter(Boolean) as { icon: React.ReactNode; label: string }[]

  if (items.length === 0) return null

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 py-6 border-t border-b border-gray-100 mt-4">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2">
          {item.icon}
          <span className="text-sm font-medium text-gray-700">{item.label}</span>
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

function AvailabilityGrid({ templates }: { templates: AvailabilityTemplate[] }) {
  return (
    <div className="grid grid-cols-7 gap-2" data-testid="availability-grid">
      {WEEK_DAYS.map(day => {
        const daySlots = templates.filter(t => t.day_of_week === day.value)
        const hasSlots = daySlots.length > 0

        return (
          <div
            key={day.value}
            className={[
              'flex flex-col items-center rounded-xl py-3 px-1 text-center',
              hasSlots
                ? 'bg-blue-50 border border-blue-100'
                : 'bg-gray-50 border border-gray-100',
            ].join(' ')}
          >
            <span className={`text-xs font-semibold mb-1 ${hasSlots ? 'text-[#0077CC]' : 'text-gray-400'}`}>
              {day.label}
            </span>
            {hasSlots ? (
              <div className="space-y-0.5 w-full">
                {daySlots.slice(0, 2).map(slot => (
                  <p key={slot.id} className="text-[10px] text-[#0077CC] font-medium leading-tight">
                    {slot.start_time}
                  </p>
                ))}
                {daySlots.length > 2 && (
                  <p className="text-[10px] text-blue-400">+{daySlots.length - 2}</p>
                )}
              </div>
            ) : (
              <span className="text-gray-300 text-lg leading-none mt-0.5">–</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Rating Summary ───────────────────────────────────────────────────────────

function RatingSummary({
  avg,
  count,
  sessionsCompleted,
}: {
  avg: number
  count: number
  sessionsCompleted: number
}) {
  return (
    <div className="flex items-center gap-8 p-6 rounded-2xl bg-gray-50 border border-gray-100">
      <div className="text-center">
        <p className="text-4xl font-bold text-gray-900">{avg.toFixed(1)}</p>
        <div className="flex gap-0.5 mt-1.5 justify-center">
          {[1, 2, 3, 4, 5].map(n => (
            <Star
              key={n}
              className={`w-4 h-4 ${n <= Math.round(avg) ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-200'}`}
            />
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">{count} review{count !== 1 ? 's' : ''}</p>
      </div>
      <div className="h-14 w-px bg-gray-200" />
      <div>
        <p className="text-2xl font-bold text-gray-900">{sessionsCompleted}</p>
        <p className="text-sm text-gray-500 mt-0.5">sessions completed</p>
      </div>
    </div>
  )
}

// ─── Safety Section ───────────────────────────────────────────────────────────

function SafetySection({
  dbsStatus,
  dbsVerifiedAt,
}: {
  dbsStatus: string
  dbsVerifiedAt: string | null
}) {
  const isVerified = dbsStatus === 'verified'

  return (
    <div className="space-y-4">
      {isVerified && (
        <div className="flex items-start gap-4 p-5 rounded-2xl bg-[#E0F6F8] border border-teal-100">
          <ShieldCheck className="w-6 h-6 text-[#006677] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-[#006677]">DBS Checked &amp; Verified</p>
            <p className="text-sm text-[#006677]/80 mt-0.5">
              This coach has passed an enhanced DBS (Disclosure and Barring Service) check.
              {dbsVerifiedAt ? ` Verified ${formatDate(dbsVerifiedAt)}.` : ''}
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

// ─── Book Card (desktop aside) ────────────────────────────────────────────────

function BookCard({
  coachId,
  minPrice,
  sports,
  policy,
}: {
  coachId: string
  minPrice: number | null
  sports: CoachSport[]
  policy: { cancellation_window_hours: number; min_advance_hours: number; max_advance_days: number } | null
}) {
  return (
    <div
      className="border border-gray-200 rounded-2xl p-6 shadow-sm"
      data-testid="book-card"
    >
      {/* Price */}
      <div className="mb-5">
        {minPrice !== null ? (
          <>
            <p className="text-2xl font-bold text-gray-900">
              From {formatPence(minPrice)}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">per session</p>
          </>
        ) : (
          <p className="text-gray-500 text-sm">Price on request</p>
        )}
      </div>

      {/* Sports quick list */}
      {sports.length > 0 && (
        <div className="mb-5 space-y-2">
          {sports.map(s => (
            <div key={s.sport_id} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{s.sport_name}</span>
              <span className="font-medium text-gray-900">
                {s.price_individual_pence ? formatPence(s.price_individual_pence) : '–'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CTA */}
      <Link
        href={`/book/${coachId}`}
        className="flex items-center justify-center w-full h-12 rounded-xl bg-[#0077CC] text-white font-semibold hover:bg-[#005fa3] transition-colors"
        data-testid="desktop-book-cta"
      >
        Book a session
      </Link>

      {/* Policy */}
      {policy && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
            Book up to {policy.max_advance_days} days ahead
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            Cancel free {policy.cancellation_window_hours}+ hours before
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-center text-gray-400">You won&apos;t be charged yet</p>
    </div>
  )
}
