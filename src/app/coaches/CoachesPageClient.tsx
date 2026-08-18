'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import {
  CoachCard,
  CoachCardSkeleton,
  normaliseCoach,
} from '@/components/public/CoachCard'
import type { PublicCoachListItem } from '@/components/public/CoachCard'
import { AppShell } from '@/components/shell/AppShell'
import type { ShellRole } from '@/components/shell/roles'
import { parseRoleParam, type RoleParam } from '@/lib/auth/role-param'

// BUG-73: this file is the former src/app/coaches/page.tsx moved verbatim —
// page.tsx is now a thin server wrapper that detects the signed-in parent
// and passes `authedParent`. When set, the shell renders the parent AppShell
// instead of the public header and coach cards deep-link straight to the
// auth-aware booking flow (/coaches/[slug]/availability — P-10 single flow).
// When null (guest, coach-only, player-only) everything renders exactly as
// before.

// Server-resolved shell identity for a signed-in parent (subset of the
// AppShell identity props — see src/components/shell/AppShell.tsx).
export interface AuthedParentShell {
  name: string
  email: string
  avatarUrl: string | null
  activeRole: ShellRole
  roles: ShellRole[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Fallback photo pool — used when a coach has no avatar_url. Same pool the
// landing rail uses, picked deterministically by list index.
const CRICKET_PHOTOS = [
  'https://images.unsplash.com/photo-1593766827228-8737b4534aa6?w=700&q=80',
  'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=700&q=80',
  'https://images.unsplash.com/photo-1577223625816-7546f13df25d?w=700&q=80',
  'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=700&q=80',
  'https://images.unsplash.com/photo-1607734834519-d8576ae60ea6?w=700&q=80',
]

const PAGE_SIZE = 8

// ─── Page ────────────────────────────────────────────────────────────────────

// Next 15 App Router requires components using useSearchParams to be
// wrapped in a Suspense boundary; the outer component provides the
// boundary, the inner one reads params.
export function CoachesPageClient({
  authedParent,
}: {
  authedParent: AuthedParentShell | null
}) {
  return (
    <Suspense
      fallback={
        <CoachesPageShell authedParent={authedParent}>
          <PageHeaderCopy />
          <ResultsGridSkeleton />
        </CoachesPageShell>
      }
    >
      <CoachesSearchPage authedParent={authedParent} />
    </Suspense>
  )
}

// ─── Inner page (the one that reads URL params) ──────────────────────────────

function CoachesSearchPage({
  authedParent,
}: {
  authedParent: AuthedParentShell | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // URL is the source of truth for the filter; component state is for the
  // controlled form input. Reading inline avoids a setState ping-pong on
  // back/forward navigation.
  const queryLocation = searchParams.get('location')?.trim() ?? ''
  // P-03: persona context arriving from the landing CTAs (?role=parent|player).
  // Carried through URL rebuilds; P-04-B (AUTH-FLOW-01) now also validates it
  // and threads it onto the auth-wall links in CoachesPageShell.
  const queryRole = searchParams.get('role')?.trim() ?? ''
  const roleParam = parseRoleParam(queryRole)

  const [locationInput, setLocationInput] = useState(queryLocation)
  const [coaches, setCoaches] = useState<PublicCoachListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  // Tracks whether the initial fetch threw an error so we can show the
  // error state instead of the "no coaches" empty state — different UX.
  const [fetchError, setFetchError] = useState(false)

  // ── Reset state when the URL query changes ──────────────────────────
  // Runs on initial mount and whenever ?location= changes via router.push
  // in handleSearch / handleReset.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFetchError(false)
    setCoaches([])
    setOffset(0)
    setHasMore(false)
    ;(async () => {
      try {
        const url = buildApiUrl(0, PAGE_SIZE, queryLocation)
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as {
          coaches?: PublicCoachListItem[]
          pagination?: { has_more?: boolean }
        }
        if (cancelled) return
        setCoaches(json.coaches ?? [])
        setHasMore(json.pagination?.has_more ?? false)
        setOffset(PAGE_SIZE)
      } catch (err) {
        console.error('[/coaches] initial fetch failed:', err)
        if (!cancelled) setFetchError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [queryLocation])

  // ── Sync controlled input with URL on back/forward navigation ───────
  useEffect(() => {
    setLocationInput(queryLocation)
  }, [queryLocation])

  // ── Submit handler — updates URL only; fetch effect handles the rest ─
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = locationInput.trim()
    const params = new URLSearchParams({ sport: 'cricket' })
    if (trimmed) params.set('location', trimmed)
    if (queryRole) params.set('role', queryRole)
    router.push(`/coaches?${params.toString()}`)
  }

  // ── Reset — used by the empty-state "Reset search" button ───────────
  const handleReset = useCallback(() => {
    setLocationInput('')
    const params = new URLSearchParams({ sport: 'cricket' })
    if (queryRole) params.set('role', queryRole)
    router.push(`/coaches?${params.toString()}`)
  }, [router, queryRole])

  // ── Load more — appends the next page; preserves existing list ──────
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const url = buildApiUrl(offset, PAGE_SIZE, queryLocation)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as {
        coaches?: PublicCoachListItem[]
        pagination?: { has_more?: boolean }
      }
      const next = json.coaches ?? []
      setCoaches((prev) => [...prev, ...next])
      setHasMore(json.pagination?.has_more ?? false)
      setOffset((prev) => prev + PAGE_SIZE)
    } catch (err) {
      // Soft-fail: keep existing list, console-only. User can click again.
      console.error('[/coaches] load more failed:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <CoachesPageShell roleParam={roleParam} authedParent={authedParent}>
      <PageHeaderCopy />

      {/* ── Compact search bar ─────────────────────────────────── */}
      <form
        onSubmit={handleSearch}
        noValidate
        className="mb-10 flex max-w-[640px] items-stretch rounded-full border border-neutral-100 bg-white p-[7px] shadow-[0_4px_12px_rgba(0,0,0,0.10)] transition-all focus-within:border-brand-600 focus-within:shadow-[0_8px_28px_rgba(0,119,204,0.16)] max-[540px]:flex-wrap max-[540px]:rounded-3xl max-[540px]:p-2.5 max-md:mb-8"
      >
        {/* Sport chip — fixed to Cricket. Visual only, not interactive. */}
        <div className="flex items-center px-4 py-1.5 max-[540px]:basis-full">
          <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-brand-50 px-3 text-xs font-semibold text-brand-700">
            Cricket
          </span>
        </div>
        <div className="my-2 w-px self-stretch bg-neutral-100 max-[540px]:hidden" />
        {/* Location input */}
        <div className="flex flex-1 flex-col justify-center px-4 py-1.5 min-w-0 max-[540px]:basis-full">
          <label
            htmlFor="locInput"
            className="mb-0.5 cursor-pointer text-[11px] font-semibold uppercase tracking-[0.05em] text-gray-500"
          >
            Where
          </label>
          <div className="flex items-center gap-2 text-[15px] font-medium text-gray-900">
            <MapPin size={16} className="shrink-0 text-gray-500" />
            <input
              id="locInput"
              type="text"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
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

      {/* ── Results ────────────────────────────────────────────── */}
      {loading ? (
        <ResultsGridSkeleton />
      ) : fetchError ? (
        <ErrorState onRetry={() => router.refresh()} />
      ) : coaches.length === 0 ? (
        <EmptyState
          hasFilter={Boolean(queryLocation)}
          locationLabel={queryLocation}
          onReset={handleReset}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {coaches.map((live, i) => {
              const normalised = normaliseCoach(live)
              const photo = live.avatar_url ?? CRICKET_PHOTOS[i % CRICKET_PHOTOS.length]
              return (
                <CoachCard
                  key={`${live.coach_profile_id}-${live.sport_slug}`}
                  coach={normalised}
                  photo={photo}
                  sportName={live.sport_name}
                  // BUG-73: a signed-in parent goes straight to the
                  // auth-aware booking flow; everyone else keeps the
                  // public profile route.
                  href={
                    authedParent
                      ? `/coaches/${live.slug}/availability`
                      : `/coaches/${live.slug}`
                  }
                />
              )
            })}
          </div>

          {hasMore && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
                aria-label={loadingMore ? 'Loading more coaches' : 'Load more coaches'}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-neutral-100 bg-white px-6 text-[15px] font-medium text-gray-900 transition-all hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Load more coaches'}
              </button>
            </div>
          )}
        </>
      )}
    </CoachesPageShell>
  )
}

// ─── Shell (nav + footer + main wrapper) ─────────────────────────────────────

function CoachesPageShell({
  children,
  roleParam = null,
  authedParent = null,
}: {
  children: React.ReactNode
  roleParam?: RoleParam | null
  authedParent?: AuthedParentShell | null
}) {
  return (
    <div className="min-h-screen bg-transparent">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      {authedParent ? (
        // BUG-73: signed-in parent — the same AppShell bar as /parent/*
        // (its "Find a coach" link matches /coaches, so it highlights here).
        <AppShell
          context="parent"
          className="sticky top-0 z-50"
          name={authedParent.name}
          email={authedParent.email}
          avatarUrl={authedParent.avatarUrl}
          activeRole={authedParent.activeRole}
          roles={authedParent.roles}
        />
      ) : (
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
            {/* P-04-B (AUTH-FLOW-01): carry the validated persona context from
                the landing CTAs into the auth wall — without this the ?role=
                chain dies here and the consumption layer is unreachable. */}
            <Link
              href={roleParam ? `/login?role=${roleParam}` : '/login'}
              className="whitespace-nowrap rounded-[10px] px-3.5 py-2.5 text-[15px] font-medium text-neutral-600 no-underline transition-colors hover:bg-neutral-50 hover:text-gray-900"
            >
              Log in
            </Link>
            <Link
              href={roleParam ? `/login?role=${roleParam}` : '/login'}
              className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-5 text-[15px] font-medium text-white no-underline transition-all hover:bg-brand-700 active:scale-[0.98]"
            >
              Get started
            </Link>
          </div>
        </header>
      )}

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1180px] px-10 py-12 max-md:px-[22px] max-md:py-8">
        {children}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      {/* Minimal — copyright row only. Extract to a shared PublicFooter
          when a third route consumes it (currently landing inlines its
          own three-column variant). */}
      <footer className="border-t border-neutral-100 bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-10 py-[22px] text-xs text-gray-500 max-md:px-[22px] max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-2">
          <span>© 2026 Tekly Solutions Ltd. Crikly is a product of Tekly Solutions.</span>
          <span>Made in the UK</span>
        </div>
      </footer>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PageHeaderCopy() {
  return (
    <div className="mb-8 max-md:mb-6">
      <h1 className="text-[clamp(28px,3.4vw,42px)] font-semibold tracking-[-0.025em] text-gray-900">
        Find a cricket coach
      </h1>
      <p className="mt-2 text-base text-neutral-600">Verified coaches across the UK</p>
    </div>
  )
}

function ResultsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <CoachCardSkeleton key={`skeleton-${i}`} />
      ))}
    </div>
  )
}

function EmptyState({
  hasFilter,
  locationLabel,
  onReset,
}: {
  hasFilter: boolean
  locationLabel: string
  onReset: () => void
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-neutral-400">
        <Search size={20} strokeWidth={2} />
      </div>
      <h2 className="text-lg font-semibold text-gray-900">No coaches found</h2>
      <p className="mx-auto mt-1 max-w-[42ch] text-sm text-neutral-600">
        {hasFilter
          ? `We don't have a cricket coach in "${locationLabel}" yet. Try a different town, or browse all UK coaches.`
          : "We don't have any live cricket coaches at this moment. Please check back soon."}
      </p>
      {hasFilter && (
        <button
          type="button"
          onClick={onReset}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-[15px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          Reset search
        </button>
      )}
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-12 text-center">
      <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="mx-auto mt-1 max-w-[42ch] text-sm text-neutral-600">
        We couldn&apos;t load coaches just now. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-[15px] font-medium text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
      >
        Retry
      </button>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Build the /api/public/coaches URL with sport=cricket, paging, and an
// optional location filter.
function buildApiUrl(offset: number, limit: number, location: string): string {
  const params = new URLSearchParams({
    sport: 'cricket',
    limit: String(limit),
    offset: String(offset),
  })
  if (location) params.set('location', location)
  return `/api/public/coaches?${params.toString()}`
}
