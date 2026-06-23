'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Lock,
  CreditCard,
  Check,
  Copy,
  Share2,
  Bookmark,
  AlertCircle,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import {
  BookingSummaryCard,
  formatPence,
  type BookingSummary,
} from './BookingSummaryCard'

/** Recoverable checkout errors surfaced to the guest above the Pay button. */
type CheckoutError = 'payment' | 'slot_taken'

/** All guest-entered values. Held in one object so they persist together
 *  across a failed payment attempt (we never reset this on error). */
interface GuestForm {
  fullName: string
  email: string
  phone: string
  address: string
  townCity: string
  postcode: string
  childFirstName: string
  childAge: string
  cardholderName: string
  billingAddress: string
  billingTownCity: string
  billingPostcode: string
}

const EMPTY_FORM: GuestForm = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  townCity: '',
  postcode: '',
  childFirstName: '',
  childAge: '',
  cardholderName: '',
  billingAddress: '',
  billingTownCity: '',
  billingPostcode: '',
}

interface GuestBookingFlowProps {
  coachId: string
  summary: BookingSummary
  /** Optional pre-set error, used to preview the error banners before the
   *  Stripe flow is wired (P-00c-API). e.g. `?simulateError=slot_taken`. */
  initialError?: CheckoutError
}

export function GuestBookingFlow({
  coachId,
  summary,
  initialError,
}: GuestBookingFlowProps) {
  const [form, setForm] = useState<GuestForm>(EMPTY_FORM)
  const [billingSame, setBillingSame] = useState<boolean>(true)
  const [view, setView] = useState<'checkout' | 'confirmed'>('checkout')
  const [error, setError] = useState<CheckoutError | null>(initialError ?? null)
  const [copied, setCopied] = useState<boolean>(false)

  // STUB — replaced with the real reference returned by the booking API in
  // P-00c-API.
  const bookingReference = 'CRK-7F3A9K'
  const totalPence = summary.sessionFeePence + summary.platformFeePence
  const availabilityHref = `/coaches/${coachId}`
  const billingSummary =
    [form.address, form.townCity, form.postcode].filter(Boolean).join(', ') ||
    'Uses the address from your details above.'

  function setField(key: keyof GuestForm, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handlePay(): void {
    // TODO(P-00c-API): validate the form fields before submission.
    // TODO(P-00c-API): create the Stripe PaymentIntent, confirm the card
    // payment, persist the booking, then advance to the confirmation view.
    // Payment failures and a slot taken mid-checkout will call setError(...)
    // here. Form state is intentionally never reset, so the guest's input
    // survives a failed attempt.
    setError(null)
    setView('confirmed')
  }

  function handleExpressPay(): void {
    // TODO(P-00c-API): launch the Stripe wallet payment sheet. Apple Pay and
    // Google Pay need separate handlers (Apple Pay via the PaymentRequest API,
    // Google Pay via its own Stripe Element) — split this before wiring. The
    // real buttons render their own Apple/Google branding via Stripe.
    // Placeholder only in this task.
  }

  async function handleCopyReference(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(bookingReference)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — silently ignore; the reference is visible.
    }
  }

  async function handleShareReference(): Promise<void> {
    const shareData: ShareData = {
      title: 'Crikly booking confirmed',
      text: `My Crikly session is booked — reference ${bookingReference}.`,
      url: `${availabilityHref}`,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await handleCopyReference()
      }
    } catch {
      // Share dismissed or unsupported — no action needed.
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Shared checkout pieces (computed once per render, reused in both slots).
  // The error banner and the Pay button each appear in two slots — fused
  // inside the summary card on desktop, and stacked at the bottom of the page
  // on mobile — so exactly one of each is visible per breakpoint (the hidden
  // copy is display:none and out of the a11y tree). This keeps the single
  // primary CTA per screen the design intends.
  // ──────────────────────────────────────────────────────────────────────
  const errorBanner = error ? (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-md bg-danger/10 p-3.5 text-danger"
    >
      <AlertCircle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        {error === 'slot_taken' ? (
          <>
            <p className="font-medium">
              This time slot was just booked by someone else.
            </p>
            <Link
              href={availabilityHref}
              className="mt-1 inline-block font-medium underline"
            >
              Choose another time
            </Link>
          </>
        ) : (
          <p className="font-medium">
            {"Payment couldn't be completed. Please check your card details and try again."}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setError(null)}
        aria-label="Dismiss error"
        className="-mr-1 -mt-1 ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  ) : null

  const payButton = (
    <button
      type="button"
      onClick={handlePay}
      className="flex h-btn-mobile w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-base font-semibold text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
    >
      <Lock size={17} aria-hidden="true" />
      Pay {formatPence(totalPence)}
    </button>
  )

  const terms = (
    <p className="px-1.5 text-center text-xs text-neutral-400">
      By booking you agree to our{' '}
      <Link href="/terms" className="font-medium text-brand-600">
        Terms
      </Link>{' '}
      and{' '}
      <Link href="/privacy" className="font-medium text-brand-600">
        Privacy Policy
      </Link>
    </p>
  )

  if (view === 'confirmed') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        {/* Brand lockup */}
        <div className="mb-7 flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-brand-600 text-[13px] font-bold leading-none tracking-tight text-white">
            c
          </span>
          <span className="text-base font-bold tracking-tight text-brand-800">Crikly</span>
        </div>

        {/* Success check */}
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-success/10">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-success">
            <Check size={30} strokeWidth={2.4} className="text-white" aria-hidden="true" />
          </div>
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-heading text-neutral-900">
          {"You're all booked!"}
        </h1>
        <p className="mt-2.5 max-w-[290px] text-base text-neutral-600">
          A confirmation email is on its way to{' '}
          <span className="font-medium text-neutral-900">
            {form.email || 'your email'}
          </span>
        </p>

        {/* Booking reference */}
        <div className="mt-7 flex w-full items-center justify-between gap-3 rounded-lg bg-brand-50 px-4 py-3.5">
          <div className="min-w-0 text-left">
            <p className="text-xs font-semibold uppercase tracking-label text-brand-800">
              Booking reference
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-brand-600">
              {bookingReference}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReference}
              aria-label="Copy booking reference"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-brand-600 shadow-sm transition-transform active:scale-95"
            >
              {copied ? (
                <Check size={18} className="text-success" aria-hidden="true" />
              ) : (
                <Copy size={18} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={handleShareReference}
              aria-label="Share booking"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-white text-brand-600 shadow-sm transition-transform active:scale-95"
            >
              <Share2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Paid summary */}
        <div className="mt-4 w-full text-left">
          <BookingSummaryCard summary={summary} variant="paid" />
        </div>

        {/* Account nudge */}
        <div className="mt-4 flex w-full flex-col gap-3.5 rounded-lg bg-brand-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-white text-brand-600">
              <Bookmark size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-semibold text-neutral-900">
                Save your bookings
              </p>
              <p className="mt-0.5 text-sm text-neutral-600">
                Create a free Crikly account to manage and rebook in seconds.
              </p>
            </div>
          </div>
          <Link
            href="/register"
            className="flex h-btn-mobile items-center justify-center rounded-md border-[1.5px] border-brand-600 bg-white text-base font-semibold text-brand-600 transition-colors hover:bg-brand-50"
          >
            Create account
          </Link>
        </div>

        <Link
          href={availabilityHref}
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to coach profile
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <Link
          href={availabilityHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to availability
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-heading text-neutral-900 lg:text-3xl">
          Complete your booking
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {`Review your session with ${summary.coachName} and pay securely. You won't be charged until you confirm.`}
        </p>
      </div>

      {/* Checkout layout — single instance of the summary and the form. The
          summary moves from the top (mobile) to the right column (desktop)
          via grid placement; its footer fuses the Pay block into the card on
          desktop, while the mobile Pay block sits at the bottom of the page. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:items-start">

        {/* Booking summary — desktop right column, with the fused Pay block */}
        <div className="lg:col-start-2 lg:row-start-1">
          <BookingSummaryCard
            summary={summary}
            variant="checkout"
            footer={
              <div className="mt-5 hidden flex-col gap-3 lg:flex">
                {errorBanner}
                {payButton}
                <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
                  <Lock size={13} aria-hidden="true" />
                  {/* TODO(P-00c-API): make the cancellation window dynamic per
                      coach (BR-05) — 24h is the current default. */}
                  <span>
                    Secured by <span className="font-semibold text-neutral-600">Stripe</span> · free cancellation 24h before
                  </span>
                </div>
              </div>
            }
          />
          <div className="mt-3.5 hidden lg:block">
            {terms}
          </div>
        </div>

        {/* Form column */}
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1 lg:row-span-2">

          {/* Your details */}
          <section className="flex flex-col gap-3.5 lg:gap-4 lg:rounded-lg lg:border lg:border-neutral-100 lg:bg-white lg:p-6 lg:shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 lg:text-lg">Your details</h2>
            <Input
              label="Full name"
              placeholder="Your full name"
              autoComplete="name"
              value={form.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
            />
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2 lg:gap-4">
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
              />
              <Input
                label="Phone"
                type="tel"
                placeholder="07700 900000"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </div>
            <Input
              label="Address"
              placeholder="Address line"
              autoComplete="street-address"
              value={form.address}
              onChange={(e) => setField('address', e.target.value)}
            />
            <div className="grid grid-cols-[1fr_120px] gap-3 lg:grid-cols-[1fr_160px] lg:gap-4">
              <Input
                label="Town/city"
                autoComplete="address-level2"
                value={form.townCity}
                onChange={(e) => setField('townCity', e.target.value)}
              />
              <Input
                label="Postcode"
                autoComplete="postal-code"
                className="uppercase"
                value={form.postcode}
                onChange={(e) => setField('postcode', e.target.value)}
              />
            </div>
          </section>

          {/* Your child */}
          <section className="flex flex-col gap-3.5 lg:gap-4 lg:rounded-lg lg:border lg:border-neutral-100 lg:bg-white lg:p-6 lg:shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 lg:text-lg">Your child</h2>
            <div className="grid grid-cols-[1fr_96px] gap-3 lg:grid-cols-[1fr_140px] lg:gap-4">
              <Input
                label="First name"
                placeholder="e.g. Sam"
                value={form.childFirstName}
                onChange={(e) => setField('childFirstName', e.target.value)}
              />
              <Input
                label="Age"
                inputMode="numeric"
                maxLength={2}
                className="text-center"
                value={form.childAge}
                onChange={(e) => setField('childAge', e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </section>

          {/* Payment */}
          <section className="flex flex-col gap-3 lg:rounded-lg lg:border lg:border-neutral-100 lg:bg-white lg:p-6 lg:shadow-sm">
            <h2 className="text-base font-semibold text-neutral-900 lg:text-lg">Payment</h2>

            {/* Express checkout — placeholders. P-00c-API swaps these for the
                Stripe wallet buttons, which render real Apple/Google branding.
                The weight difference below (Apple semibold / Google medium)
                mirrors each brand's own wordmark, per the approved design. */}
            <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
              <button
                type="button"
                onClick={handleExpressPay}
                aria-label="Pay with Apple Pay"
                className="flex h-12 items-center justify-center rounded-md bg-neutral-900 text-base font-semibold text-white transition-transform active:scale-[0.98]"
              >
                Apple Pay
              </button>
              <button
                type="button"
                onClick={handleExpressPay}
                aria-label="Pay with Google Pay"
                className="flex h-12 items-center justify-center rounded-md bg-neutral-900 text-base font-medium text-white transition-transform active:scale-[0.98]"
              >
                Google Pay
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 py-0.5">
              <span className="h-px flex-1 bg-neutral-100" />
              <span className="whitespace-nowrap text-xs font-medium text-neutral-400">
                Or pay with card
              </span>
              <span className="h-px flex-1 bg-neutral-100" />
            </div>

            <Input
              label="Cardholder name"
              placeholder="Name on card"
              autoComplete="cc-name"
              value={form.cardholderName}
              onChange={(e) => setField('cardholderName', e.target.value)}
            />

            {/* Billing address */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setBillingSame((prev) => !prev)}
                className="flex items-center gap-2.5 text-left"
                aria-pressed={billingSame}
              >
                <span
                  className={[
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm',
                    billingSame
                      ? 'bg-brand-600'
                      : 'border-[1.5px] border-neutral-100 bg-white',
                  ].join(' ')}
                >
                  {billingSame ? (
                    <Check size={14} strokeWidth={2.6} className="text-white" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="text-sm font-medium text-neutral-600">
                  Billing address same as my details
                </span>
              </button>
              {billingSame ? (
                // pl-[30px] aligns the text under the label, clearing the
                // checkbox (w-5 = 20px) + its gap-2.5 (10px) = 30px.
                <p className="pl-[30px] text-sm text-neutral-600">{billingSummary}</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <Input
                    placeholder="Billing address"
                    autoComplete="billing street-address"
                    value={form.billingAddress}
                    onChange={(e) => setField('billingAddress', e.target.value)}
                  />
                  <div className="grid grid-cols-[1fr_120px] gap-2.5 lg:grid-cols-[1fr_160px]">
                    <Input
                      placeholder="Town/city"
                      autoComplete="billing address-level2"
                      value={form.billingTownCity}
                      onChange={(e) => setField('billingTownCity', e.target.value)}
                    />
                    <Input
                      placeholder="Postcode"
                      autoComplete="billing postal-code"
                      className="uppercase"
                      value={form.billingPostcode}
                      onChange={(e) => setField('billingPostcode', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Card element placeholder — replaced by the Stripe Card Element in
                P-00c-API. */}
            <div className="overflow-hidden rounded-md border border-neutral-100 bg-white">
              <div className="flex h-input-mobile items-center gap-2.5 border-b border-neutral-100 px-3.5">
                <CreditCard size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
                <span className="text-base text-neutral-400">Card number</span>
              </div>
              <div className="flex">
                <div className="flex h-input-mobile flex-1 items-center border-r border-neutral-100 px-3.5">
                  <span className="text-base text-neutral-400">MM / YY</span>
                </div>
                <div className="flex h-input-mobile flex-1 items-center px-3.5">
                  <span className="text-base text-neutral-400">CVC</span>
                </div>
              </div>
            </div>

            {/* Secured by Stripe — sits in the payment section on mobile and
                in the desktop form card, matching the design. */}
            <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
              <Lock size={13} aria-hidden="true" />
              <span>
                Secured by <span className="font-semibold text-neutral-600">Stripe</span>
              </span>
            </div>
          </section>
        </div>

        {/* Pay block — bottom of the page on mobile, hidden on desktop where it
            is fused into the summary card above. */}
        <div className="flex flex-col gap-3.5 lg:hidden">
          {errorBanner}
          {payButton}
          {terms}
        </div>
      </div>
    </div>
  )
}
