'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import type {
  StripeElementsOptions,
  StripeError,
  StripeExpressCheckoutElementConfirmEvent,
  StripeExpressCheckoutElementReadyEvent,
} from '@stripe/stripe-js'
import {
  ArrowLeft,
  Lock,
  Check,
  Copy,
  Share2,
  Bookmark,
  AlertCircle,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { AddressAutocomplete } from '@/components/booking/AddressAutocomplete'
import { getStripePromise } from '@/lib/stripe/browser'
import { formatPlayersLabel } from '@/lib/booking/participants'
import {
  readBookingHold,
  clearBookingHold,
  type PlayerAssignment,
} from '@/lib/booking/authed-booking-handoff'
import {
  BookingSummaryCard,
  formatPence,
  type BookingSummary,
} from '@/components/booking/BookingSummaryCard'

type CheckoutError = 'payment' | 'slot_taken' | 'slot_unavailable' | 'price_changed' | 'player_unavailable'

// UX-18: every availability-shaped 409 code gets its own copy — only genuinely
// payment-shaped failures may fall through to the "check your card details"
// message, because the guest has NOT been charged on any 409.
function checkoutErrorFor(code: string | undefined): CheckoutError {
  switch (code) {
    case 'slot_taken':
      return 'slot_taken'
    case 'slot_not_available':
    case 'date_blocked':
    case 'outside_booking_window':
      return 'slot_unavailable'
    case 'price_mismatch':
      return 'price_changed'
    default:
      return 'payment'
  }
}

/** Slot the guest is booking — supplied by the availability page as query params. */
export interface GuestCheckoutParams {
  coachId: string
  sportId: string
  sessionType: 'individual' | 'group'
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  startTime: string
  /** Coach price in pence (re-verified server-side against coach_sports). */
  pricePence: number
  /** UX-16: who the session is for — required by POST /api/guest/bookings. */
  participantName: string
  /** UX-16: optional age — children have it, adult players may not. */
  participantAge: number | null
  /** P-10 Phase 3: group players 2..N from the availability page (empty for
   * a 1-player booking). Sent to the API as the tail of the players array. */
  extraPlayers: { name: string; age: number | null }[]
}

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

/** P-10 bug 4 (single checkout page): server-detected parent session.
 * Non-null switches the checkout to authed mode — contact fields pre-fill
 * from the account, the participant card is fed by the sessionStorage hold,
 * and the booking POSTs to /api/parent/bookings. Null = guest behaviour,
 * byte-identical. */
export interface AuthedCheckoutPrefill {
  fullName: string
  email: string
  phone: string
  townCity: string
  postcode: string
}

interface GuestBookingFlowProps {
  coachId: string
  /** Coach profile slug — used for the back link so it reads /coaches/[slug]
      instead of /coaches/[UUID]. Falls back to coachId when absent. */
  coachSlug?: string
  summary: BookingSummary
  checkout: GuestCheckoutParams
  initialError?: CheckoutError
  authedCheckout?: AuthedCheckoutPrefill | null
}

interface ConfirmedState {
  bookingReference: string
  email: string
  /** UX-16: formatted participant label — e.g. "Yuwin (age 10)". */
  participant?: string
}

const stripePromise = getStripePromise()

/**
 * Outer orchestrator. Owns the checkout ↔ confirmed view switch and the
 * confirmation data lifted from the inner form. The checkout view is wrapped in
 * <Elements> (deferred-intent mode) so the inner form can use the Stripe hooks.
 */
export function GuestBookingFlow({ coachId, coachSlug, summary, checkout, initialError, authedCheckout }: GuestBookingFlowProps) {
  const [confirmed, setConfirmed] = useState<ConfirmedState | null>(null)
  const [copied, setCopied] = useState<boolean>(false)

  const totalPence = summary.sessionFeePence + summary.platformFeePence
  const coachProfileHref = coachSlug ? `/coaches/${coachSlug}` : `/coaches/${coachId}`

  // Deferred-intent mode: Elements renders the Payment Element before any
  // PaymentIntent exists. We create the intent server-side on Pay, then confirm.
  const elementsOptions = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      amount: totalPence,
      currency: 'gbp',
      // Card only — Apple/Google Pay are handled by the Express Checkout Element,
      // and the Stripe account's other methods (Klarna/Revolut/Amazon Pay) are
      // explicitly excluded from the card tab.
      paymentMethodTypes: ['card'],
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0077CC',
          borderRadius: '10px',
          fontFamily: 'DM Sans, system-ui, sans-serif',
        },
      },
    }),
    [totalPence],
  )

  async function handleCopyReference(): Promise<void> {
    if (!confirmed) return
    try {
      await navigator.clipboard?.writeText(confirmed.bookingReference)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — silently ignore.
    }
  }

  async function handleShareReference(): Promise<void> {
    if (!confirmed) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Crikly booking confirmed',
          text: `My Crikly session is booked — reference ${confirmed.bookingReference}.`,
          url: coachProfileHref,
        })
      } else {
        await handleCopyReference()
      }
    } catch {
      // Share dismissed or unsupported.
    }
  }

  // ── Confirmation view ──────────────────────────────────────────────────────

  if (confirmed) {
    return (
      <div className="mx-auto flex w-full max-w-md lg:max-w-[560px] flex-col items-center text-center lg:py-12">
        {/* Brand lockup — mobile only; desktop shows the PublicHeader */}
        <div className="mt-3 mb-[30px] flex items-center gap-[7px] lg:hidden">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-brand-600 text-[13px] font-bold leading-none tracking-[-0.02em] text-white">
            c
          </span>
          <span className="text-[16px] font-bold tracking-[-0.02em] text-brand-800">Crikly</span>
        </div>

        {/* Success circle */}
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#DCFCE7] lg:h-24 lg:w-24">
          <div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-success lg:h-[66px] lg:w-[66px]">
            <Check
              strokeWidth={2.4}
              className="h-[30px] w-[30px] text-white lg:h-[34px] lg:w-[34px]"
              aria-hidden="true"
            />
          </div>
        </div>

        <h1 className="mt-6 text-[27px] font-medium tracking-[-0.01em] text-neutral-900 lg:text-[32px]">
          {"You're all booked!"}
        </h1>
        <p className="mt-2.5 max-w-[290px] text-base text-neutral-600 lg:max-w-[380px] lg:text-[16px]">
          A confirmation email is on its way to{' '}
          <span className="font-medium text-neutral-900">{confirmed.email || 'your email'}</span>
        </p>

        {/* Reference card */}
        <div className="mt-7 flex w-full items-center justify-between gap-3 rounded-[12px] bg-[#F0F7FF] px-4 py-3.5 lg:px-5 lg:py-4">
          <div className="min-w-0 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-800 opacity-75">
              Booking reference
            </p>
            <p className="mt-[5px] font-mono text-[19px] font-semibold tracking-[0.06em] text-brand-600 lg:text-[20px]">
              {confirmed.bookingReference}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReference}
              aria-label="Copy booking reference"
              data-testid="copy-reference-button"
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-brand-100 bg-white text-brand-600 transition-transform hover:bg-brand-50 active:scale-95 lg:h-[42px] lg:w-[42px]"
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
              className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-brand-100 bg-white text-brand-600 transition-transform hover:bg-brand-50 active:scale-95 lg:h-[42px] lg:w-[42px]"
            >
              <Share2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Paid summary */}
        <div className="mt-4 w-full text-left">
          <BookingSummaryCard
            summary={
              confirmed.participant ? { ...summary, participant: confirmed.participant } : summary
            }
            variant="paid"
          />
        </div>

        {/* Account nudge — mobile: stacked; desktop: single row with inline button */}
        <div className="mt-4 flex w-full flex-col gap-[13px] rounded-[12px] border border-[#CFE3F8] bg-[#F0F7FF] p-4 text-left lg:flex-row lg:items-center lg:gap-[14px] lg:px-[18px]">
          <div className="flex items-start gap-3 lg:flex-1 lg:items-center">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
              <Bookmark size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">
                Save your bookings
              </p>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-neutral-600">
                Create a free Crikly account to manage and rebook in seconds.
              </p>
            </div>
          </div>
          <Link
            href="/register"
            className="flex h-[46px] items-center justify-center rounded-[10px] border-[1.5px] border-brand-600 bg-white text-[15px] font-semibold text-brand-600 transition-colors hover:bg-brand-50 lg:h-11 lg:flex-shrink-0 lg:px-[18px]"
          >
            Create account
          </Link>
        </div>

        {/* Back link */}
        <Link
          href={coachProfileHref}
          className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-neutral-600 transition-colors hover:text-neutral-900 lg:mt-7"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to coach profile
        </Link>
      </div>
    )
  }

  // ── Checkout view (wrapped in Elements) ────────────────────────────────────

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <GuestCheckoutForm
        coachId={coachId}
        coachSlug={coachSlug}
        summary={summary}
        checkout={checkout}
        initialError={initialError}
        authedCheckout={authedCheckout}
        onConfirmed={(bookingReference, email, participant) =>
          setConfirmed({ bookingReference, email, participant })
        }
      />
    </Elements>
  )
}

// ── Inner form (must live inside <Elements> to use the Stripe hooks) ──────────

interface GuestCheckoutFormProps {
  coachId: string
  coachSlug?: string
  summary: BookingSummary
  checkout: GuestCheckoutParams
  initialError?: CheckoutError
  authedCheckout?: AuthedCheckoutPrefill | null
  onConfirmed: (bookingReference: string, email: string, participant?: string) => void
}

function GuestCheckoutForm({
  coachId,
  coachSlug,
  summary,
  checkout,
  initialError,
  authedCheckout,
  onConfirmed,
}: GuestCheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()

  // P-10 bug 4: a signed-in parent's contact details pre-fill from the
  // account (all fields stay editable — the form remains source of truth).
  const [form, setForm] = useState<GuestForm>(() =>
    authedCheckout
      ? {
          ...EMPTY_FORM,
          fullName: authedCheckout.fullName,
          email: authedCheckout.email,
          phone: authedCheckout.phone,
          townCity: authedCheckout.townCity,
          postcode: authedCheckout.postcode,
        }
      : EMPTY_FORM,
  )
  const [billingSame, setBillingSame] = useState<boolean>(true)
  const [error, setError] = useState<CheckoutError | null>(initialError ?? null)
  const [submitting, setSubmitting] = useState<boolean>(false)

  // P-10 bug 4: a signed-in parent's players arrive via the sessionStorage
  // hold the picker wrote (identities never ride URLs — docs/06). Read after
  // mount, async microtask (browser-only storage; no sync setState in an
  // effect). A parent who lands here WITHOUT a hold (e.g. the profile card's
  // direct link) falls back to the participant form below and books their
  // typed player through the authed route.
  const [authedHoldPlayers, setAuthedHoldPlayers] = useState<PlayerAssignment[] | null>(null)
  useEffect(() => {
    if (!authedCheckout) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const hold = readBookingHold()
      // A hold never transfers between coaches (its own doc contract) — a
      // stale hold from another coach's picker falls back to the participant
      // form instead of silently pre-filling the wrong players.
      if (hold?.coachId === coachId && hold.primaryPlayer) {
        setAuthedHoldPlayers([hold.primaryPlayer, ...(hold.additionalParticipants ?? [])])
      }
    })
    return () => {
      cancelled = true
    }
  }, [authedCheckout, coachId])

  // UX-16: the participant normally arrives via the availability page's URL
  // params (guests) or the hold (parents), but the coach-profile "Book a
  // session" card links here directly without either. When that happens the
  // form collects the name itself — both booking APIs hard-require it.
  const needsParticipant = authedCheckout
    ? authedHoldPlayers === null
    : checkout.participantName.trim().length === 0
  const [participantName, setParticipantName] = useState<string>(checkout.participantName)
  const [participantAge, setParticipantAge] = useState<string>(
    checkout.participantAge !== null ? String(checkout.participantAge) : '',
  )
  const [participantError, setParticipantError] = useState<boolean>(false)

  /** Participant fields as the API expects them (age null unless a valid 1–99 int). */
  function participantPayload(): { participantName: string; participantAge: number | null } {
    const age = Number.parseInt(participantAge, 10)
    return {
      participantName: participantName.trim(),
      participantAge: Number.isInteger(age) && age >= 1 && age <= 99 ? age : null,
    }
  }

  /** Summary-card + confirmation participant. P-10 bug 3: group bookings
   * list EVERY player ("Yuwin + Amaya", "Yuwin + 3 others") — this label
   * overrides the server-composed summary, so it must compose the same way.
   * Authed bookings (bug 4) compose from the hold; 1-player bookings keep
   * the "Yuwin (age 10)" format. */
  function participantLabel(): string | undefined {
    if (authedHoldPlayers) {
      const label = formatPlayersLabel(authedHoldPlayers.map((p) => p.firstName))
      return label || undefined
    }
    const { participantName: name, participantAge: age } = participantPayload()
    if (!name) return undefined
    if (checkout.extraPlayers.length > 0) {
      return formatPlayersLabel([name, ...checkout.extraPlayers.map((p) => p.name)])
    }
    return age !== null ? `${name} (age ${age})` : name
  }

  // Stable per-checkout idempotency token. A retried submit (poor signal, double
  // tap, card-path + wallet-path race) reuses this token so the server returns
  // the SAME booking + PaymentIntent instead of creating orphaned pending rows.
  const [idempotencyToken] = useState<string>(() => crypto.randomUUID())

  // True once the Express Checkout Element reports a real wallet (Apple/Google
  // Pay) is available on this device. Starts false so the static SVG placeholders
  // show until proven otherwise — on localhost no wallet exists, so the
  // placeholders remain and the real element renders nothing.
  const [walletsAvailable, setWalletsAvailable] = useState<boolean>(false)

  function handleExpressReady(event: StripeExpressCheckoutElementReadyEvent): void {
    setWalletsAvailable(event.availablePaymentMethods != null)
  }

  const totalPence = summary.sessionFeePence + summary.platformFeePence
  const coachProfileHref = coachSlug ? `/coaches/${coachSlug}` : `/coaches/${coachId}`
  const availabilityHref = `/coaches/${coachId}/availability`
  const billingSummary =
    [form.address, form.townCity, form.postcode].filter(Boolean).join(', ') ||
    'Uses the address from your details above.'

  function setField(key: keyof GuestForm, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildBillingAddress(): {
    line1: string
    city: string
    state: string
    postal_code: string
    country: string
  } {
    // state is '' because the Payment Element opts out of address collection
    // (fields.billing_details.address: 'never'); UK addresses have no state,
    // but Stripe still requires the key to be present in confirmParams.
    return billingSame
      ? { line1: form.address, city: form.townCity, state: '', postal_code: form.postcode, country: 'GB' }
      : {
          line1: form.billingAddress,
          city: form.billingTownCity,
          state: '',
          postal_code: form.billingPostcode,
          country: 'GB',
        }
  }

  /**
   * Create the booking + PaymentIntent server-side. Returns the client secret
   * and booking reference, or sets an error and returns null. `guest` lets the
   * wallet (Express Checkout) path supply name/email from the wallet sheet.
   */
  /** P-10 bug 4: the authed players array for POST /api/parent/bookings —
   * from the hold when present, else the typed participant (a parent who
   * arrived without a hold). Ages map from the hold's form-state strings to
   * the API's number|null. */
  function authedPlayersPayload(): { name: string; age: number | null; childProfileId: string | null }[] {
    if (authedHoldPlayers) {
      return authedHoldPlayers.map((p) => {
        const age = Number.parseInt(p.age, 10)
        return {
          name: p.firstName,
          age: Number.isInteger(age) && age >= 1 && age <= 99 ? age : null,
          childProfileId: p.kind === 'child' ? p.childProfileId : null,
        }
      })
    }
    const { participantName: name, participantAge: age } = participantPayload()
    return [{ name, age, childProfileId: null }]
  }

  async function createBooking(
    guest: { fullName: string; email: string; phone: string; address: string; townCity: string; postcode: string },
  ): Promise<{ clientSecret: string; bookingReference: string } | null> {
    // P-10 bug 4 (single checkout page): a signed-in parent books through
    // the authed route — same response shape, same Stripe confirm flow.
    // Guests take the pre-existing branch below, byte-identical.
    if (authedCheckout) {
      try {
        const res = await fetch('/api/parent/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coachId,
            sportId: checkout.sportId,
            date: checkout.date,
            startTime: checkout.startTime,
            pricePence: checkout.pricePence,
            players: authedPlayersPayload(),
            idempotencyToken,
          }),
        })

        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          setError(checkoutErrorFor(body.error))
          return null
        }
        // 403 child_not_found (child deleted/reassigned mid-flow, desynced
        // hold) must not read as a card problem — its own copy points the
        // parent back to re-selecting players. 404 = coach no longer
        // bookable, same banner as the availability 409s.
        if (res.status === 403) {
          setError('player_unavailable')
          return null
        }
        if (res.status === 404) {
          setError('slot_unavailable')
          return null
        }
        if (!res.ok) {
          setError('payment')
          return null
        }

        const data = (await res.json()) as { clientSecret?: string; bookingReference?: string }
        if (!data.clientSecret || !data.bookingReference) {
          setError('payment')
          return null
        }
        return { clientSecret: data.clientSecret, bookingReference: data.bookingReference }
      } catch {
        setError('payment')
        return null
      }
    }

    try {
      const res = await fetch('/api/guest/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId,
          sportId: checkout.sportId,
          sessionType: checkout.sessionType,
          date: checkout.date,
          startTime: checkout.startTime,
          pricePence: checkout.pricePence,
          // P-10 Phase 3: a group booking sends the full players array
          // (primary first); a 1-player booking keeps the legacy fields —
          // both shapes are first-class on POST /api/guest/bookings.
          ...(checkout.extraPlayers.length > 0
            ? {
                players: [
                  {
                    name: participantPayload().participantName,
                    age: participantPayload().participantAge,
                  },
                  ...checkout.extraPlayers.map((p) => ({ name: p.name, age: p.age })),
                ],
              }
            : participantPayload()),
          idempotencyToken,
          guest,
        }),
      })

      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(checkoutErrorFor(body.error))
        return null
      }
      if (!res.ok) {
        setError('payment')
        return null
      }

      const data = (await res.json()) as { clientSecret?: string; bookingReference?: string }
      if (!data.clientSecret || !data.bookingReference) {
        setError('payment')
        return null
      }
      return { clientSecret: data.clientSecret, bookingReference: data.bookingReference }
    } catch {
      setError('payment')
      return null
    }
  }

  // Card payment via the Payment Element.
  async function handlePay(): Promise<void> {
    if (!stripe || !elements || submitting) return
    // UX-16: the API rejects a missing participant name — catch it here with a
    // field-level message instead of a misleading generic payment error.
    // P-10 bug 4: authed players come from the hold, no typed name needed.
    if (!authedHoldPlayers && !participantName.trim()) {
      setParticipantError(true)
      return
    }
    setError(null)
    setSubmitting(true)

    // Validate the Payment Element inputs before creating any booking/intent.
    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError('payment')
      setSubmitting(false)
      return
    }

    const created = await createBooking({
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      townCity: form.townCity,
      postcode: form.postcode,
    })
    if (!created) {
      setSubmitting(false)
      return
    }

    // BUG-29: every field declared 'never' on the Payment Element MUST be
    // passed here — Stripe REJECTS (IntegrationError) on an undefined field,
    // and an uncaught rejection froze the button on "Processing…" forever.
    // Empty string satisfies the contract for optional fields (same mechanism
    // as buildBillingAddress's state: ''). The try/catch is the second layer:
    // card declines still resolve into confirmError and keep their branch;
    // only thrown rejections land in the catch.
    let confirmError: StripeError | undefined
    try {
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: created.clientSecret,
        confirmParams: {
          // 3DS / redirect-based methods return here. redirect:'if_required' keeps
          // the common card path inline. TODO(P-00c-API): handle the redirect-return
          // case (read payment_intent_client_secret on load → show confirmation).
          return_url: `${window.location.origin}/book/${coachId}`,
          payment_method_data: {
            billing_details: {
              name: form.cardholderName || form.fullName,
              email: form.email,
              phone: form.phone,
              address: buildBillingAddress(),
            },
          },
        },
        redirect: 'if_required',
      })
      confirmError = result.error
    } catch (err) {
      console.error('[GuestBookingFlow] confirmPayment threw:', err)
      setError('payment')
      setSubmitting(false)
      return
    }

    if (confirmError) {
      // Card declined / authentication failed. Form data is preserved.
      setError('payment')
      setSubmitting(false)
      return
    }

    // P-10 bug 4: the hold's job is done once the booking exists — clear it
    // so a later, unrelated booking never inherits stale players.
    if (authedCheckout) clearBookingHold()
    onConfirmed(created.bookingReference, form.email, participantLabel())
  }

  // Wallet payment (Apple Pay / Google Pay) via the Express Checkout Element.
  async function handleExpressConfirm(event: StripeExpressCheckoutElementConfirmEvent): Promise<void> {
    if (!stripe || !elements || submitting) {
      event.paymentFailed({ reason: 'fail' })
      return
    }
    // UX-16: same guard as handlePay — the wallet sheet can be tapped before
    // the participant field is filled. Authed players come from the hold.
    if (!authedHoldPlayers && !participantName.trim()) {
      setParticipantError(true)
      event.paymentFailed({ reason: 'fail' })
      return
    }
    setError(null)
    setSubmitting(true)

    const billing = event.billingDetails
    const created = await createBooking({
      fullName: billing?.name || form.fullName || 'Guest',
      email: billing?.email || form.email,
      phone: billing?.phone || form.phone,
      address: billing?.address?.line1 || form.address,
      townCity: billing?.address?.city || form.townCity,
      postcode: billing?.address?.postal_code || form.postcode,
    })
    if (!created) {
      event.paymentFailed({ reason: 'fail' })
      setSubmitting(false)
      return
    }

    // BUG-29 layer 2 (defensive): confirmPayment can REJECT on integration
    // errors (vs resolving {error} for card declines) — never let a rejection
    // freeze the submitting state. Wallet argument shape is unchanged.
    let confirmError: StripeError | undefined
    try {
      const result = await stripe.confirmPayment({
        elements,
        clientSecret: created.clientSecret,
        confirmParams: { return_url: `${window.location.origin}/book/${coachId}` },
        redirect: 'if_required',
      })
      confirmError = result.error
    } catch (err) {
      console.error('[GuestBookingFlow] express confirmPayment threw:', err)
      setError('payment')
      setSubmitting(false)
      return
    }

    if (confirmError) {
      setError('payment')
      setSubmitting(false)
      return
    }

    if (authedCheckout) clearBookingHold()
    onConfirmed(created.bookingReference, billing?.email || form.email, participantLabel())
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
              href={coachProfileHref}
              className="mt-1 inline-block font-medium underline"
            >
              Choose another time
            </Link>
          </>
        ) : error === 'slot_unavailable' ? (
          <>
            <p className="font-medium">Sorry, this time is no longer available.</p>
            <Link
              href={availabilityHref}
              className="mt-1 inline-block font-medium underline"
            >
              Choose another time
            </Link>
          </>
        ) : error === 'price_changed' ? (
          <>
            <p className="font-medium">The price for this session has changed. Please go back and start again.</p>
            <Link
              href={coachProfileHref}
              className="mt-1 inline-block font-medium underline"
            >
              Back to profile
            </Link>
          </>
        ) : error === 'player_unavailable' ? (
          <>
            <p className="font-medium">
              We couldn&apos;t match the selected players to your account. Please go back
              and choose your players again.
            </p>
            <Link
              href={availabilityHref}
              className="mt-1 inline-block font-medium underline"
            >
              Choose players again
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
      disabled={!stripe || submitting}
      data-testid="pay-button"
      className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-brand-600 text-[16px] font-semibold tracking-[-0.01em] text-white transition-all hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Lock size={17} aria-hidden="true" />
      {submitting ? 'Processing…' : `Pay ${formatPence(totalPence)}`}
    </button>
  )

  const stripeNote = (
    <div className="flex items-center justify-center gap-1.5 text-[12px] text-neutral-400">
      <Lock size={13} aria-hidden="true" />
      <span>
        Secured by{' '}
        <span className="font-semibold text-[#64748B]">Stripe</span>
        <span className="hidden lg:inline">{" · Your card details never touch Crikly's servers."}</span>
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

  return (
    <div>
      {/* Page header */}
      <Link
        href={coachProfileHref}
        className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#64748B] transition-colors hover:text-neutral-900"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to profile
      </Link>
      <h1 className="mt-[18px] text-2xl font-semibold tracking-[-0.02em] text-neutral-900 lg:text-[30px]">
        Complete your booking
      </h1>
      <p className="mb-6 mt-2 text-base text-[#64748B] lg:mb-7">
        {`Review your session with ${summary.coachName} and pay securely. You won't be charged until you confirm.`}
      </p>

      {/* 3-item grid — reflows between mobile (1 col) and desktop (2 col) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">

        {/* ① Summary — DOM-first → mobile top; desktop col-2 row-1, sticky */}
        <div className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24">
          {/* changeHref lets the guest pick a different slot via the availability picker.
              Participant merged live so a name typed below shows in the summary (UX-16). */}
          <BookingSummaryCard
            summary={
              participantLabel() ? { ...summary, participant: participantLabel() } : summary
            }
            variant="checkout"
            changeHref={availabilityHref}
          />
        </div>

        {/* ② Form column — desktop col-1, spans both rows */}
        <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:gap-5">

          {/* Who is this for? — only when the availability page didn't supply it (UX-16) */}
          {needsParticipant && (
            <section className="flex flex-col">
              <div className="flex flex-col gap-[14px] lg:gap-4 lg:rounded-[12px] lg:border lg:border-neutral-100 lg:bg-white lg:p-6">
                <div>
                  <h2 className="text-base font-semibold tracking-[-0.01em] text-neutral-900 lg:text-lg">
                    Who is this for?
                  </h2>
                  <p className="mt-1 text-[13px] text-neutral-600">
                    Tell us about the player. Used for this booking only.
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_120px] gap-3 lg:gap-4">
                  <Input
                    label="Player's name"
                    placeholder="e.g. Sam"
                    autoComplete="off"
                    data-testid="participant-name-input"
                    value={participantName}
                    error={participantError ? "Add the player's name to continue." : undefined}
                    onChange={(e) => {
                      setParticipantName(e.target.value)
                      setParticipantError(false)
                    }}
                  />
                  <Input
                    label="Age"
                    placeholder="Optional"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={2}
                    data-testid="participant-age-input"
                    value={participantAge}
                    onChange={(e) => setParticipantAge(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
            </section>
          )}

          {/* Your details */}
          <section className="flex flex-col">
            <div className="flex flex-col gap-[14px] lg:gap-4 lg:rounded-[12px] lg:border lg:border-neutral-100 lg:bg-white lg:p-6">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-neutral-900 lg:text-lg">
                Your details
              </h2>
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
              <AddressAutocomplete
                label="Address"
                placeholder="Start typing your address"
                value={form.address}
                data-testid="guest-address-input"
                onChange={(value) => setField('address', value)}
                onSelect={({ addressLine, townCity, postcode }) => {
                  setField('address', addressLine)
                  if (townCity) setField('townCity', townCity)
                  if (postcode) setField('postcode', postcode)
                }}
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
            </div>
          </section>

          {/* Payment */}
          <section className="flex flex-col">
            <div className="flex flex-col gap-3 lg:gap-4 lg:rounded-[12px] lg:border lg:border-neutral-100 lg:bg-white lg:p-6">
              <h2 className="text-base font-semibold tracking-[-0.01em] text-neutral-900 lg:text-lg">
                Payment
              </h2>

              {/* Express checkout — real Apple Pay / Google Pay only. The real
                  element renders when a wallet is available on the device; when
                  none is (e.g. localhost), onReady reports null and we fall back
                  to the static SVG placeholders below so the layout never empties. */}
              <div>
                <ExpressCheckoutElement
                  onReady={handleExpressReady}
                  onConfirm={handleExpressConfirm}
                  options={{
                    emailRequired: true,
                    billingAddressRequired: true,
                    buttonHeight: 48,
                    // Restrict to Apple/Google Pay — everything else off so the
                    // test account's Klarna/Amazon Pay/Link/PayPal never appear.
                    paymentMethods: {
                      applePay: 'auto',
                      googlePay: 'auto',
                      link: 'never',
                      amazonPay: 'never',
                      klarna: 'never',
                      paypal: 'never',
                    },
                  }}
                />

                {/* Static placeholders — shown only while no real wallet is
                    available (visual parity with the design; non-interactive). */}
                {!walletsAvailable && (
                  <div className="grid grid-cols-2 gap-2.5 lg:gap-3" aria-hidden="true">
                    <div
                      data-testid="apple-pay-placeholder"
                      className="flex h-12 items-center justify-center gap-1.5 rounded-[10px] bg-black"
                    >
                      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                        <path
                          fill="#fff"
                          d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.56 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.7-1.04-2.73-4.12z"
                        />
                        <path
                          fill="#fff"
                          d="M14.46 4.47c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z"
                        />
                      </svg>
                      <span className="text-[17px] font-semibold tracking-[-0.01em] text-white">Pay</span>
                    </div>
                    <div
                      data-testid="google-pay-placeholder"
                      className="flex h-12 items-center justify-center gap-1.5 rounded-[10px] bg-black"
                    >
                      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.16c-.27 1.4-1.07 2.59-2.28 3.38v2.81h3.69C21.64 18.72 23 15.78 23 12.27z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.69-2.81c-1.02.69-2.33 1.1-4.24 1.1-3.26 0-6.02-2.2-7.01-5.16H1.18v2.9C3.15 21.32 7.26 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M4.99 14.22c-.25-.69-.39-1.43-.39-2.22s.14-1.53.39-2.22V6.88H1.18C.43 8.39 0 10.15 0 12s.43 3.61 1.18 5.12l3.81-2.9z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.26 0 3.15 2.68 1.18 6.88l3.81 2.9C5.98 6.97 8.74 4.77 12 4.77z"
                        />
                      </svg>
                      <span className="text-[17px] font-medium tracking-[-0.01em] text-white">Pay</span>
                    </div>
                  </div>
                )}
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
                  /* pl-[30px] aligns text under the label: checkbox w-5 (20px) + gap-2.5 (10px) */
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

              {/* Real Stripe card fields. Billing details are collected by the
                  form above and passed at confirm time, so the element shows
                  card data only and no duplicate wallet buttons. */}
              <div className="rounded-[10px] border border-[#CBD5E1] bg-white p-3.5">
                <PaymentElement
                  options={{
                    layout: 'tabs',
                    paymentMethodOrder: ['card'],
                    fields: {
                      billingDetails: {
                        name: 'never',
                        email: 'never',
                        phone: 'never',
                        address: 'never',
                      },
                    },
                    wallets: { applePay: 'never', googlePay: 'never' },
                  }}
                />
              </div>

            </div>
          </section>

          {/* Pay block — bottom of the left column on all screen sizes */}
          <div className="flex flex-col gap-[14px]">
            {errorBanner}
            {payButton}
            {stripeNote}
            {terms}
          </div>
        </div>

      </div>
    </div>
  )
}
