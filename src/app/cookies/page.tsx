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
  title: 'Cookie Policy — Crikly',
}

export default function CookiesPage() {
  return (
    <LegalPageLayout>
      <H1>Cookie Policy</H1>
      <EffectiveDate>Effective date: 3 June 2026 · Last updated: 3 June 2026</EffectiveDate>

      <H2>What are cookies</H2>
      <P>
        Cookies are small text files stored on your device when you visit a website. They help
        us remember your preferences and understand how Crikly is used.
      </P>

      <H2>Essential cookies</H2>
      <P>
        These cookies are required for Crikly to function and cannot be disabled. They include
        authentication tokens that keep you logged in, session state required for booking
        flows, and security cookies that protect against fraud.
      </P>

      <H2>Analytics cookies</H2>
      <P>
        We use analytics cookies to understand how visitors use Crikly — which pages are
        visited, how long sessions last, and where users come from. This helps us improve the
        platform. These cookies are only set with your consent.
      </P>

      <H2>Your cookie choices</H2>
      <P>
        When you first visit Crikly, a consent banner gives you the option to accept or decline
        analytics cookies. You can change your preference at any time by clearing your browser
        cookies and reloading the page — the consent banner will reappear. Declining analytics
        cookies does not affect your ability to use Crikly.
      </P>

      <H2>Third-party cookies</H2>
      <P>
        Our payment provider Stripe may set cookies as part of the secure payment flow. These
        are governed by Stripe&apos;s own cookie and privacy policies.
      </P>

      <H2>More information</H2>
      <P>
        For more information about cookies and your rights, visit the ICO website at{' '}
        <A href="https://ico.org.uk" external>ico.org.uk</A>.
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
