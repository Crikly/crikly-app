import type { Metadata } from 'next'
import { A, H1, LegalPageLayout, P } from '@/components/public/LegalPageLayout'
import { ContactForm } from './ContactForm'

export const metadata: Metadata = {
  title: 'Contact — Crikly',
  description:
    'Get in touch with the Crikly team — coaches, parents, partners and more.',
}

export default function ContactPage() {
  return (
    <LegalPageLayout wide>
      <H1>Get in touch</H1>
      <P>
        We&apos;d love to hear from you. Whether you&apos;re a coach, a parent, or
        just curious — drop us a message.
      </P>

      {/* 2-col below the intro. Form left (60%), card right (40%).
          Stacks to single column under md. */}
      <div className="mt-10 grid grid-cols-1 gap-10 md:grid-cols-[3fr_2fr] md:gap-8">
        <ContactForm />
        <ContactDetailsCard />
      </div>
    </LegalPageLayout>
  )
}

// ─── Right-column static card ────────────────────────────────────────────────

function ContactDetailsCard() {
  return (
    <aside className="h-fit rounded-2xl border border-neutral-100 p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Reach us directly</h2>

      <dl className="space-y-4 text-sm">
        <div>
          <dt className="font-medium text-neutral-500">Email</dt>
          <dd className="mt-1">
            <A href="mailto:crikly@teklysolutions.com">crikly@teklysolutions.com</A>
          </dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-500">Response time</dt>
          <dd className="mt-1 leading-relaxed text-neutral-700">
            We aim to respond within 1–2 business days
          </dd>
        </div>
        <div>
          <dt className="font-medium text-neutral-500">Hours</dt>
          <dd className="mt-1 leading-relaxed text-neutral-700">
            Monday–Friday, 9am–6pm UK time
          </dd>
        </div>
      </dl>

      <p className="mt-6 text-xs leading-relaxed text-neutral-500">
        For urgent coaching support, email us directly.
      </p>
    </aside>
  )
}
