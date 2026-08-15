import { SlotPickerSkeleton } from '@/components/parent/booking/SlotPickerClient'

// P-10: route-level loading state — never a blank screen while the server
// component fetches coach + availability.

export default function Loading() {
  return (
    <main className="min-h-[calc(100vh-64px)] bg-slate-50">
      <SlotPickerSkeleton />
    </main>
  )
}
