'use client'

// ──────────────────────────────────────────────────────────────────────────────
// CF-REVIEWS-01 — Coach Reviews page (/coach/reviews)
//
// Anatomy mirrors the public profile reviews section at
// src/app/coaches/[id]/page.tsx (ReviewCard + RatingBreakdown) so coaches see
// a consistent visual treatment of their own ratings.
//
// Data: fetched from /api/coaches/reviews — live join of reviews +
// coach_replies, gated by RLS (the coach's own reviews only). Sort is
// client-side over fetched state.
//
// Reply compose is local UI state only — POST endpoint is not wired yet.
// Follow-up: BUG-REVIEWS-REPLY-PERSIST.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { Star, CornerDownLeft, Flag, TrendingUp, Loader2 } from 'lucide-react'

type SortKey = 'newest' | 'oldest' | 'highest' | 'lowest'

interface Review {
  id: string
  rating: number
  comment: string
  created_at: string
  reviewer_name: string
  sport_name: string
  coach_reply: string | null
}

interface ReviewsResponse {
  reviews: Review[]
  rating_avg: number
  rating_count: number
  rating_change_30d: number
  positive_share: { positive: number; total: number }
}

// Verbatim copy from src/app/coaches/[id]/page.tsx (L141-152) so date
// rendering on the coach view matches the public profile.
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

export default function CoachReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [ratingAvg, setRatingAvg] = useState(0)
  const [ratingCount, setRatingCount] = useState(0)
  const [ratingChange, setRatingChange] = useState(0)
  const [positiveShare, setPositiveShare] = useState<{ positive: number; total: number }>({
    positive: 0,
    total: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>('newest')

  // Reply compose state — only one card is editable at a time.
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [replySubmitting, setReplySubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/coaches/reviews')
        if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`)
        const data = (await res.json()) as ReviewsResponse
        if (cancelled) return
        setReviews(data.reviews)
        setRatingAvg(data.rating_avg)
        setRatingCount(data.rating_count)
        setRatingChange(data.rating_change_30d)
        setPositiveShare(data.positive_share)
      } catch (err) {
        if (cancelled) return
        console.error('[reviews] load error:', err)
        setError('Failed to load reviews. Please refresh.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Client-side sort — STUB returns newest-first but we sort regardless so the
  // rendering does not depend on upstream ordering when real wiring lands.
  const sortedReviews = useMemo(() => {
    const copy = [...reviews]
    switch (sortKey) {
      case 'newest':
        return copy.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      case 'oldest':
        return copy.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      case 'highest':
        return copy.sort(
          (a, b) => b.rating - a.rating || +new Date(b.created_at) - +new Date(a.created_at),
        )
      case 'lowest':
        return copy.sort(
          (a, b) => a.rating - b.rating || +new Date(b.created_at) - +new Date(a.created_at),
        )
    }
  }, [reviews, sortKey])

  function handleOpenReply(reviewId: string, existing: string | null) {
    setReplyingTo(reviewId)
    setReplyDraft(existing ?? '')
  }

  function handleCancelReply() {
    setReplyingTo(null)
    setReplyDraft('')
  }

  async function handlePostReply() {
    if (replySubmitting || !replyingTo) return
    setReplySubmitting(true)
    try {
      // BUG-REVIEWS-REPLY-PERSIST: STUB — no backing endpoint yet. Close compose
      // locally so the UX works end-to-end while we build the real route.
      await new Promise((r) => setTimeout(r, 300))
      handleCancelReply()
    } finally {
      setReplySubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 size={28} className="text-brand-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <p className="text-sm text-danger text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[880px] mx-auto px-8 py-8">
        {/* ── 1. PAGE HEADER ───────────────────────────────────────────── */}
        <header className="mb-8">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Reviews</h1>
          <p className="text-sm text-gray-500 mt-1">
            What people are saying about your coaching.
          </p>
        </header>

        {ratingCount === 0 ? (
          <ReviewsEmptyState />
        ) : (
          <>
            {/* ── 2. RATING SUMMARY ─────────────────────────────────── */}
            <section
              aria-labelledby="summary-heading"
              className="pb-10 border-b border-gray-100"
            >
              <h2 id="summary-heading" className="sr-only">
                Overall rating
              </h2>
              <div className="flex flex-wrap gap-8 items-start">
                <div className="w-[200px] flex-shrink-0">
                  <RatingBreakdown reviews={reviews} avg={ratingAvg} count={ratingCount} />
                </div>
                <div className="flex-1 min-w-[280px] hidden md:block">
                  <TrendCallout change={ratingChange} positive={positiveShare} />
                </div>
              </div>
            </section>

            {/* ── 3. SORT PILLS ─────────────────────────────────────── */}
            <div className="flex items-center gap-2 mt-6 mb-6 flex-wrap">
              <SortPill label="Newest" sortKey="newest" active={sortKey} onClick={setSortKey} />
              <SortPill label="Oldest" sortKey="oldest" active={sortKey} onClick={setSortKey} />
              <SortPill
                label="Highest rated"
                sortKey="highest"
                active={sortKey}
                onClick={setSortKey}
              />
              <SortPill
                label="Lowest rated"
                sortKey="lowest"
                active={sortKey}
                onClick={setSortKey}
              />
            </div>

            {/* ── 4. REVIEW CARDS ───────────────────────────────────── */}
            <section aria-label="Reviews" className="space-y-4">
              {sortedReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isComposeOpen={replyingTo === review.id}
                  replyDraft={replyDraft}
                  replySubmitting={replySubmitting}
                  onOpenReply={() => handleOpenReply(review.id, review.coach_reply)}
                  onChangeReply={setReplyDraft}
                  onCancelReply={handleCancelReply}
                  onPostReply={handlePostReply}
                />
              ))}
            </section>
          </>
        )}

        <div className="h-16" />
      </div>
    </div>
  )
}

// ─── Sort pill ───────────────────────────────────────────────────────────────

function SortPill({
  label,
  sortKey,
  active,
  onClick,
}: {
  label: string
  sortKey: SortKey
  active: SortKey
  onClick: (key: SortKey) => void
}) {
  const isActive = active === sortKey
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={
        isActive
          ? 'text-[13px] py-1.5 px-4 rounded-full bg-brand-600 text-white font-medium cursor-pointer'
          : 'text-[13px] py-1.5 px-4 rounded-full bg-white text-gray-500 border border-gray-200 font-medium hover:bg-gray-50 transition-colors cursor-pointer'
      }
    >
      {label}
    </button>
  )
}

// ─── Review card ─────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  isComposeOpen,
  replyDraft,
  replySubmitting,
  onOpenReply,
  onChangeReply,
  onCancelReply,
  onPostReply,
}: {
  review: Review
  isComposeOpen: boolean
  replyDraft: string
  replySubmitting: boolean
  onOpenReply: () => void
  onChangeReply: (value: string) => void
  onCancelReply: () => void
  onPostReply: () => void
}) {
  const firstName = review.reviewer_name.split(' ')[0]
  const initial = firstName.charAt(0).toUpperCase()
  const hasReply = review.coach_reply !== null

  return (
    <article
      className={
        isComposeOpen
          ? 'p-4 rounded-xl border border-gray-100 bg-gray-50 ring-2 ring-brand-600/15'
          : 'p-4 rounded-xl border border-gray-100 bg-gray-50'
      }
      data-testid="review-card"
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center">
          <span className="text-sm font-semibold text-brand-600">{initial}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={
                      n <= review.rating
                        ? 'w-3.5 h-3.5 fill-yellow-400 text-yellow-400'
                        : 'w-3.5 h-3.5 fill-gray-200 text-gray-200'
                    }
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-gray-500">
                {review.reviewer_name} · Verified parent
              </span>
              <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                {review.sport_name}
              </span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">
              {formatRelativeDate(review.created_at)}
            </span>
          </div>

          <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>

          {/* Action row */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-3">
            <button
              type="button"
              onClick={onOpenReply}
              disabled={isComposeOpen}
              className="inline-flex items-center gap-1.5 text-brand-600 text-sm font-medium hover:text-[#0066AA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
              {hasReply ? 'Edit reply' : 'Reply'}
            </button>
            <button
              type="button"
              // BUG-REVIEWS-FLAG-ACTION (follow-up): wire to a flag/report flow.
              className="inline-flex items-center gap-1 text-gray-400 text-xs hover:text-gray-600 transition-colors cursor-pointer"
            >
              <Flag className="w-3.5 h-3.5" />
              Flag
            </button>
          </div>

          {/* Existing reply (shown when not composing) */}
          {hasReply && !isComposeOpen && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide font-semibold text-brand-600 mb-2">
                Your reply
              </p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 border border-gray-100">
                {review.coach_reply}
              </div>
            </div>
          )}

          {/* Compose */}
          {isComposeOpen && (
            <div className="mt-4 bg-white rounded-lg border border-gray-100 p-3">
              <p className="text-xs uppercase tracking-wide font-semibold text-brand-600 mb-2">
                Reply to {firstName}
              </p>
              <textarea
                rows={3}
                value={replyDraft}
                onChange={(e) => onChangeReply(e.target.value)}
                disabled={replySubmitting}
                placeholder={`Write a reply to ${firstName}…`}
                className="w-full text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 resize-none disabled:bg-gray-50"
              />
              <div className="flex items-center justify-between mt-3 gap-2">
                <span className="text-[11px] text-gray-400">
                  Replies are public on your profile.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCancelReply}
                    disabled={replySubmitting}
                    className="text-sm py-1.5 px-4 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onPostReply}
                    disabled={replySubmitting || !replyDraft.trim()}
                    className="text-sm py-1.5 px-4 rounded-lg bg-brand-600 text-white font-medium hover:bg-[#0066AA] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {replySubmitting ? 'Posting…' : 'Post reply'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

// ─── Rating breakdown ────────────────────────────────────────────────────────

function RatingBreakdown({
  reviews,
  avg,
  count,
}: {
  reviews: Review[]
  avg: number
  count: number
}) {
  const total = reviews.length || 1
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }))

  return (
    <div>
      <p className="text-[12px] uppercase tracking-wide font-semibold text-gray-500 mb-3">
        Overall Rating
      </p>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-4xl font-bold text-gray-900">{avg.toFixed(1)}</span>
        <div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={
                  n <= Math.round(avg)
                    ? 'w-3.5 h-3.5 fill-yellow-400 text-yellow-400'
                    : 'w-3.5 h-3.5 fill-gray-200 text-gray-200'
                }
              />
            ))}
          </div>
          <span className="text-xs text-gray-500 mt-0.5 block">
            {count} review{count !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {breakdown.map(({ star, count: c }) => (
          <div key={star} className="flex items-center gap-2">
            <span className="text-xs text-gray-600 w-3 text-right shrink-0">{star}</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              {/* Dynamic width — runtime percentage cannot be expressed as a Tailwind class. */}
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

// ─── Trend callout ───────────────────────────────────────────────────────────
// STUB content — hardcoded copy "Up 0.2 since last month / 22 of 24 reviewers…"
// from the approved design. Both values come from the STUB API endpoint and
// will become real once API-COACH-REVIEWS-REAL-WIRING lands.

function TrendCallout({
  change,
  positive,
}: {
  change: number
  positive: { positive: number; total: number }
}) {
  return (
    <div className="p-5 rounded-2xl bg-teal-50 border border-[#BFE4E8]">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-teal-800 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#003D4A] mb-1">
            Up {change.toFixed(1)} since last month
          </p>
          <p className="text-xs text-teal-800 leading-relaxed">
            {positive.positive} of {positive.total} reviewers gave you 4★ or more. Keep
            replying — coaches who reply within 48 hours rate 11% higher on average.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function ReviewsEmptyState() {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-10 text-center">
      <div className="inline-flex items-center justify-center mb-3">
        <Star className="w-8 h-8 text-gray-300" />
      </div>
      <p className="font-semibold text-gray-900">No reviews yet</p>
      <p className="text-sm text-gray-500 mt-1">
        Reviews appear here once parents rate completed sessions.
      </p>
    </div>
  )
}
