'use client'
import React, { useState, useEffect } from 'react'
import { Inbox } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TransactionStatus = 'in_clearance' | 'transferring' | 'paid' | 'failed' | 'on_hold'
type FilterKey = 'all' | TransactionStatus

interface TransactionItem {
  id: string
  status: TransactionStatus
  session_date: string | null
  booking_reference: string | null
  participant_name: string
  coach_price_pence: number | null
  fee_pence: number | null
  net_pence: number
  payout_eligible_at: string | null
  scheduled_at: string | null
  processed_at: string | null
  held_reason: string | null
  failure_reason: string | null
}

interface EarningsData {
  summary: {
    total_earned_pence: number
    pending_pence: number
    this_month_pence: number
    last_month_pence: number
    in_clearance_pence: number
    currency: 'GBP'
  }
  transactions: TransactionItem[]
}

// ─── Status badges (design: C-PAY-06 Coach Money Screens) ────────────────────

const BADGES: Record<TransactionStatus, { label: string; className: string }> = {
  in_clearance: { label: 'In clearance', className: 'bg-brand-50 text-brand-600' },
  transferring: { label: 'Transferring', className: 'bg-amber-100 text-amber-800' },
  paid: { label: 'Paid', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-danger' },
  on_hold: { label: 'On hold', className: 'bg-neutral-100 text-neutral-600' },
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_clearance', label: 'In clearance' },
  { key: 'transferring', label: 'Transferring' },
  { key: 'paid', label: 'Paid' },
  { key: 'failed', label: 'Failed' },
  { key: 'on_hold', label: 'On hold' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 'YYYY-MM-DD' → 'Sun 26 Jul' */
function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** ISO timestamp → 'Releasing 28 Jul' */
function formatReleasingDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Releasing soon'
  return `Releasing ${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`
}

/** Row sub-text shown next to the status badge, per design. */
function rowSubText(tx: TransactionItem): string | null {
  if (tx.status === 'in_clearance') {
    return tx.payout_eligible_at ? formatReleasingDate(tx.payout_eligible_at) : 'Releasing soon'
  }
  if (tx.status === 'failed') return 'Action needed'
  if (tx.status === 'on_hold') return 'Connect Stripe to release'
  return null
}

/** Fee line under the amount — in-clearance rows show the gross explainer. */
function rowFeeLine(tx: TransactionItem): string | null {
  if (tx.status === 'in_clearance') return 'Session price · fee applied on transfer'
  if (tx.coach_price_pence !== null && tx.fee_pence !== null) {
    return `${formatPence(tx.coach_price_pence)} − ${formatPence(tx.fee_pence)} fee`
  }
  return null
}

function filterTransactions(
  transactions: TransactionItem[],
  filter: FilterKey,
  fromDate: string,
  toDate: string,
): TransactionItem[] {
  return transactions.filter((tx) => {
    if (filter !== 'all' && tx.status !== filter) return false
    // Date range compares 'YYYY-MM-DD' strings — lexicographic order is
    // chronological. Rows with no session date only survive an open range.
    if (fromDate && (tx.session_date === null || tx.session_date < fromDate)) return false
    if (toDate && (tx.session_date === null || tx.session_date > toDate)) return false
    return true
  })
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function EarningsSkeleton() {
  return (
    <div className="space-y-7 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-md p-5 space-y-2">
            <div className="h-3 w-20 bg-gray-100 rounded" />
            <div className="h-8 w-28 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-full" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm p-5 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="h-3 w-36 bg-gray-100 rounded" />
            </div>
            <div className="space-y-2 flex flex-col items-end">
              <div className="h-4 w-16 bg-gray-200 rounded" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Earnings() {
  const [loading, setLoading] = useState(true)
  const [earningsData, setEarningsData] = useState<EarningsData | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    fetch('/api/coaches/earnings')
      .then((r) => r.json())
      .then((data: EarningsData) => setEarningsData(data))
      .catch(() => {/* leave earningsData null — empty state will show */})
      .finally(() => setLoading(false))
  }, [])

  // ── Derived values ─────────────────────────────────────────────────────────
  const summary = earningsData?.summary
  const allTransactions = earningsData?.transactions ?? []
  const visible = filterTransactions(allTransactions, filter, fromDate, toDate)

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' })
  const activeFilterLabel = FILTERS.find((f) => f.key === filter && f.key !== 'all')?.label
  const emptyTitle = activeFilterLabel
    ? `No ${activeFilterLabel.toLowerCase()} transactions yet`
    : 'No transactions yet'

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans">
      <div className="w-full max-w-5xl mx-auto min-h-screen px-5 lg:px-10 pt-8 pb-12 flex flex-col gap-7">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Earnings</h1>
          <p className="text-base text-neutral-600 m-0">Every session and where its money is right now.</p>
        </div>

        {loading ? (
          <EarningsSkeleton />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow-md p-5 flex flex-col gap-2">
                <span className="text-xs font-medium tracking-label uppercase text-neutral-600">This month</span>
                <span className="text-3xl font-semibold tracking-heading text-neutral-900" data-testid="summary-this-month">
                  {formatPence(summary?.this_month_pence ?? 0)}
                </span>
                <span className="text-sm text-neutral-400">Paid out in {monthName}.</span>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5 flex flex-col gap-2">
                <span className="text-xs font-medium tracking-label uppercase text-neutral-600">In clearance</span>
                <span className="text-3xl font-semibold tracking-heading text-neutral-900" data-testid="summary-in-clearance">
                  {formatPence(summary?.in_clearance_pence ?? 0)}
                </span>
                <span className="text-sm text-neutral-400">Inside the 48-hour window.</span>
              </div>
              <div className="bg-white rounded-lg shadow-md p-5 flex flex-col gap-2">
                <span className="text-xs font-medium tracking-label uppercase text-neutral-600">All time</span>
                <span className="text-3xl font-semibold tracking-heading text-neutral-900" data-testid="summary-all-time">
                  {formatPence(summary?.total_earned_pence ?? 0)}
                </span>
                <span className="text-sm text-neutral-400">Since you joined Crikly.</span>
              </div>
            </div>

            {/* Filters + date range */}
            <div className="flex items-center justify-between gap-6 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={filter === f.key}
                    className={`h-9 px-3.5 rounded-full text-sm font-medium border transition-colors ${
                      filter === f.key
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-neutral-600 border-neutral-100 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  From
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-9 px-2.5 border border-neutral-100 rounded-md bg-white text-sm text-neutral-900"
                    data-testid="filter-from-date"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  To
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-9 px-2.5 border border-neutral-100 rounded-md bg-white text-sm text-neutral-900"
                    data-testid="filter-to-date"
                  />
                </label>
              </div>
            </div>

            {/* Transactions */}
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-medium text-neutral-900 m-0">Transactions</h2>
                <span className="text-sm text-neutral-400" data-testid="transaction-count">
                  {visible.length} {visible.length === 1 ? 'session' : 'sessions'}
                </span>
              </div>

              {visible.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm px-6 py-12 flex flex-col items-center gap-3 text-center">
                  <Inbox size={48} className="text-neutral-400" strokeWidth={1.5} />
                  <span className="text-base font-medium text-neutral-900">{emptyTitle}</span>
                  <span className="text-sm text-neutral-600">Try a different filter or widen the date range.</span>
                </div>
              ) : (
                visible.map((tx) => {
                  const badge = BADGES[tx.status]
                  const sub = rowSubText(tx)
                  const feeLine = rowFeeLine(tx)
                  return (
                    <div
                      key={tx.id}
                      data-testid="transaction-row"
                      className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow px-5 py-4 flex items-center justify-between gap-6"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-[16px] font-medium text-neutral-900">
                          {tx.session_date ? formatSessionDate(tx.session_date) : '—'}
                        </span>
                        <span className="text-sm text-neutral-400 truncate">{tx.booking_reference ?? 'Booking'}</span>
                        <span className="text-sm text-neutral-400 truncate">{tx.participant_name}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-lg font-semibold tracking-heading text-neutral-900">
                          {formatPence(tx.net_pence)}
                        </span>
                        {feeLine && <span className="text-sm text-neutral-400">{feeLine}</span>}
                        <div className="flex items-center gap-2">
                          {sub && <span className="text-xs text-neutral-400">{sub}</span>}
                          <span
                            className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
