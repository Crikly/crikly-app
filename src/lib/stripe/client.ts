import Stripe from 'stripe'

let _stripe: Stripe | null = null

/**
 * Returns the shared Stripe client, instantiating it lazily on first use.
 *
 * Lazy on purpose: importing this module must NOT instantiate Stripe (or throw
 * on a missing key) at module-evaluation time. Next.js loads every route module
 * during the build's "Collecting page data" phase, so an eager
 * `new Stripe(process.env.STRIPE_SECRET_KEY!)` crashes the whole build on any
 * machine without the key set. The key is only genuinely needed when a handler
 * actually calls Stripe at request time.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: '2026-03-25.dahlia',
    typescript: true,
  })
  return _stripe
}
