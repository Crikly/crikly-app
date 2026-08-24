'use client'

import { Calendar, MapPin, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { AddToCalendarButton } from './AddToCalendarButton'
import { CancelPanel, type CancelResult } from './CancelPanel'
import type { ParentBookingItem } from './types'

// P-14 — mobile booking card (design: Mobile · 390 frame). One card carries
// the full session detail; the inline cancellation panel (Phase 3) expands
// inside it — while open, the footer actions hide (design). Past cards
// reserve the review slot for P-20 — no actions yet.

interface BookingCardProps {
  booking: ParentBookingItem
  tab: 'upcoming' | 'past'
  cancelOpen: boolean
  onOpenCancel: () => void
  onKeep: () => void
  onCancelled: (result: CancelResult) => void
}

function DetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-600">
      <span className="shrink-0 text-neutral-400">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

export function BookingCard({
  booking,
  tab,
  cancelOpen,
  onOpenCancel,
  onKeep,
  onCancelled,
}: BookingCardProps) {
  const cancelled = booking.isCancelled

  return (
    <div
      className={`bg-white rounded-lg shadow-sm p-4 transition-opacity ${
        cancelled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-11 h-11 rounded-full font-medium text-base flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${booking.coachColour}1A`, color: booking.coachColour }}
        >
          {booking.coachInitials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium text-neutral-900 leading-snug">
            {booking.coachName}
          </div>
          <div className="text-sm text-slate-500 leading-snug">{booking.sessionLine}</div>
        </div>
        {cancelled ? (
          <Badge variant="cancelled" className="shrink-0">
            Cancelled
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 mt-3.5">
        <DetailRow icon={<Calendar size={16} strokeWidth={2} />}>
          {booking.whenLabel}
        </DetailRow>
        <DetailRow icon={<MapPin size={16} strokeWidth={2} />}>
          {booking.venueLabel}
        </DetailRow>
        <DetailRow icon={<User size={16} strokeWidth={2} />}>
          For {booking.participantLabel}
        </DetailRow>
      </div>

      <div className="flex items-center justify-between mt-3.5 pt-3.5 border-t border-slate-100">
        <div className="text-[15px] font-medium text-neutral-900">
          {booking.paidLabel}{' '}
          <span className="text-xs font-normal text-neutral-400">paid</span>
        </div>
        {tab === 'upcoming' && !cancelled && !cancelOpen ? (
          <div className="flex items-center gap-5">
            {/* PROGRAMME-BOOKINGS-LIST: no .ics for programme entries — the
                builder is single-date; multi-date calendar export is later
                work. Cancel is already gated by allowsCancel (hard-false). */}
            {booking.kind !== 'programme' ? (
              <AddToCalendarButton booking={booking} variant="link" />
            ) : null}
            {booking.allowsCancel ? (
              <button
                type="button"
                onClick={onOpenCancel}
                className="text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors"
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {cancelOpen && !cancelled ? (
        <div className="mt-3.5">
          <CancelPanel booking={booking} onKeep={onKeep} onCancelled={onCancelled} />
        </div>
      ) : null}

      {cancelled && booking.cancelledLine ? (
        <div className="mt-3.5 text-sm text-slate-500 bg-slate-50 rounded-md px-4 py-3">
          {booking.cancelledLine}
        </div>
      ) : null}
    </div>
  )
}
