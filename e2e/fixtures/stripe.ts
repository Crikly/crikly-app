// TEST-E2E-03: minimal Stripe Payment Element helper for guest checkout specs.
//
// The guest flows (GuestBookingFlow / GuestEnrolmentFlow) render a card-only
// Payment Element in deferred-intent mode. elements.submit() validates the
// card inputs BEFORE any booking POST fires, so even a 409-path spec must put
// a valid test card in the element first.
//
// Card numbers are Stripe's public test cards (docs.stripe.com/testing) —
// never real card data. This helper types into Stripe's own hosted iframe;
// no card value ever touches app code or logs (PCI: Stripe-hosted fields).
//
// Approved TEST-E2E-03 Step 0 (gap decision 1): if this proves brittle, the
// paying Gate 3 steps degrade to manual execution.

import type { Page } from '@playwright/test'

export const STRIPE_TEST_CARD = {
  number: '4242424242424242', // succeeds without 3DS
  expiry: '12/30',
  cvc: '123',
}

/**
 * Fills the card-only Payment Element. The element lives in a Stripe-hosted
 * iframe titled "Secure payment input frame"; the inner inputs are named
 * number/expiry/cvc. Waits for the frame to mount (Stripe JS loads from
 * js.stripe.com, so first paint can lag the page itself).
 */
export async function fillPaymentElementCard(page: Page): Promise<void> {
  const frame = page.frameLocator('iframe[title="Secure payment input frame"]').first()
  const numberInput = frame.locator('input[name="number"]')
  await numberInput.waitFor({ state: 'visible', timeout: 20_000 })
  await numberInput.fill(STRIPE_TEST_CARD.number)
  await frame.locator('input[name="expiry"]').fill(STRIPE_TEST_CARD.expiry)
  await frame.locator('input[name="cvc"]').fill(STRIPE_TEST_CARD.cvc)
  // Card-only + billingDetails 'never' normally hides the postal field, but
  // Stripe controls the element's internals — fill it if it renders so the
  // element validates either way.
  const postal = frame.locator('input[name="postalCode"]')
  if ((await postal.count()) > 0 && (await postal.isVisible().catch(() => false))) {
    await postal.fill('SW1A 1AA')
  }
}

/**
 * Clicks the pay button, retrying once if the click is swallowed.
 *
 * Observed in headless probes: the first main-frame click after focus has
 * been inside the Stripe cross-origin iframe is intermittently consumed by
 * the focus shift and never reaches the button's onClick. If the button is
 * still at rest ("Pay £…") with no error banner ~3s after the click, one
 * retry lands reliably.
 */
export async function clickPayResilient(page: Page, payButtonTestId: string): Promise<void> {
  const pay = page.getByTestId(payButtonTestId)
  for (let attempt = 0; attempt < 4; attempt++) {
    await pay.click()
    await page.waitForTimeout(4_000)
    // Reaction = button flipped to "Processing…" / unmounted (confirmation
    // view), or an error banner rendered. Still "Pay £…" with no banner
    // means the click was swallowed — try again.
    const label = (await pay.textContent().catch(() => '')) ?? ''
    if (!label.trim().startsWith('Pay £')) return
    const bannerVisible = await page
      .locator('div[role="alert"]:not([id="__next-route-announcer__"])')
      .isVisible()
      .catch(() => false)
    if (bannerVisible) return
  }
}
