import { SlotPickerSkeleton } from '@/components/parent/booking/SlotPickerClient'

// P-10: route-level loading state — never a blank screen while the server
// component fetches coach + availability + children.

export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 pt-5 lg:pt-7">
      <div className="mb-7 animate-pulse border-b border-gray-100 pb-6">
        <div className="mb-5 h-4 w-40 rounded bg-gray-100" />
        <div className="h-8 w-56 rounded bg-gray-100" />
        <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
      </div>
      <SlotPickerSkeleton />
    </main>
  )
}
