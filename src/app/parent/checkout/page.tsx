import { Suspense } from 'react'
import type { Metadata } from 'next'
import { CheckoutPlaceholder } from './_components/CheckoutPlaceholder'

// P-10 fix 5: placeholder route so the authed booking CTA no longer lands on
// a 404. Auth comes from src/proxy.ts (protected prefix) + parent/layout.tsx.
// P-13 replaces this page entirely with the real checkout (summary + Stripe
// Payment Element + POST /api/parent/bookings).

export const metadata: Metadata = {
  title: 'Checkout — Crikly',
}

export default function ParentCheckoutPage() {
  // useSearchParams in the client component requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <CheckoutPlaceholder />
    </Suspense>
  )
}
