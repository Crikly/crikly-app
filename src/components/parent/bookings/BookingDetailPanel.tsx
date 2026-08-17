'use client'

import { AddToCalendarButton } from './AddToCalendarButton'
import type { ParentBookingItem } from './types'

// P-14 — desktop detail panel (right column). Facts grid per the design:
// When / Venue / Who it's for / Total paid. The inline cancellation
// expansion lands here in Phase 3; past bookings reserve the review slot
// for P-20.

interface BookingDetailPanelProps {
  booking: ParentBookingItem
  tab: 'upcoming' | 'past'
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-md px-4 py-3.5">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="text-sm text-neutral-900 mt-1 leading-relaxed">{value}</div>
    </div>
  )
}

export function BookingDetailPanel({ booking, tab }: BookingDetailPanelProps) {
  const cancelled = booking.isCancelled

  return (
    <div className="bg-white rounded-lg shadow-sm p-7">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-800 font-medium text-xl flex items-center justify-center shrink-0">
          {booking.coachInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold tracking-tight text-neutral-900">
            {booking.coachName}
          </div>
          <div className="text-sm text-slate-500 mt-0.5">{booking.sessionLine}</div>
        </div>
        {cancelled ? (
          <span className="shrink-0 text-xs font-medium text-danger bg-red-100 rounded-sm px-2.5 py-1">
            Cancelled
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <FactTile label="When" value={booking.whenLabel} />
        <FactTile label="Venue" value={booking.venueLabel} />
        <FactTile label="Who it's for" value={booking.participantLabel} />
        <FactTile label="Total paid" value={booking.paidLabel} />
      </div>

      {tab === 'upcoming' && !cancelled ? (
        <div className="flex items-center gap-3 mt-6">
          <AddToCalendarButton booking={booking} variant="button" />
        </div>
      ) : null}

      {cancelled && booking.cancelledLine ? (
        <div className="mt-5 text-sm text-slate-500 bg-slate-50 rounded-md px-4 py-3">
          {booking.cancelledLine}
        </div>
      ) : null}
    </div>
  )
}
