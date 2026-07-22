import { loadStripe, type Stripe } from '@stripe/stripe-js'

// Browser-side Stripe.js loader. Memoised so the script is fetched once per page
// session (loadStripe is safe to call repeatedly, but caching the promise avoids
// re-instantiating across re-renders). The publishable key is safe to expose —
// it is the NEXT_PUBLIC_ half of the keypair; the secret key never reaches the
// browser.

let stripePromise: Promise<Stripe | null> | null = null

export function getStripePromise(): Promise<Stripe | null> {
  if (stripePromise) return stripePromise

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!publishableKey) {
    // Surface a clear console error rather than a cryptic Elements failure.
    console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
    stripePromise = Promise.resolve(null)
    return stripePromise
  }

  stripePromise = loadStripe(publishableKey)
  return stripePromise
}
