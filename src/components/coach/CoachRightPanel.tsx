'use client'

// ──────────────────────────────────────────────────────────────────────────────
// DS-RIGHT-PANEL-01 — Universal right-panel command centre.
//
// Replaces the previous 7-route-conditional panel with a single layout
// rendered identically on every coach screen. Six sections, top to bottom:
//
//   1. This week     — Mon-Sun strip with dots; clicking a day filters L2
//   2. Daily lineup  — sessions for the selected day; row click → popup
//   3. Action needed — pending approvals / unanswered reviews / completeness
//   4. Pulse         — 2×2 grid of this-week stats; whole card → /earnings
//   5. Next payout   — STUB Phase 1 (see API-RIGHT-PANEL-PAYOUT-REAL)
//   6. Your profile  — live/paused dot; STUB views (see BUG-RIGHT-PANEL-PROFILE-VIEWS)
//
// Visibility: hidden below xl (1280px). Mounted from CoachLayoutClient on
// every coach route except onboarding.
//
// Data:
//   - Sessions: useBookings() (today / upcoming / pendingApproval / thisWeek)
//   - Profile : fetchCoachProfileCached() (deduped with sidebar fetch)
//   - Sports  : fetchSportsListCached() (for sport name lookup)
//
// Phase 2 follow-ups (filed in BUILD_PLAN + tracked inline):
//   - API-CMD-CENTRE                        — one aggregation endpoint
//   - API-RIGHT-PANEL-PAYOUT-REAL           — wire next payout to Stripe data
//   - BUG-RIGHT-PANEL-UNANSWERED-REVIEWS    — real reviews-without-reply count
//   - BUG-RIGHT-PANEL-PROFILE-VIEWS         — view tracking + stat
//   - BUG-PROGRAMME-CREATE-PREVIEW-LOST     — move preview into create page
//   - PERF-RIGHT-PANEL-DASHBOARD-DEDUPE     — server-rendered overlap on /dashboard
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Star, Clock, MessageSquare, User, MapPin, Trophy, ArrowRight, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useBookings, type BookingListItem } from '@/contexts/BookingsContext'
import { fetchCoachProfileCached, fetchSportsListCached } from '@/lib/onboarding-cache'
import { readStripeStatusCache, writeStripeStatusCache, type StripeConnectStatus } from '@/lib/stripe-status-cache'

interface ProfileData {
  rating_avg: number | null
  rating_count: number
  is_profile_live: boolean
  is_paused: boolean
  bio: string | null
  location_city: string | null
  full_name: string | null
  cancellation_window_hours: number
}

interface ProfileCompleteness {
  sports: boolean
  qualifications: boolean
  availability: boolean
  unanswered_reviews: number
}

// API-CMD-CENTRE: 60s TTL session cache for /api/coaches/profile-completeness.
// Mirrors the stripe-status-cache pattern (TTL gate + corrupt-entry guard +
// write-fail no-op). Short TTL lets us skip explicit invalidation — when the
// coach adds a sport/availability slot and navigates back, at most 60s of
// staleness shows before the next mount refetches.
const COMPLETENESS_CACHE_KEY = 'crikly:profile-completeness'
const COMPLETENESS_TTL_MS = 60 * 1000

interface CompletenessCacheEntry {
  value: ProfileCompleteness
  storedAt: number
}

function readCompletenessCache(): ProfileCompleteness | null {
  try {
    const raw = sessionStorage.getItem(COMPLETENESS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CompletenessCacheEntry
    if (!Number.isFinite(parsed.storedAt)) return null
    if (Date.now() - parsed.storedAt > COMPLETENESS_TTL_MS) return null
    return parsed.value
  } catch {
    return null
  }
}

function writeCompletenessCache(value: ProfileCompleteness): void {
  try {
    const entry: CompletenessCacheEntry = { value, storedAt: Date.now() }
    sessionStorage.setItem(COMPLETENESS_CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage write failed — non-critical
  }
}

interface Sport { id: string; name: string }

// ─── Date helpers ────────────────────────────────────────────────────────────

// DS-RIGHT-PANEL-01-FIXES: use local components (not toISOString which is UTC)
// so days don't shift across midnight in late-evening UK time near month
// boundaries. Was the root cause of selected-day mismatches reported in
// smoke test issues 3 + 4.
function isoDate(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

function todayIsoLocal(): string {
  return isoDate(new Date())
}

function getWeekDays(weekOffset: number = 0): Array<{ iso: string; label: string; date: number; isToday: boolean }> {
  // Mon-Sun for the current week (or offset week), local time. UK only Phase 1.
  const today = new Date()
  const todayIso0 = isoDate(today)
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset + weekOffset * 7)
  monday.setHours(0, 0, 0, 0)

  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const days: Array<{ iso: string; label: string; date: number; isToday: boolean }> = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    days.push({
      iso: isoDate(d),
      label: labels[i],
      date: d.getDate(),
      isToday: isoDate(d) === todayIso0,
    })
  }
  return days
}

function getDayName(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'long' })
}

function getDurationMinutes(start: string, end: string): number {
  // start, end: "HH:MM:SS"
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return eh * 60 + em - (sh * 60 + sm)
}

function formatTime12h(hms: string): string {
  // "HH:MM:SS" → "H:MM AM/PM"
  const [hStr, mStr] = hms.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr ?? '00'
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m} ${suffix}`
}

function statusLabel(status: string): string {
  switch (status) {
    case 'confirmed': return 'Confirmed'
    case 'pending_approval': return 'Pending'
    case 'completed': return 'Completed'
    default: return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'confirmed':
    case 'completed':
      return 'bg-green-50 text-green-800'
    case 'pending_approval':
      return 'bg-amber-50 text-amber-800'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CoachRightPanel() {
  const [selectedDayIso, setSelectedDayIso] = useState<string>(todayIsoLocal())
  const [selectedSession, setSelectedSession] = useState<BookingListItem | null>(null)
  // BUG-QA-02: weekOffset drives both the visible Mon-Sun strip AND the on-demand
  // bookings fetch below. offset=0 uses the existing BookingsContext.thisWeek to
  // dedupe with other consumers; offset !== 0 fetches its own week-scoped slice.
  const [weekOffset, setWeekOffset] = useState(0)

  const { thisWeek, pendingApproval, loading } = useBookings()

  // BUG-QA-02: off-week bookings — fetched on demand for week-strip dot accuracy.
  // When weekOffset === 0 we read from `thisWeek` (BookingsContext) so this stays
  // empty in that case to avoid double-fetch.
  const [weekStripBookings, setWeekStripBookings] = useState<BookingListItem[]>([])

  useEffect(() => {
    if (weekOffset === 0) {
      setWeekStripBookings([])
      return
    }
    const controller = new AbortController()
    // BUG-QA-02 should-fix: clear stale data BEFORE the new fetch so dots blank
    // during navigation rather than briefly showing the previous week's state.
    setWeekStripBookings([])
    fetch(`/api/coaches/bookings?tab=week&offset=${weekOffset}`, { signal: controller.signal })
      .then((res) => res.ok ? res.json() : null)
      .then((json: { bookings?: BookingListItem[] } | null) => {
        if (json?.bookings) setWeekStripBookings(json.bookings)
      })
      .catch((err) => {
        // AbortController fires AbortError on stale-response cancel — silent.
        if (err?.name !== 'AbortError') console.error('[right-panel] week strip fetch failed:', err)
      })
    return () => controller.abort()
  }, [weekOffset])

  // Coach profile — cached fetch dedups with the sidebar's fetch.
  const [profile, setProfile] = useState<ProfileData | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchCoachProfileCached()
      .then((p) => {
        if (cancelled || !p) return
        setProfile(p as ProfileData)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // BUG-COMPLETION-STRIPE: Stripe charges + payouts enablement — same source
  // ProfileEdit reads from (Fix-45 pattern). Cache hit → instant; cache miss
  // → one /api/payments/connect/onboard call, write back to cache. Replaces
  // the prior `!!stripe_account_id` check which incorrectly counted coaches
  // who had clicked "Connect Stripe" but never finished onboarding.
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false)
  const [stripePayoutsEnabled, setStripePayoutsEnabled] = useState(false)

  // API-CMD-CENTRE: server-side completeness checks (sports / quals / avail)
  // plus the unanswered-reviews count. Replaces the previous +3 STUB and the
  // hidden Section 3 reviews row (STUB 0). Cached in sessionStorage with a
  // 60s TTL — completeness changes rarely so a short TTL keeps the UI fresh
  // without explicit invalidation. Mirrors the stripe-status-cache pattern.
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null)
  useEffect(() => {
    let cancelled = false
    const cached = readStripeStatusCache()
    if (cached) {
      setStripeChargesEnabled(cached.charges_enabled ?? false)
      setStripePayoutsEnabled(cached.payouts_enabled ?? false)
      // Intentional bare return: no async work was started, so no cleanup
      // function is needed. `cancelled` stays unused on this path.
      return
    }
    fetch('/api/payments/connect/onboard')
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const data = await res.json() as StripeConnectStatus
        // Re-check cancelled after the await — unmount could have happened
        // during res.json() parse on a slow network.
        if (cancelled) return
        setStripeChargesEnabled(data.charges_enabled ?? false)
        setStripePayoutsEnabled(data.payouts_enabled ?? false)
        writeStripeStatusCache(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // API-CMD-CENTRE: server-side completeness — same pattern as the Stripe
  // effect above (cache hit → instant; cache miss → fetch + writeCache).
  useEffect(() => {
    let cancelled = false
    const cached = readCompletenessCache()
    if (cached) {
      setCompleteness(cached)
      return
    }
    fetch('/api/coaches/profile-completeness')
      .then(async (res) => {
        if (!res.ok || cancelled) return
        const data = await res.json() as ProfileCompleteness
        if (cancelled) return
        setCompleteness(data)
        writeCompletenessCache(data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Sports map for session sport-name lookup.
  const [sportsMap, setSportsMap] = useState<Record<string, string>>({})
  useEffect(() => {
    fetchSportsListCached()
      .then((sports: Sport[]) => {
        const map: Record<string, string> = {}
        sports.forEach((s) => { map[s.id] = s.name })
        setSportsMap(map)
      })
      .catch(() => {})
  }, [])

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset])

  // Month label for the displayed week, derived from its Thursday (ISO
  // month convention — the Thursday is always inside the calendar month
  // that "owns" the week). Year suffix appears only when not current year.
  const monthLabel = useMemo(() => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset + weekOffset * 7)
    const thursday = new Date(monday)
    thursday.setDate(monday.getDate() + 3)
    const currentYear = new Date().getFullYear()
    return thursday.getFullYear() === currentYear
      ? thursday.toLocaleDateString('en-GB', { month: 'short' })
      : thursday.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  }, [weekOffset])

  function handleResetToToday() {
    setWeekOffset(0)
    setSelectedDayIso(todayIsoLocal())
  }

  // Day → sessions map for dot indicators + lineup filtering.
  // BUG-QA-02: source switches based on weekOffset — current week reads from
  // BookingsContext (deduped with other consumers); off-weeks use the on-demand
  // fetch above so dots and the lineup stay accurate when navigating.
  const sessionsByDay = useMemo(() => {
    const source = weekOffset === 0 ? thisWeek : weekStripBookings
    const map: Record<string, BookingListItem[]> = {}
    source.forEach((b) => {
      if (!map[b.session_date]) map[b.session_date] = []
      map[b.session_date].push(b)
    })
    return map
  }, [thisWeek, weekStripBookings, weekOffset])

  const selectedDaySessions = useMemo(() => {
    const list = sessionsByDay[selectedDayIso] ?? []
    return [...list].sort((a, b) => a.session_start_time.localeCompare(b.session_start_time))
  }, [sessionsByDay, selectedDayIso])

  const todayIso = todayIsoLocal()
  const lineupHeading =
    selectedDayIso === todayIso ? "Today's lineup" : `${getDayName(selectedDayIso)}'s lineup`
  const emptyDayText =
    selectedDayIso === todayIso ? 'No sessions today' : 'No sessions this day'

  // Profile completeness — 6 real checks, split between client-side and
  // server-side data sources.
  //
  // Client-side (cached profile + Stripe cache):
  //   1. Basic profile  — name + bio + location
  //   2. Booking policy — cancellation_window_hours > 0
  //   3. Stripe         — chargesEnabled && payoutsEnabled
  //
  // Server-side (/api/coaches/profile-completeness, cached 60s):
  //   4. Sports         — coach_sports count > 0
  //   5. Qualifications — coach_qualifications count > 0
  //   6. Availability   — availability_templates count > 0
  //
  // Until the server-side fetch resolves, completeness defaults to 6/6 so
  // the action-needed row stays hidden (avoids a flash of "Complete your
  // profile" on first paint for already-complete coaches). On a brand-new
  // coach with no completeness data yet, the row appears once the fetch
  // returns and the missing checks surface.
  const completedChecks = useMemo(() => {
    if (!profile) return 6
    let count = 0
    if (profile.full_name && profile.bio && profile.location_city) count++
    if (profile.cancellation_window_hours > 0) count++
    if (stripeChargesEnabled && stripePayoutsEnabled) count++
    if (completeness) {
      if (completeness.sports) count++
      if (completeness.qualifications) count++
      if (completeness.availability) count++
    } else {
      // Pre-load assumption — see comment above.
      count += 3
    }
    return Math.min(count, 6)
  }, [profile, stripeChargesEnabled, stripePayoutsEnabled, completeness])

  // API-CMD-CENTRE: real unanswered-reviews count from the same endpoint.
  // 0 until the fetch resolves — Section 3 row stays hidden in the interim.
  const unansweredReviewsCount = completeness?.unanswered_reviews ?? 0

  const showPendingRow = pendingApproval.length > 0
  const showReviewsRow = unansweredReviewsCount > 0
  const showCompletionRow = completedChecks < 6
  const allCaughtUp = !showPendingRow && !showReviewsRow && !showCompletionRow

  // Section 4 stats — derived from thisWeek (confirmed + completed only).
  const weekSessionsActive = useMemo(
    () => thisWeek.filter((b) => b.status === 'confirmed' || b.status === 'completed'),
    [thisWeek],
  )
  const weekRevenue = weekSessionsActive.reduce((sum, b) => sum + b.coach_price_pence, 0) / 100
  const completedCount = weekSessionsActive.filter((b) => b.status === 'completed').length
  const weekCompletionPct =
    weekSessionsActive.length > 0
      ? Math.round((completedCount / weekSessionsActive.length) * 100)
      : 0

  return (
    <aside className="hidden xl:flex w-96 shrink-0 flex-col gap-4 bg-white p-6 border-l border-gray-100 sticky top-0 h-screen overflow-y-auto">

      {/* ─── SECTION 1 · THIS WEEK ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{monthLabel}</h3>
          <div className="flex items-center gap-2 text-[11px]">
            {weekOffset !== 0 && (
              <button
                type="button"
                onClick={handleResetToToday}
                className="font-semibold text-brand-600 hover:text-[#0066AA] cursor-pointer transition-colors"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o - 1)}
              className="p-0.5 text-gray-400 hover:text-gray-900 cursor-pointer transition-colors"
              aria-label="Previous week"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((o) => o + 1)}
              className="p-0.5 text-gray-400 hover:text-gray-900 cursor-pointer transition-colors"
              aria-label="Next week"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mb-2">tap a day to update lineup</p>
        <div className="flex justify-between items-center">
          {weekDays.map((day) => {
            const daySessions = sessionsByDay[day.iso] ?? []
            const hasSession = daySessions.length > 0
            // BUG-QA-02: per-day dominant status drives dot colour.
            // Pending wins over confirmed (amber = action-needed); confirmed/
            // completed → teal (trust signal); no sessions → invisible.
            const hasPending = daySessions.some((s) => s.status === 'pending_approval')
            const hasConfirmed = daySessions.some((s) => s.status === 'confirmed' || s.status === 'completed')
            const dotColour = hasPending ? 'bg-amber-500' : (hasConfirmed ? 'bg-teal-600' : 'bg-brand-600')
            const isSelected = day.iso === selectedDayIso
            const circleClass = day.isToday
              ? 'w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold bg-brand-600 text-white shadow-sm'
              : isSelected
              ? 'w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-medium text-brand-600 ring-2 ring-brand-600'
              : 'w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-medium text-gray-700 group-hover:bg-gray-100 transition-colors'
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => setSelectedDayIso(day.iso)}
                className="flex flex-col items-center gap-1.5 group cursor-pointer"
              >
                <span className={`text-[11px] font-bold uppercase tracking-wider ${day.isToday || isSelected ? 'text-brand-600' : 'text-gray-400'}`}>
                  {day.label}
                </span>
                <div className={circleClass}>{day.date}</div>
                <div className={`w-1.5 h-1.5 rounded-full ${dotColour} ${hasSession ? '' : 'opacity-0'}`} />
              </button>
            )
          })}
        </div>
      </section>

      <div className="h-px bg-gray-100 my-1" />

      {/* ─── SECTION 2 · DAILY LINEUP ───────────────────────────────────── */}
      <section>
        <h3 className="text-[15px] font-bold text-gray-900 mb-3">{lineupHeading}</h3>
        {loading ? (
          <p className="text-[12px] text-gray-400 py-2">Loading…</p>
        ) : selectedDaySessions.length === 0 ? (
          <div className="text-center py-4">
            <div className="inline-flex mb-2">
              <Star className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-[14px] font-semibold text-gray-700">{emptyDayText}</p>
            <p className="text-[12px] text-gray-400 mt-0.5">Enjoy the time off.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedDaySessions.map((session) => {
              const isOpen = selectedSession?.id === session.id
              const clientName = session.child_name ?? session.booked_by_name ?? 'Session'
              const typeLabel = session.session_type === 'group' ? 'Group' : '1-to-1'
              const sport = sportsMap[session.sport_id] ?? ''
              const timeBadge = formatTime12h(session.session_start_time)
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedSession(session)}
                  className={
                    isOpen
                      ? 'w-full group flex items-center gap-3 px-2.5 py-2 rounded-lg ring-1 ring-brand-600/30 bg-brand-600/[0.03] text-left cursor-pointer'
                      : 'w-full group flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left cursor-pointer'
                  }
                >
                  <span className="text-[11px] font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded shrink-0">
                    {timeBadge}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 leading-tight truncate">{clientName}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                      {[typeLabel, sport].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 group-hover:text-gray-500 transition-colors" />
                </button>
              )
            })}
          </div>
        )}
      </section>

      <div className="h-px bg-gray-100 my-1" />

      {/* ─── SECTION 3 · ACTION NEEDED ──────────────────────────────────── */}
      <section>
        <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Action needed</h3>
        {allCaughtUp ? (
          <div className="text-center py-4">
            <div className="inline-flex mb-2">
              <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center">
                <Check className="w-4 h-4 text-green-600" />
              </div>
            </div>
            <p className="text-[13px] font-semibold text-gray-700">All caught up</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Nothing needs your attention.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {showPendingRow && (
              <Link
                href="/coach/bookings"
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <Clock className="w-[18px] h-[18px] text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">Pending approvals</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {pendingApproval.length} {pendingApproval.length === 1 ? 'booking awaiting' : 'bookings awaiting'}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                  {pendingApproval.length}
                </span>
              </Link>
            )}
            {showReviewsRow && (
              <Link
                href="/coach/reviews"
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-[18px] h-[18px] text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">Unanswered reviews</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{unansweredReviewsCount} without a reply</p>
                </div>
                <span className="text-[11px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded shrink-0">
                  {unansweredReviewsCount}
                </span>
              </Link>
            )}
            {showCompletionRow && (
              <Link
                href="/coach/profile"
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <User className="w-[18px] h-[18px] text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 leading-tight">Complete your profile</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Some checks incomplete — view profile</p>
                </div>
              </Link>
            )}
          </div>
        )}
      </section>

      <div className="h-px bg-gray-100 my-1" />

      {/* ─── SECTION 4 · THIS WEEK'S PULSE ──────────────────────────────── */}
      <section>
        <Link
          href="/coach/earnings"
          className="block p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors group"
        >
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">This week&apos;s pulse</h3>
            <span className="text-[11px] font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Earnings →
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Sessions</p>
              <p className="text-[18px] font-semibold text-gray-900 leading-tight mt-0.5">{weekSessionsActive.length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">this week</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Revenue</p>
              <p className="text-[18px] font-semibold text-green-700 leading-tight mt-0.5">£{weekRevenue.toFixed(0)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">this week</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Rating</p>
              <p className="text-[18px] font-semibold text-gray-900 leading-tight mt-0.5 flex items-center gap-1">
                {profile?.rating_avg !== null && profile?.rating_avg !== undefined ? profile.rating_avg.toFixed(1) : '—'}
                <Star className="w-4 h-4 text-amber-400" fill="#FBBF24" />
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {profile?.rating_count ?? 0} {profile?.rating_count === 1 ? 'review' : 'reviews'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] text-gray-400">Completion</p>
              <p className="text-[18px] font-semibold text-gray-900 leading-tight mt-0.5">{weekCompletionPct}%</p>
              <p className="text-[11px] text-gray-400 mt-0.5">sessions done</p>
            </div>
          </div>
        </Link>
      </section>

      {/* ─── SECTION 5 · NEXT PAYOUT ────────────────────────────────────── */}
      {/* API-RIGHT-PANEL-PAYOUT-REAL (follow-up): Phase 1 always renders the
          empty state. Wiring to a real payout calculation needs the Stripe
          payout schedule + aggregated completed-session totals — neither is
          surfaced anywhere yet. The populated branch is intentionally omitted
          to avoid showing hardcoded "£90 / Releases 10 Apr" copy. */}
      <section>
        <Link
          href="/coach/get-paid"
          className="block p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors group"
        >
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Next payout</h3>
            <span className="text-[11px] font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
              Get Paid →
            </span>
          </div>
          <div className="text-center py-4">
            <p className="text-[13px] font-semibold text-gray-700">No pending payout</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Complete sessions to earn.</p>
          </div>
        </Link>
      </section>

      {/* ─── SECTION 6 · YOUR PROFILE ───────────────────────────────────── */}
      {/* BUG-RIGHT-PANEL-PROFILE-VIEWS (follow-up): view tracking is not
          built anywhere — no page-view events, no analytics tables. Phase 1
          always shows "No views yet" regardless of live/paused. The amber
          "Share your profile →" CTA appears when paused, since sharing is
          the action that makes the paused state actionable. */}
      <section>
        <Link
          href="/coach/profile"
          className="block p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors group"
        >
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Your profile</h3>
            <span className="text-[11px] font-medium text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">
              My Profile →
            </span>
          </div>
          <div className="flex items-end justify-between">
            <ProfileLiveDot live={profile?.is_profile_live ?? null} paused={profile?.is_paused ?? false} />
            <div className="text-right">
              <p className="text-[13px] text-gray-400">No views yet</p>
              {profile?.is_paused && (
                <p className="text-[11px] text-brand-600 mt-1 font-medium">Share your profile →</p>
              )}
            </div>
          </div>
        </Link>
      </section>

      {/* SESSION DETAIL POPUP */}
      {selectedSession && (
        <SessionDetailPopup
          session={selectedSession}
          sportName={sportsMap[selectedSession.sport_id] ?? '—'}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </aside>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProfileLiveDot({ live, paused }: { live: boolean | null; paused: boolean }) {
  if (live === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-[7px] h-[7px] rounded-full bg-gray-200" />
        <span className="text-[13px] font-medium text-gray-400">…</span>
      </div>
    )
  }
  if (!live) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-[7px] h-[7px] rounded-full bg-gray-400" />
        <span className="text-[13px] font-medium text-gray-900">Not live</span>
      </div>
    )
  }
  if (paused) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-[7px] h-[7px] rounded-full bg-amber-500" />
        <span className="text-[13px] font-medium text-gray-900">Paused</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <span className="relative flex h-[7px] w-[7px]">
        <span className="absolute inset-0 rounded-full bg-green-500 animate-pulse" />
        <span className="relative inline-flex rounded-full h-[7px] w-[7px] bg-green-600" />
      </span>
      <span className="text-[13px] font-medium text-gray-900">Live</span>
    </div>
  )
}

function SessionDetailPopup({
  session,
  sportName,
  onClose,
}: {
  session: BookingListItem
  sportName: string
  onClose: () => void
}) {
  const router = useRouter()
  const typeLabel = session.session_type === 'group' ? 'Group' : '1-to-1'
  const clientName = session.child_name ?? session.booked_by_name ?? 'Session'
  const startTime = formatTime12h(session.session_start_time)
  const durationMinutes = getDurationMinutes(session.session_start_time, session.session_end_time)
  const location = session.venue_name ?? 'Venue TBC'

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-xl border border-gray-100 shadow-[0_20px_50px_rgba(15,23,42,0.18)] w-[320px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4">
          <div className="flex items-start justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">{typeLabel}</span>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 -mr-1 -mt-1 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-50 cursor-pointer"
              aria-label="Close session details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <h4 className="text-[16px] font-semibold text-gray-900 leading-tight">{clientName}</h4>
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(session.status)}`}>
              {statusLabel(session.status)}
            </span>
          </div>
          <div className="h-px bg-gray-100 -mx-4 mb-3" />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] text-gray-700">
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>{startTime} · {durationMinutes} min</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-gray-700">
              <Trophy className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>{sportName}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-gray-700">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span>{location}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/coach/bookings')}
            className="mt-4 w-full bg-brand-600 hover:bg-[#0066AA] transition-colors text-white rounded-lg py-2 text-[13px] font-medium flex items-center justify-center gap-1 cursor-pointer"
          >
            View booking details
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
