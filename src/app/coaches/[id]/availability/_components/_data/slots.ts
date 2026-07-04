// BUG-19 Phase 1: the pure slot helpers moved to src/lib/availability/slots.ts
// so the guest bookings API route (POST /api/guest/bookings) validates a
// requested slot with the EXACT same bookableSlots() definition this calendar
// renders from — no read/write drift. This shim preserves the existing import
// path for the UI; add new imports against @/lib/availability/slots directly.
export * from '@/lib/availability/slots'
