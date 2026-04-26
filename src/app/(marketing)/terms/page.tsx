export const metadata = {
  title: 'Terms & Conditions — Crikly',
  description: 'The terms governing your use of the Crikly platform.',
}

const LAST_UPDATED = '26 April 2026'
const CONTACT_EMAIL = 'legal@crikly.app'
const COMPANY = 'Crikly Ltd'

export default function TermsPage() {
  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '72px 40px 96px' }}>
      <div
        className="font-medium uppercase tracking-widest"
        style={{ fontSize: '11px', color: '#0077CC', marginBottom: '16px', letterSpacing: '0.08em' }}
      >
        Legal
      </div>

      <h1
        className="font-medium"
        style={{
          fontSize: 'clamp(28px, 4vw, 40px)',
          letterSpacing: '-0.025em',
          lineHeight: 1.1,
          color: '#0F172A',
          margin: '0 0 12px',
        }}
      >
        Terms &amp; Conditions
      </h1>

      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 48px' }}>
        Last updated: {LAST_UPDATED}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        <Section title="1. About these terms">
          <p>
            These Terms &amp; Conditions govern your use of the Crikly platform, operated by {COMPANY} (&ldquo;Crikly&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an account or using Crikly, you agree to these terms. If you do not agree, do not use the platform.
          </p>
          <p>
            These terms are governed by the laws of England and Wales.
          </p>
        </Section>

        <Section title="2. The Crikly platform">
          <p>
            Crikly is a marketplace that connects parents, adult players, and sports coaches. We facilitate bookings and payments between users. We are not a party to the coaching sessions themselves and are not responsible for the conduct, quality, or outcomes of sessions delivered by coaches.
          </p>
          <p>
            Coaches on Crikly operate as independent professionals. They are not employees or agents of Crikly.
          </p>
        </Section>

        <Section title="3. Eligibility">
          <p>To use Crikly you must:</p>
          <ul>
            <li>Be at least 18 years old to create an account.</li>
            <li>Provide accurate and truthful registration information.</li>
            <li>Have the legal authority to accept these terms.</li>
          </ul>
          <p>
            Players aged 16 or 17 may use Crikly only with parental consent via a linked parent account. Children under 16 may only be registered by a parent account holder.
          </p>
        </Section>

        <Section title="4. Accounts">
          <p>
            You are responsible for keeping your account credentials secure. You must notify us immediately at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#0077CC' }}>{CONTACT_EMAIL}</a> if you suspect unauthorised access to your account.
          </p>
          <p>
            One person may hold multiple roles (parent, player, coach) on a single account. You are responsible for all activity carried out under your account.
          </p>
        </Section>

        <Section title="5. Bookings">
          <p>
            Bookings are confirmed instantly on payment. No further coach approval is required. A confirmed booking constitutes a contract between the parent/player and the coach.
          </p>
          <p>
            Crikly is not responsible for a coach&apos;s failure to attend or deliver a session. In such cases, Crikly will facilitate a full refund to the booking party.
          </p>
        </Section>

        <Section title="6. Payments and commission">
          <p>
            All payments are processed by Stripe. By booking, you authorise Stripe to charge the payment method on file.
          </p>
          <p>
            Crikly adds a platform commission on top of the coach&apos;s published price. The total amount charged is displayed clearly before payment is confirmed. Coaches receive their full published price. Crikly retains the commission.
          </p>
          <p>
            Coach payouts are processed within 48 hours of session completion, subject to Stripe&apos;s standard transfer timelines.
          </p>
        </Section>

        <Section title="7. Cancellations and refunds">
          <p>
            Each coach sets their own cancellation window. The applicable cancellation policy is displayed on the coach&apos;s profile and at checkout.
          </p>
          <ul>
            <li>Cancellations made before the cancellation window closes: full refund to the booking party.</li>
            <li>Cancellations made within the cancellation window: no refund, unless the coach also cancels.</li>
            <li>Coach cancellations at any time: full refund to the booking party; the coach receives no payout for that session.</li>
          </ul>
          <p>Refunds are processed back to the original payment method via Stripe.</p>
        </Section>

        <Section title="8. Coach obligations">
          <p>Coaches who list on Crikly agree to:</p>
          <ul>
            <li>Provide accurate qualifications, experience, and DBS information.</li>
            <li>Hold any required professional certifications for their sport.</li>
            <li>Deliver sessions as booked, or cancel with reasonable notice.</li>
            <li>Maintain appropriate safeguarding standards when coaching minors.</li>
            <li>Not contact parents, players, or children outside the Crikly platform except for session logistics.</li>
          </ul>
          <p>
            Crikly reserves the right to suspend or remove a coach&apos;s listing at any time for breach of these obligations or for any conduct we deem harmful to users or the platform.
          </p>
        </Section>

        <Section title="9. Prohibited conduct">
          <p>You must not:</p>
          <ul>
            <li>Use Crikly for any unlawful purpose.</li>
            <li>Provide false or misleading information.</li>
            <li>Harass, abuse, or threaten other users.</li>
            <li>Attempt to circumvent the platform by arranging off-platform payments for sessions found through Crikly.</li>
            <li>Upload or distribute malicious code or content.</li>
            <li>Scrape, crawl, or extract data from the platform without our written permission.</li>
          </ul>
          <p>Breach of these rules may result in immediate account suspension.</p>
        </Section>

        <Section title="10. Intellectual property">
          <p>
            All content on the Crikly platform — including software, design, branding, and text — is owned by {COMPANY} or its licensors. You may not copy, reproduce, or distribute any part of the platform without our written permission.
          </p>
          <p>
            By submitting content to the platform (including profile information, reviews, or messages), you grant Crikly a non-exclusive licence to use that content to operate and improve the service.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Crikly is not liable for any indirect, incidental, or consequential loss arising from your use of the platform, including loss of earnings, injury, or damage arising from a coaching session.
          </p>
          <p>
            Our total liability to you for any direct losses shall not exceed the total fees paid by you through the platform in the 12 months preceding the claim.
          </p>
          <p>
            Nothing in these terms limits liability for death or personal injury caused by negligence, or for fraud or fraudulent misrepresentation.
          </p>
          <p>
            For questions, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#0077CC' }}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className="font-medium"
        style={{
          fontSize: '18px',
          color: '#0F172A',
          letterSpacing: '-0.01em',
          margin: '0 0 14px',
        }}
      >
        {title}
      </h2>
      <div
        style={{
          fontSize: '15px',
          color: '#475569',
          lineHeight: 1.7,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {children}
      </div>
    </section>
  )
}
