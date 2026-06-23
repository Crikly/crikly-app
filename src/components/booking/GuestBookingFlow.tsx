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
} from '@/components/booking/BookingSummaryCard'

type CheckoutError = 'payment' | 'slot_taken'

interface GuestForm {
  fullName: string
  email: string
  phone: string
  address: string
  townCity: string
  postcode: string
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
  cardholderName: '',
  billingAddress: '',
  billingTownCity: '',
  billingPostcode: '',
}

interface GuestBookingFlowProps {
  coachId: string
  summary: BookingSummary
  initialError?: CheckoutError
}

const BOOKING_REFERENCE = 'CRK-7F3A9K'

export function GuestBookingFlow({ coachId, summary, initialError }: GuestBookingFlowProps) {
  const [form, setForm] = useState<GuestForm>(EMPTY_FORM)
  const [billingSame, setBillingSame] = useState<boolean>(true)
  const [view, setView] = useState<'checkout' | 'confirmed'>('checkout')
  const [error, setError] = useState<CheckoutError | null>(initialError ?? null)
  const [copied, setCopied] = useState<boolean>(false)

  const totalPence = summary.sessionFeePence + summary.platformFeePence
  const availabilityHref = `/coaches/${coachId}`
  const billingSummary =
    [form.address, form.townCity, form.postcode].filter(Boolean).join(', ') ||
    'Uses the address from your details above.'

  function setField(key: keyof GuestForm, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handlePay(): void {
    setError(null)
    setView('confirmed')
  }

  function handleExpressPay(): void {
    // TODO(P-00c-API): launch Stripe wallet sheet.
  }

  async function handleCopyReference(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(BOOKING_REFERENCE)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — silently ignore.
    }
  }

  async function handleShareReference(): Promise<void> {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Crikly booking confirmed',
          text: `My Crikly session is booked — reference ${BOOKING_REFERENCE}.`,
          url: availabilityHref,
        })
      } else {
        await handleCopyReference()
      }
    } catch {
      // Share dismissed or unsupported.
    }
  }

  // ── Shared UI fragments ────────────────────────────────────────────────────

  const errorBanner = error ? (
    <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-danger/10 p-3.5 text-danger">
      <AlertCircle size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        {error === 'slot_taken' ? (
          <>
            <p className="font-medium">This time slot was just booked by someone else.</p>
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
        data-testid="dismiss-error-button"
        className="-mr-1 -mt-1 ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-black/5"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  ) : null

  const payButton = (
    <button
      type="button"
      onClick={handlePay}
      data-testid="pay-button"
      className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-600 text-[16px] font-semibold tracking-[-0.01em] text-white transition-all hover:bg-brand-700 active:scale-[0.98]"
    >
      <Lock size={17} aria-hidden="true" />
      Pay {formatPence(totalPence)}
    </button>
  )

  const stripeNote = (
    <div className="flex items-center justify-center gap-1.5 text-[12px] text-neutral-400">
      <Lock size={13} aria-hidden="true" />
      <span>
        Secured by{' '}
        <span className="font-semibold text-[#64748B]">Stripe</span>
        <span className="hidden lg:inline">{". Your card details never touch Crikly's servers."}</span>
      </span>
    </div>
  )

  const terms = (
    <p className="px-1.5 text-center text-[12px] leading-[1.5] text-neutral-400">
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

  // ── Confirmation view ──────────────────────────────────────────────────────

  if (view === 'confirmed') {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        {/* Brand lockup */}
        <div className="mt-3 mb-[30px] flex items-center gap-[7px]">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-brand-600 text-[13px] font-bold leading-none tracking-[-0.02em] text-white">
            c
          </span>
          <span className="text-[16px] font-bold tracking-[-0.02em] text-brand-800">Crikly</span>
        </div>

        {/* Success circle */}
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#DCFCE7]">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-success">
            <Check size={30} strokeWidth={2.4} className="text-white" aria-hidden="true" />
          </div>
        </div>

        <h1 className="mt-6 text-[27px] font-medium tracking-[-0.01em] text-neutral-900">
          {"You're all booked!"}
        </h1>
        <p className="mt-2.5 max-w-[290px] text-base text-neutral-600">
          A confirmation email is on its way to{' '}
          <span className="font-medium text-neutral-900">{form.email || 'your email'}</span>
        </p>

        {/* Reference card */}
        <div className="mt-7 flex w-full items-center justify-between gap-3 rounded-[12px] bg-neutral-50 px-4 py-3.5">
          <div className="min-w-0 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-brand-800 opacity-75">
              Booking reference
            </p>
            <p className="mt-[5px] font-mono text-[19px] font-semibold tracking-[0.06em] text-brand-600">
              {BOOKING_REFERENCE}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReference}
              aria-label="Copy booking reference"
              data-testid="copy-reference-button"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-brand-100 bg-white text-brand-600 transition-transform hover:bg-brand-50 active:scale-95"
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
              data-testid="share-button"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-brand-100 bg-white text-brand-600 transition-transform hover:bg-brand-50 active:scale-95"
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
        <div className="mt-4 flex w-full flex-col gap-[13px] rounded-[12px] border border-[#CFE3F8] bg-neutral-50 p-4 text-left">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
              <Bookmark size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">
                Save your bookings
              </p>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-[#64748B]">
                Create a free Crikly account to manage and rebook in seconds.
              </p>
            </div>
          </div>
          <Link
            href="/register"
            className="flex h-[46px] items-center justify-center rounded-[10px] border-[1.5px] border-brand-600 bg-white text-[15px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
          >
            Create account
          </Link>
        </div>

        {/* Back link */}
        <Link
          href={availabilityHref}
          className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#64748B] transition-colors hover:text-neutral-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to coach profile
        </Link>
      </div>
    )
  }

  // ── Checkout view ──────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <Link
        href={availabilityHref}
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#64748B] transition-colors hover:text-neutral-900"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to availability
      </Link>
      <h1 className="mt-[18px] text-2xl font-semibold tracking-[-0.02em] text-neutral-900 lg:text-[30px]">
        Complete your booking
      </h1>
      <p className="mb-6 mt-2 text-base text-[#64748B] lg:mb-7">
        {`Review your session with ${summary.coachName} and pay securely.`}
      </p>

      {/* 3-item grid — reflows between mobile (1 col) and desktop (2 col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">

        {/* ① Summary — DOM-first → mobile top; desktop col-2 row-1, sticky */}
        <div className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
          <BookingSummaryCard
            summary={summary}
            variant="checkout"
            footer={
              <div className="mt-5 hidden flex-col gap-3 lg:flex">
                {errorBanner}
                {payButton}
                {stripeNote}
              </div>
            }
          />
          <p className="mt-[14px] hidden px-1.5 text-center text-[12px] leading-[1.5] text-neutral-400 lg:block">
            By booking you agree to our{' '}
            <Link href="/terms" className="font-medium text-brand-600">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium text-brand-600">
              Privacy Policy
            </Link>
          </p>
        </div>

        {/* ② Form column — desktop col-1, spans both rows */}
        <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:gap-5">

          {/* Your details */}
          <section className="flex flex-col">
            <h2 className="mb-[14px] text-base font-semibold tracking-[-0.01em] text-neutral-900 lg:mb-[18px] lg:text-lg">
              Your details
            </h2>
            <div className="flex flex-col gap-[14px] lg:gap-4 lg:rounded-[12px] lg:border lg:border-neutral-100 lg:bg-white lg:p-6">
              <Input
                label="Full name"
                placeholder="Your full name"
                autoComplete="name"
                value={form.fullName}
                onChange={(e) => setField('fullName', e.target.value)}
              />
              <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-2 lg:gap-4">
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
                  label="Town / city"
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
            </div>
          </section>

          {/* Payment */}
          <section className="flex flex-col">
            <h2 className="mb-3 text-base font-semibold tracking-[-0.01em] text-neutral-900 lg:mb-4 lg:text-lg">
              Payment
            </h2>
            <div className="flex flex-col gap-3 lg:gap-4 lg:rounded-[12px] lg:border lg:border-neutral-100 lg:bg-white lg:p-6">

              {/* Express checkout */}
              <div className="grid grid-cols-2 gap-2.5 lg:gap-3">
                <button
                  type="button"
                  onClick={handleExpressPay}
                  aria-label="Pay with Apple Pay"
                  data-testid="apple-pay-button"
                  className="flex h-12 items-center justify-center rounded-[10px] bg-black text-[17px] font-semibold text-white transition-transform active:scale-[0.98]"
                >
                  Apple Pay
                </button>
                <button
                  type="button"
                  onClick={handleExpressPay}
                  aria-label="Pay with Google Pay"
                  data-testid="google-pay-button"
                  className="flex h-12 items-center justify-center rounded-[10px] bg-black text-[17px] font-medium text-white transition-transform active:scale-[0.98]"
                >
                  Google Pay
                </button>
              </div>

              {/* Or divider */}
              <div className="flex items-center gap-3 py-0.5">
                <span className="h-px flex-1 bg-neutral-100" />
                <span className="whitespace-nowrap text-[12px] font-medium text-neutral-400">
                  Or pay with card
                </span>
                <span className="h-px flex-1 bg-neutral-100" />
              </div>

              {/* Cardholder name */}
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
                  data-testid="billing-same-toggle"
                  aria-pressed={billingSame}
                  className="flex items-center gap-2.5 text-left"
                >
                  <span
                    className={[
                      'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[6px]',
                      billingSame
                        ? 'border border-brand-600 bg-brand-600'
                        : 'border-[1.5px] border-[#CBD5E1] bg-white',
                    ].join(' ')}
                  >
                    {billingSame && (
                      <Check size={14} strokeWidth={2.6} className="text-white" aria-hidden="true" />
                    )}
                  </span>
                  <span className="text-[14px] font-medium text-[#334155]">
                    Billing address same as my details
                  </span>
                </button>
                {billingSame ? (
                  <p className="pl-[30px] text-[13px] leading-[1.45] text-[#64748B]">
                    {billingSummary}
                  </p>
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
                        placeholder="Town / city"
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

              {/* Card element placeholder — mobile: 2-row, desktop: single row */}
              <div className="overflow-hidden rounded-[10px] border border-[#CBD5E1] bg-white lg:hidden">
                <div className="flex h-[50px] items-center gap-2.5 border-b border-neutral-100 px-3.5">
                  <CreditCard size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
                  <span className="text-base text-neutral-400">Card number</span>
                </div>
                <div className="flex">
                  <div className="flex h-[50px] flex-1 items-center border-r border-neutral-100 px-3.5">
                    <span className="text-base text-neutral-400">MM / YY</span>
                  </div>
                  <div className="flex h-[50px] flex-1 items-center px-3.5">
                    <span className="text-base text-neutral-400">CVC</span>
                  </div>
                </div>
              </div>

              <div className="hidden h-[50px] overflow-hidden rounded-[10px] border border-[#CBD5E1] bg-white lg:flex lg:items-center">
                <div className="flex flex-1 items-center gap-2.5 border-r border-neutral-100 px-3.5">
                  <CreditCard size={18} className="flex-shrink-0 text-neutral-400" aria-hidden="true" />
                  <span className="flex-1 text-base text-neutral-400">Card number</span>
                </div>
                <div className="flex w-[110px] items-center border-r border-neutral-100 px-3.5">
                  <span className="text-base text-neutral-400">MM / YY</span>
                </div>
                <div className="flex items-center px-3.5">
                  <span className="text-base text-neutral-400">CVC</span>
                </div>
              </div>

              {stripeNote}
            </div>
          </section>
        </div>

        {/* ③ Mobile pay block — DOM-last → mobile bottom; hidden on desktop */}
        <div className="flex flex-col gap-[14px] lg:hidden">
          {errorBanner}
          {payButton}
          {terms}
        </div>

      </div>
    </div>
  )
}
