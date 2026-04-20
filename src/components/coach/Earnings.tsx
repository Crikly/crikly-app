'use client'
import React, { useState, useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 'This week' | 'This month' | 'All time'

interface Transaction {
  id: string
  date: string
  name: string
  amount: string
  type: 'solo' | 'group'
  meta: string
  sport: string
}

interface PayoutItem {
  id: string
  booking_id: string
  booking_reference: string | null
  session_date: string | null
  session_type: string | null
  amount_pence: number
  currency: string
  status: string
  scheduled_at: string
  processed_at: string | null
}

interface EarningsData {
  summary: {
    total_earned_pence: number
    pending_pence: number
    this_month_pence: number
    last_month_pence: number
    currency: 'GBP'
  }
  payouts: PayoutItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPence(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function formatSessionDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatReleasedDate(isoStr: string): string {
  const d = new Date(isoStr)
  return `Released ${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })}`
}

function getThisMonthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString().slice(0, 10)
}

function getLastMonthStart(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString().slice(0, 10)
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun
  const diff = day === 0 ? 6 : day - 1 // days since Monday
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
    .toISOString().slice(0, 10)
}

function filterPayoutsByPeriod(payouts: PayoutItem[], period: Period): PayoutItem[] {
  if (period === 'All time') return payouts
  const start = period === 'This month' ? getThisMonthStart() : getWeekStart()
  return payouts.filter((p) => p.session_date !== null && p.session_date >= start)
}

function getPeriodAmount(data: EarningsData, period: Period): number {
  if (period === 'This month') return data.summary.this_month_pence
  if (period === 'All time') return data.summary.total_earned_pence
  // This week — sum paid payouts where session_date >= week start
  const start = getWeekStart()
  return data.payouts
    .filter((p) => p.status === 'paid' && p.session_date !== null && p.session_date >= start)
    .reduce((sum, p) => sum + p.amount_pence, 0)
}

function buildChartDays(payouts: PayoutItem[]): { label: string; amount: number }[] {
  const today = new Date()
  const days: { label: string; amount: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i))
    const dateStr = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
    const total = payouts
      .filter((p) => p.status === 'paid' && p.session_date === dateStr)
      .reduce((sum, p) => sum + p.amount_pence, 0)
    days.push({ label, amount: total / 100 })
  }
  return days
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function EarningsSkeleton() {
  return (
    <div className="px-5 space-y-8 animate-pulse">
      <div className="flex items-center gap-2">
        {['This week', 'This month', 'All time'].map((p) => (
          <div key={p} className="h-9 w-24 bg-gray-200 rounded-full" />
        ))}
      </div>
      {/* Hero card skeleton */}
      <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
        <div className="p-8 pb-6 flex flex-col items-center gap-3">
          <div className="h-10 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
        </div>
        <div className="border-t border-gray-100 flex">
          {[1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              {i > 1 && <div className="w-[0.5px] bg-gray-100" style={{ height: '80%', alignSelf: 'center' }} />}
              <div className="flex-1 py-4 flex flex-col items-center gap-1.5">
                <div className="h-5 w-12 bg-gray-200 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      {/* Chart skeleton */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex justify-between mb-3">
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-100 rounded" />
        </div>
        <div className="h-[120px] bg-gray-100 rounded" />
      </div>
      {/* Payout skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-36 bg-gray-200 rounded" />
        <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm space-y-3">
          <div className="flex justify-between">
            <div className="h-6 w-20 bg-gray-200 rounded" />
            <div className="h-4 w-28 bg-gray-100 rounded" />
          </div>
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
      {/* Transactions skeleton */}
      <div className="space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden divide-y divide-gray-100">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 px-5 flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 bg-gray-200 rounded" />
                <div className="h-2.5 w-24 bg-gray-100 rounded" />
              </div>
              <div className="h-3 w-12 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Earnings() {
  const [period, setPeriod] = useState<Period>('This month')
  const [loading, setLoading] = useState(true)
  const [earningsData, setEarningsData] = useState<EarningsData | null>(null)

  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<Chart | null>(null)

  const periods: Period[] = ['This week', 'This month', 'All time']

  // ── Fetch earnings data once on mount ──────────────────────────────────────
  useEffect(() => {
    fetch('/api/coaches/earnings')
      .then((r) => r.json())
      .then((data: EarningsData) => setEarningsData(data))
      .catch(() => {/* leave earningsData null — empty state will show */})
      .finally(() => setLoading(false))
  }, [])

  // ── Chart: rebuild when data loads ────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !earningsData) return

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy()
    }

    const ctx = chartRef.current.getContext('2d')
    if (!ctx) return

    const chartDays = buildChartDays(earningsData.payouts)
    const chartValues = chartDays.map((d) => d.amount)
    const peakIndex = chartValues.indexOf(Math.max(...chartValues))

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: chartDays.map((d) => d.label),
        datasets: [{
          data: chartValues,
          backgroundColor: chartValues.map((_, i) => i === peakIndex ? '#0077CC' : '#B5D4F4'),
          borderRadius: 3,
          barThickness: 24,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `£${context.parsed.y}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#F1F5F9' },
            ticks: {
              font: { size: 10 },
              color: '#9CA3AF',
              callback: (value) => `£${value}`,
            },
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, color: '#9CA3AF' },
          },
        },
      },
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
      }
    }
  }, [earningsData])

  // ── Derived values ─────────────────────────────────────────────────────────
  const allPayouts = earningsData?.payouts ?? []
  const summary = earningsData?.summary

  const periodPayouts = filterPayoutsByPeriod(allPayouts, period)
  const paidPeriodPayouts = periodPayouts.filter((p) => p.status === 'paid')

  const sessionCount = paidPeriodPayouts.length
  const periodAmount = earningsData ? getPeriodAmount(earningsData, period) : 0
  const avgPerSession = sessionCount > 0 ? periodAmount / sessionCount : 0

  const pendingCount = allPayouts.filter(
    (p) => p.status === 'pending' || p.status === 'processing',
  ).length

  // Trend badge
  const trendPct =
    summary && summary.last_month_pence > 0
      ? Math.round(((summary.this_month_pence - summary.last_month_pence) / summary.last_month_pence) * 100)
      : null
  const showTrend = period === 'This month' && trendPct !== null && trendPct !== 0

  // Avg sub-label: only when period === 'This month' and last month has data
  let lastMonthAvg = 0
  if (period === 'This month' && summary && summary.last_month_pence > 0) {
    const lmStart = getLastMonthStart()
    const tmStart = getThisMonthStart()
    const lastMonthPaid = allPayouts.filter(
      (p) => p.status === 'paid' && p.processed_at !== null &&
             p.processed_at >= lmStart && p.processed_at < tmStart,
    )
    lastMonthAvg = lastMonthPaid.length > 0 ? summary.last_month_pence / lastMonthPaid.length : 0
  }
  const showAvgSubLabel = period === 'This month' && lastMonthAvg > 0

  // Upcoming payout
  const nextPayout = allPayouts
    .filter((p) => p.status === 'pending' || p.status === 'processing')
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null

  // Best day for chart label
  const chartDays = earningsData ? buildChartDays(earningsData.payouts) : []
  const bestDayIdx = chartDays.length > 0
    ? chartDays.indexOf(chartDays.reduce((best, d) => d.amount > best.amount ? d : best, chartDays[0]))
    : -1
  const bestDay = bestDayIdx >= 0 && chartDays[bestDayIdx].amount > 0
    ? chartDays[bestDayIdx].label
    : null

  // Hero subtitle
  const heroSubtitle = period === 'This month'
    ? `Total earned · ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
    : period === 'All time'
    ? 'Total earned · All time'
    : 'Total earned · This week'

  // Transactions list
  const transactions: Transaction[] = paidPeriodPayouts.map((p) => {
    const dateLabel = p.session_date ? formatSessionDate(p.session_date) : '—'
    const statusLabel = p.status.charAt(0).toUpperCase() + p.status.slice(1)
    return {
      id: p.id,
      date: dateLabel,
      name: p.booking_reference ?? 'Booking',
      amount: `+${formatPence(p.amount_pence)}`,
      type: p.session_type === 'group' ? 'group' : 'solo',
      meta: `${dateLabel} · ${statusLabel}`,
      sport: '',
    }
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="w-full max-w-2xl mx-auto min-h-screen relative flex flex-col pb-12">
        <div className="px-5 pt-8 pb-4 sticky top-0 z-10">
          <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">Earnings</h1>
        </div>

        {loading ? (
          <EarningsSkeleton />
        ) : (
          <div className="px-5 space-y-8">
            {/* Period selector */}
            <div className="flex items-center gap-2">
              {periods.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-full text-[14px] font-bold transition-colors ${
                    period === p ? 'bg-[#0077CC] text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Hero card */}
            <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
              <div className="p-8 pb-6 flex flex-col items-center justify-center text-center relative">
                {showTrend && (
                  <div
                    className="absolute top-6 right-6 px-2.5 py-1 text-[11px] font-medium rounded-full"
                    style={{
                      backgroundColor: trendPct! > 0 ? '#DCFCE7' : '#FEE2E2',
                      color: trendPct! > 0 ? '#166534' : '#B91C1C',
                    }}
                  >
                    {trendPct! > 0 ? '▲' : '▼'} {trendPct! > 0 ? '+' : ''}{trendPct}% vs last month
                  </div>
                )}
                <div className="text-[36px] font-bold text-[#0077CC] tracking-tight leading-none">
                  {formatPence(periodAmount)}
                </div>
                <div className="text-[13px] text-gray-500 font-medium mt-2">{heroSubtitle}</div>
              </div>

              {/* Stats strip */}
              <div className="border-t border-gray-100 flex">
                <div className="flex-1 py-4 text-center px-2">
                  <div className="text-[18px] font-bold text-gray-900">{sessionCount}</div>
                  <div className="text-[12px] text-gray-500 font-medium mt-0.5">Sessions</div>
                </div>
                <div className="w-[0.5px] bg-gray-100" style={{ height: '80%', alignSelf: 'center' }} />
                <div className="flex-1 py-4 text-center px-2">
                  <div className="text-[22px] font-bold text-[#0077CC]">{formatPence(avgPerSession)}</div>
                  <div className="text-[12px] text-gray-500 font-medium mt-0.5">Avg per session</div>
                  {showAvgSubLabel && (
                    <div className="text-[10px] text-[#0077CC] font-medium mt-1">
                      {avgPerSession >= lastMonthAvg ? '↑' : '↓'} vs {formatPence(lastMonthAvg)} last month
                    </div>
                  )}
                </div>
                <div className="w-[0.5px] bg-gray-100" style={{ height: '80%', alignSelf: 'center' }} />
                <div className="flex-1 py-4 text-center px-2">
                  <div className="text-[18px] font-bold text-gray-900">{pendingCount}</div>
                  <div className="text-[12px] text-gray-500 font-medium mt-0.5">Pending payout</div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-medium text-gray-900">Earnings this month</h3>
                {bestDay && (
                  <span className="text-[11px] font-medium text-[#0077CC]">Best day: {bestDay}</span>
                )}
              </div>
              <div style={{ height: '120px' }}>
                <canvas ref={chartRef} />
              </div>
            </div>

            {/* Upcoming payout */}
            {nextPayout && (
              <div className="space-y-3">
                <h2 className="text-[16px] font-bold text-gray-900 px-1">Upcoming payout</h2>
                <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[18px] font-bold text-[#0077CC]">{formatPence(nextPayout.amount_pence)}</span>
                    <span className="text-[14px] text-gray-500 font-medium">{formatReleasedDate(nextPayout.scheduled_at)}</span>
                  </div>

                  {/* 3-step timeline */}
                  <div className="flex items-center w-full">
                    <div className="flex flex-col items-center">
                      <div className="w-[26px] h-[26px] rounded-full bg-[#DCFCE7] text-[#166534] flex items-center justify-center text-[14px] font-medium">
                        ✓
                      </div>
                      <div className="text-[9px] text-gray-500 text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                        Session completed
                      </div>
                    </div>
                    <div className="flex-1 h-[1.5px] bg-[#86EFAC] mx-2" />
                    <div className="flex flex-col items-center">
                      <div className="w-[26px] h-[26px] rounded-full bg-[#0077CC] text-white flex items-center justify-center text-[14px] font-medium">
                        ⟳
                      </div>
                      <div className="text-[9px] text-[#0077CC] font-medium text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                        48hr processing
                      </div>
                    </div>
                    <div className="flex-1 h-[1.5px] bg-[#E2E8F0] mx-2" />
                    <div className="flex flex-col items-center">
                      <div className="w-[26px] h-[26px] rounded-full bg-[#F1F5F9] text-[#94A3B8] flex items-center justify-center text-[14px] font-medium">
                        £
                      </div>
                      <div className="text-[9px] text-gray-400 text-center mt-1.5 leading-tight" style={{ maxWidth: '70px' }}>
                        Released to bank
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Transactions */}
            <div className="space-y-3">
              <h2 className="text-[16px] font-bold text-gray-900 px-1">Recent transactions</h2>
              <div className="bg-white border border-[#E2E8F0] rounded-[16px] shadow-sm overflow-hidden">
                <div className="flex flex-col divide-y divide-gray-100">
                  {transactions.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-[14px] text-gray-500 font-medium">No transactions yet</p>
                    </div>
                  ) : (
                    transactions.map((tx) => (
                      <div key={tx.id} className="p-4 px-5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-medium ${
                          tx.type === 'solo'
                            ? 'bg-[#E6F1FB] text-[#0C447C]'
                            : 'bg-[#EDE9FE] text-[#4C1D95]'
                        }`}>
                          {tx.type === 'solo' ? '1:1' : 'GRP'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-gray-900 truncate">{tx.name}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5 truncate">{tx.meta}</div>
                        </div>
                        <div className="text-[12px] font-medium text-[#166534] shrink-0">{tx.amount}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t-[0.5px] border-gray-100 py-2.5 px-4 text-center">
                  <button className="text-[11px] font-medium text-[#0077CC] hover:text-[#0066AA] transition-colors">
                    View all transactions →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
