'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { BookingCard } from './BookingCard'
import { BookingListRow } from './BookingListRow'
import { BookingDetailPanel } from './BookingDetailPanel'
import type { ParentBookingItem, ParentBookingsData } from './types'

// P-14 — parent bookings orchestrator. Upcoming / Past sessions tabs;
// mobile (< md) renders full-detail cards, desktop (md+) renders the
// two-column list + detail layout from the design. All data arrives
// assembled from the server component — no client fetching. Long lists
// paginate client-side (design fix 1): 10 per page + "Load more".

type Tab = 'upcoming' | 'past'

const PAGE_SIZE = 10

interface ParentBookingsClientProps {
  data: ParentBookingsData
}

function TabButton({
  id,
  panelId,
  label,
  active,
  onClick,
}: {
  id: string
  panelId: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      aria-selected={active}
      aria-controls={panelId}
      role="tab"
      className={`h-11 px-1 text-[15px] font-medium border-b-2 transition-colors ${
        active
          ? 'border-brand-600 text-brand-600'
          : 'border-transparent text-slate-500 hover:text-neutral-600'
      }`}
    >
      {label}
    </button>
  )
}

function EmptyTab({ tab }: { tab: Tab }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-16">
      <CalendarDays size={40} strokeWidth={1.5} className="text-neutral-400" />
      <h3 className="text-lg font-semibold text-neutral-900">
        {tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions yet'}
      </h3>
      <p className="text-sm text-neutral-600 max-w-sm">
        {tab === 'upcoming'
          ? 'When you book a session with a coach, it will show up here.'
          : 'Sessions you have completed will appear here.'}
      </p>
      {tab === 'upcoming' ? (
        <Link
          href="/coaches"
          className="mt-2 inline-flex items-center justify-center h-11 px-6 rounded-md bg-brand-600 text-white text-[15px] font-medium hover:bg-brand-700 active:scale-[0.98] transition-all"
        >
          Find a coach
        </Link>
      ) : null}
    </div>
  )
}

export function ParentBookingsClient({ data }: ParentBookingsClientProps) {
  const [tab, setTab] = useState<Tab>('upcoming')
  // Desktop selection per tab, so switching tabs restores each tab's pick.
  const [selectedUpcomingId, setSelectedUpcomingId] = useState<string | null>(null)
  const [selectedPastId, setSelectedPastId] = useState<string | null>(null)
  // Pagination per tab — "Load more" only ever grows the window.
  const [visibleUpcoming, setVisibleUpcoming] = useState(PAGE_SIZE)
  const [visiblePast, setVisiblePast] = useState(PAGE_SIZE)

  const fullList: ParentBookingItem[] = tab === 'upcoming' ? data.upcoming : data.past
  const visibleCount = tab === 'upcoming' ? visibleUpcoming : visiblePast
  const list = fullList.slice(0, visibleCount)
  const hasMore = fullList.length > list.length

  const loadMore = () => {
    if (tab === 'upcoming') setVisibleUpcoming((count) => count + PAGE_SIZE)
    else setVisiblePast((count) => count + PAGE_SIZE)
  }

  const selectedId = tab === 'upcoming' ? selectedUpcomingId : selectedPastId
  const selected: ParentBookingItem | null =
    list.find((b) => b.id === selectedId) ?? list[0] ?? null

  const selectBooking = (id: string) => {
    if (tab === 'upcoming') setSelectedUpcomingId(id)
    else setSelectedPastId(id)
  }

  const loadMoreButton = hasMore ? (
    <button
      type="button"
      onClick={loadMore}
      className="h-11 rounded-md border border-neutral-100 bg-white text-sm font-medium text-brand-600 hover:bg-brand-50 active:scale-[0.98] transition-all"
    >
      Load more
    </button>
  ) : null

  return (
    <main className="pb-16">
      <div className="bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pt-6 md:pt-7">
          <h1 className="text-[28px] font-bold tracking-tight text-gray-900">Bookings</h1>
          <div className="flex gap-5 mt-2" role="tablist" aria-label="Bookings">
            <TabButton
              id="bookings-tab-upcoming"
              panelId="bookings-panel"
              label="Upcoming"
              active={tab === 'upcoming'}
              onClick={() => setTab('upcoming')}
            />
            <TabButton
              id="bookings-tab-past"
              panelId="bookings-panel"
              label="Past sessions"
              active={tab === 'past'}
              onClick={() => setTab('past')}
            />
          </div>
        </div>
      </div>

      <div
        id="bookings-panel"
        role="tabpanel"
        aria-labelledby={tab === 'upcoming' ? 'bookings-tab-upcoming' : 'bookings-tab-past'}
        className="mx-auto max-w-5xl px-4 md:px-8 pt-4 md:pt-6"
      >
        {list.length === 0 ? (
          <EmptyTab tab={tab} />
        ) : (
          <>
            {/* Mobile — full-detail card list */}
            <div className="flex flex-col gap-3 md:hidden">
              {list.map((booking) => (
                <BookingCard key={booking.id} booking={booking} tab={tab} />
              ))}
              {loadMoreButton}
            </div>

            {/* Desktop — two-column: list left, detail right. No items-start:
                the detail panel stretches to the full row height (fix 2). */}
            <div className="hidden md:grid grid-cols-[minmax(0,380px)_1fr] gap-6">
              <div className="flex flex-col gap-2.5">
                {list.map((booking) => (
                  <BookingListRow
                    key={booking.id}
                    booking={booking}
                    selected={selected?.id === booking.id}
                    onSelect={() => selectBooking(booking.id)}
                  />
                ))}
                {loadMoreButton}
              </div>
              {selected ? <BookingDetailPanel booking={selected} tab={tab} /> : null}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
