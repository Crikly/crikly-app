export const metadata = {
  title: 'Privacy Policy — Crikly',
  description: 'How Crikly collects, uses, and protects your personal data under UK GDPR.',
}

const LAST_UPDATED = '26 April 2026'
const CONTACT_EMAIL = 'privacy@crikly.app'
const COMPANY = 'Crikly Ltd'
const ADDRESS = 'London, United Kingdom'

export default function PrivacyPolicyPage() {
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
        Privacy Policy
      </h1>

      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 48px' }}>
        Last updated: {LAST_UPDATED}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        <Section title="1. Who we are">
          <p>
            {COMPANY} (&ldquo;Crikly&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) operates the Crikly platform at crikly.app. We are the data controller for the personal information described in this policy.
          </p>
          <p>
            Our registered address is {ADDRESS}. You can contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#0077CC' }}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <Section title="2. What data we collect">
          <p>We collect the following categories of personal data:</p>
          <ul>
            <li><strong>Account data</strong> — name, email address, password (hashed), and role (parent, player, or coach).</li>
            <li><strong>Profile data</strong> — for coaches: sport(s), qualifications, DBS status, biography, location, and pricing. For parents/players: sport preferences and location.</li>
            <li><strong>Child profiles</strong> — name, date of birth, and optional medical notes, entered by a parent on behalf of their child.</li>
            <li><strong>Booking data</strong> — session details, times, locations, and booking history.</li>
            <li><strong>Payment data</strong> — transaction records. Card details are handled exclusively by Stripe and are never stored by Crikly.</li>
            <li><strong>Communications</strong> — messages exchanged between coaches and parents/players via the platform.</li>
            <li><strong>Usage data</strong> — pages visited, actions taken, and device/browser information collected via server logs.</li>
            <li><strong>Interest and waitlist data</strong> — email address, name, sport preferences, and location submitted via our pre-launch interest forms.</li>
          </ul>
        </Section>

        <Section title="3. How we use your data">
          <p>We use your personal data to:</p>
          <ul>
            <li>Create and manage your account.</li>
            <li>Match parents and players with suitable coaches.</li>
            <li>Process and manage bookings and payments.</li>
            <li>Send transactional emails — booking confirmations, reminders, and receipts.</li>
            <li>Notify you when we launch (for interest and waitlist registrations).</li>
            <li>Enforce our Terms &amp; Conditions and platform safety rules.</li>
            <li>Improve platform performance and user experience.</li>
            <li>Comply with our legal obligations under UK law.</li>
          </ul>
        </Section>

        <Section title="4. Legal basis for processing">
          <p>We rely on the following lawful bases under UK GDPR:</p>
          <ul>
            <li><strong>Contract</strong> — processing necessary to provide the platform and fulfil bookings.</li>
            <li><strong>Legitimate interests</strong> — fraud prevention, platform security, and service improvement.</li>
            <li><strong>Consent</strong> — for marketing communications and pre-launch interest registration. You may withdraw consent at any time.</li>
            <li><strong>Legal obligation</strong> — where required by UK law.</li>
          </ul>
        </Section>

        <Section title="5. Child data">
          <p>
            Crikly takes the protection of child data seriously. Child profiles (under 16) are created and managed exclusively by a verified parent account. Child data is never publicly visible. Medical notes attached to a child profile are only accessible to coaches who hold a confirmed booking for that child.
          </p>
          <p>
            When a child turns 16, their parent will be notified and the child will be invited to transition to an independent Player account. This transition requires the child&apos;s explicit consent.
          </p>
        </Section>

        <Section title="6. Sharing your data">
          <p>We do not sell your personal data. We share data only with:</p>
          <ul>
            <li><strong>Stripe</strong> — payment processing. See <a href="https://stripe.com/gb/privacy" style={{ color: '#0077CC' }} target="_blank" rel="noopener noreferrer">Stripe&apos;s Privacy Policy</a>.</li>
            <li><strong>Supabase</strong> — database and authentication infrastructure, hosted in the EU.</li>
            <li><strong>Resend</strong> — transactional email delivery.</li>
            <li><strong>Vercel</strong> — hosting infrastructure.</li>
            <li><strong>Law enforcement or regulators</strong> — only where required by law or court order.</li>
          </ul>
          <p>All third-party processors are contractually bound to process data only on our instructions and to appropriate security standards.</p>
        </Section>

        <Section title="7. Data retention">
          <p>We retain your personal data for as long as your account is active or as needed to provide our services. Specifically:</p>
          <ul>
            <li><strong>Account data</strong> — retained for the lifetime of your account plus 6 years after closure (for legal and financial record-keeping).</li>
            <li><strong>Booking records</strong> — retained for 6 years from the date of the session.</li>
            <li><strong>Child profiles</strong> — deleted or transitioned at the parent&apos;s request or upon account closure.</li>
            <li><strong>Interest/waitlist data</strong> — retained until you withdraw consent or 12 months after our launch, whichever comes first.</li>
          </ul>
        </Section>

        <Section title="8. Your rights">
          <p>Under UK GDPR, you have the right to:</p>
          <ul>
            <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
            <li><strong>Rectification</strong> — ask us to correct inaccurate data.</li>
            <li><strong>Erasure</strong> — ask us to delete your data, subject to legal retention obligations.</li>
            <li><strong>Restriction</strong> — ask us to limit how we process your data.</li>
            <li><strong>Portability</strong> — receive your data in a machine-readable format.</li>
            <li><strong>Object</strong> — object to processing based on legitimate interests.</li>
            <li><strong>Withdraw consent</strong> — at any time, where processing is based on consent.</li>
          </ul>
          <p>
            To exercise any of these rights, email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#0077CC' }}>{CONTACT_EMAIL}</a>.
            We will respond within 30 days.
          </p>
        </Section>

        <Section title="9. Cookies and tracking">
          <p>
            Crikly uses only essential session cookies required for authentication and platform operation. We do not use advertising cookies or third-party tracking pixels. We do not use Google Analytics or similar tools during our pre-launch phase.
          </p>
        </Section>

        <Section title="10. Contact and complaints">
          <p>
            For any privacy-related questions or concerns, contact us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: '#0077CC' }}>{CONTACT_EMAIL}</a>.
          </p>
          <p>
            If you are unsatisfied with our response, you have the right to lodge a complaint with the UK Information Commissioner&apos;s Office (ICO) at{' '}
            <a href="https://ico.org.uk" style={{ color: '#0077CC' }} target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
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
