import type { Metadata } from 'next'
import {
  A,
  EffectiveDate,
  H1,
  H2,
  LegalPageLayout,
  P,
} from '@/components/public/LegalPageLayout'

export const metadata: Metadata = {
  title: 'Terms of Service — Crikly',
}

export default function TermsPage() {
  return (
    <LegalPageLayout>
      <H1>Terms of Service</H1>
      <EffectiveDate>Effective date: 3 June 2026 · Last updated: 3 June 2026</EffectiveDate>

      <H2>Acceptance of terms</H2>
      <P>
        By creating an account or using the Crikly platform you agree to these Terms of Service.
        If you do not agree, please do not use Crikly.
      </P>

      <H2>What Crikly is</H2>
      <P>
        Crikly is a marketplace platform operated by Tekly Solutions Ltd that connects sports
        coaches with parents and players. Crikly provides the technology to discover coaches,
        book sessions, and process payments. Crikly is not a party to the coaching relationship
        and does not employ coaches listed on the platform.
      </P>

      <H2>Your account</H2>
      <P>
        You must provide accurate information when registering. You are responsible for
        maintaining the security of your account credentials. You must be 16 or over to create
        a Player account, or 18 or over to create a Coach account. Parents may create accounts
        on behalf of children under 16. You must provide accurate age information on
        registration.
      </P>

      <H2>Bookings and payments</H2>
      <P>
        All payments are processed securely by Stripe. When a booking is confirmed, payment is
        held by Crikly and released to the coach after the session is completed. Crikly charges
        a platform fee to the parent on top of the coach&apos;s session price — the coach always
        receives the full price they set.
      </P>

      <H2>Cancellations</H2>
      <P>
        You may cancel free of charge up to 24 hours before the scheduled session and receive a
        full refund. Cancellations within 24 hours of the session are non-refundable. Coaches
        may set a longer cancellation window on their profile. If a coach cancels a session,
        you will always receive a full refund.
      </P>

      <H2>Coach obligations</H2>
      <P>
        Coaches must provide accurate information about their qualifications, experience, and
        availability. Coaches are responsible for their own tax obligations, insurance, and
        compliance with safeguarding regulations. Crikly reserves the right to suspend or
        remove coaches who violate these terms or receive sustained negative feedback.
      </P>

      <H2>Prohibited conduct</H2>
      <P>
        You must not use Crikly to engage in fraudulent activity, circumvent platform payments
        by arranging off-platform bookings, harass or abuse other users, or post false or
        misleading information.
      </P>

      <H2>Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, Crikly&apos;s liability to you is limited to the
        amount you paid for the relevant booking. Crikly is not liable for indirect, incidental,
        or consequential losses. Nothing in these terms limits liability for death, personal
        injury, or fraud.
      </P>

      <H2>Governing law</H2>
      <P>
        These terms are governed by the laws of England and Wales. Any disputes shall be
        subject to the exclusive jurisdiction of the courts of England and Wales.
      </P>

      <H2>Changes to these terms</H2>
      <P>
        We may update these terms from time to time. Continued use of Crikly after changes are
        posted constitutes acceptance of the revised terms.
      </P>

      <H2>Contact</H2>
      <address className="not-italic text-base text-neutral-700 leading-relaxed mb-4">
        Tekly Solutions Ltd
        <br />
        <A href="mailto:crikly@teklysolutions.com">crikly@teklysolutions.com</A>
      </address>
    </LegalPageLayout>
  )
}
