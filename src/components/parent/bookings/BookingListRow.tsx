'use client'

import { Badge } from '@/components/ui/Badge'
import type { ParentBookingItem } from './types'

// P-14 — desktop list row (left column of the two-column layout). Selection
// uses the coach-schedule pattern (design fix 4): brand-50 background +
// 3px brand-600 left border. The unselected row keeps a transparent left
// border so selection never shifts the layout. The initials circle is
// tinted with the coach's identity-palette colour — inline style is the
// documented exception for dynamic identity hues (childIdentity.ts).

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
      className={`w-full text-left rounded-lg p-3.5 px-4 flex items-center gap-3 transition-all shadow-sm border-l-[3px] ${
        selected
          ? 'bg-brand-50 border-l-brand-600'
          : 'bg-white border-l-transparent'
      } ${booking.isCancelled ? 'opacity-60' : ''}`}
    >
      <div
        className="w-10 h-10 rounded-full font-medium text-sm flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${booking.coachColour}1A`, color: booking.coachColour }}
      >
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
        {booking.isCancelled ? <Badge variant="cancelled">Cancelled</Badge> : null}
      </div>
    </button>
  )
}
