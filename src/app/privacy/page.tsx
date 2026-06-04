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
  title: 'Privacy Policy — Crikly',
}

export default function PrivacyPage() {
  return (
    <LegalPageLayout>
      <H1>Privacy Policy</H1>
      <EffectiveDate>Effective date: 3 June 2026 · Last updated: 3 June 2026</EffectiveDate>

      <H2>Who we are</H2>
      <P>
        Crikly is a product of Tekly Solutions Ltd, a company registered in England and Wales.
        We operate the Crikly platform at crikly.app. Our contact email is{' '}
        <A href="mailto:crikly@teklysolutions.com">crikly@teklysolutions.com</A>.
      </P>

      <H2>What data we collect</H2>
      <P>
        We collect information you provide when creating an account, including your name, email
        address, and location. Coaches additionally provide availability, pricing,
        qualifications, and bank account details for payouts processed through Stripe. When a
        booking is made, we collect the details of that booking including session date, time,
        location, and payment amount.
      </P>

      <H2>How we use your data</H2>
      <P>
        We use your data to operate the Crikly platform, process bookings and payments, send
        booking confirmations and reminders, and communicate with you about your account. We do
        not sell your personal data to third parties.
      </P>

      <H2>Who we share data with</H2>
      <P>
        We share data only with the service providers necessary to operate Crikly: Stripe
        (payment processing), Supabase (data storage), Resend (transactional email), and Vercel
        (hosting). Each is bound by their own privacy policies and data processing agreements.
      </P>

      <H2>Data retention</H2>
      <P>
        We retain your account data for as long as your account is active. If you delete your
        account, we delete your personal data within 30 days, except where we are required to
        retain it for legal or financial compliance purposes (typically 7 years for transaction
        records under UK law).
      </P>

      <H2>Your rights under UK GDPR</H2>
      <P>
        You have the right to access, correct, or delete your personal data; to restrict or
        object to processing; and to data portability. To exercise any of these rights, contact
        us at <A href="mailto:crikly@teklysolutions.com">crikly@teklysolutions.com</A>. You also
        have the right to complain to the Information Commissioner&apos;s Office (ICO) at{' '}
        <A href="https://ico.org.uk" external>ico.org.uk</A>.
      </P>

      <H2>Cookies</H2>
      <P>
        We use essential cookies to run the platform and optional analytics cookies to
        understand usage. See our <A href="/cookies">Cookie Policy</A> for full details.
      </P>

      <H2>Changes to this policy</H2>
      <P>
        We may update this policy from time to time. We will notify you of significant changes
        by email or via the platform.
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
