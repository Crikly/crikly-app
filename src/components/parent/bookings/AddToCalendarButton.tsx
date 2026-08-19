'use client'

import { buildBookingIcs, bookingIcsFilename } from '@/lib/calendar/ics'
import type { ParentBookingItem } from './types'

// P-14 — "Add to calendar": builds the booking's .ics client-side and hands
// it to the browser as a download. No API round-trip; the builder is the same
// one the confirmation-email attachment uses (CF-NOTIFY-03).

interface AddToCalendarButtonProps {
  booking: ParentBookingItem
  /** 'link' = text link (mobile card footer) · 'button' = secondary button (desktop detail) */
  variant: 'link' | 'button'
}

function downloadIcs(booking: ParentBookingItem): void {
  const ics = buildBookingIcs({
    bookingReference: booking.reference,
    sportName: booking.sportName,
    coachName: booking.coachName,
    sessionDate: booking.sessionDate,
    startTime: booking.startTime,
    endTime: booking.endTime,
    venue: booking.icsVenue,
    nowMs: Date.now(),
  })
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = bookingIcsFilename(booking.reference)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function AddToCalendarButton({ booking, variant }: AddToCalendarButtonProps) {
  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={() => downloadIcs(booking)}
        className="text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
      >
        Add to calendar
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => downloadIcs(booking)}
      className="h-11 px-5 rounded-md border-[1.5px] border-brand-600 bg-white text-brand-600 text-sm font-medium hover:bg-brand-50 active:scale-[0.98] transition-all"
    >
      Add to calendar
    </button>
  )
}
