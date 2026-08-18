'use client'

import { Badge } from '@/components/ui/Badge'
import { AddToCalendarButton } from './AddToCalendarButton'
import type { ParentBookingItem } from './types'

// P-14 — desktop detail panel (right column). Facts grid per the design:
// When / Venue / Who it's for / Total paid, plus (design fix 3) Booking
// reference and Payment method. h-full stretches the panel to match the
// list column (design fix 2 — the grid row is as tall as the longer
// column). The inline cancellation expansion lands here in Phase 3; past
// bookings reserve the review slot for P-20.

interface BookingDetailPanelProps {
  booking: ParentBookingItem
  tab: 'upcoming' | 'past'
}

function FactTile({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="bg-slate-50 rounded-md px-4 py-3.5">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`text-sm text-neutral-900 mt-1 leading-relaxed ${
          mono ? 'font-mono font-semibold text-brand-600' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}

export function BookingDetailPanel({ booking, tab }: BookingDetailPanelProps) {
  const cancelled = booking.isCancelled

  return (
    <div className="bg-white rounded-lg shadow-sm p-7 h-full">
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-full font-medium text-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${booking.coachColour}1A`, color: booking.coachColour }}
        >
          {booking.coachInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xl font-semibold tracking-tight text-neutral-900">
            {booking.coachName}
          </div>
          <div className="text-sm text-slate-500 mt-0.5">{booking.sessionLine}</div>
        </div>
        {cancelled ? (
          <Badge variant="cancelled" className="shrink-0">
            Cancelled
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <FactTile label="When" value={booking.whenLabel} />
        <FactTile label="Venue" value={booking.venueLabel} />
        <FactTile label="Who it's for" value={booking.participantLabel} />
        <FactTile label="Total paid" value={booking.paidLabel} />
        <FactTile label="Booking reference" value={booking.reference} mono />
        <FactTile label="Payment method" value={booking.paymentMethodLabel} />
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
