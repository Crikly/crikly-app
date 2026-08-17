'use client'

import type { ParentBookingItem } from './types'

// P-14 — desktop list row (left column of the two-column layout). Selection
// uses the DS "selectable option card" exception: 1.5px brand ring, inset.

interface BookingListRowProps {
  booking: ParentBookingItem
  selected: boolean
  onSelect: () => void
}

export function BookingListRow({ booking, selected, onSelect }: BookingListRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`w-full text-left rounded-lg p-3.5 px-4 flex items-center gap-3 transition-all shadow-sm ${
        selected ? 'bg-neutral-50 ring-[1.5px] ring-inset ring-brand-600' : 'bg-white'
      } ${booking.isCancelled ? 'opacity-60' : ''}`}
    >
      <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-800 font-medium text-sm flex items-center justify-center shrink-0">
        {booking.coachInitials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium text-neutral-900 leading-tight truncate">
          {booking.coachName}
        </div>
        <div className="text-sm text-slate-500 leading-snug truncate">
          {booking.shortWhenLabel} · {booking.participantLabel}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="text-sm font-medium text-neutral-900">{booking.paidLabel}</div>
        {booking.isCancelled ? (
          <span className="text-xs font-medium text-danger bg-red-100 rounded-sm px-1.5 py-0.5">
            Cancelled
          </span>
        ) : null}
      </div>
    </button>
  )
}
