import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// P-04-A: placeholder body for parent routes that later build steps
// implement (P-07 add-child, bookings, settings). Exists so nav links and
// the + Add child bubble never 404. Server component — renders inside the
// guarded /parent layout.

interface ComingSoonProps {
  title: string
  copy: string
}

export function ComingSoon({ title, copy }: ComingSoonProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 px-4 py-16 md:px-8">
      <h1 className="text-2xl font-semibold tracking-heading text-neutral-900">
        {title}
      </h1>
      <p className="max-w-prose text-base text-neutral-600">{copy}</p>
      <Link
        href="/parent/dashboard"
        className="flex items-center gap-2 text-base font-medium text-brand-600 no-underline hover:text-brand-700"
      >
        <ArrowLeft size={16} />
        Back to dashboard
      </Link>
    </div>
  )
}
