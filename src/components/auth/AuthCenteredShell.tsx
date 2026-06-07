import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

// PUB-03 centered-card shell. Used by /forgot-password (and any future
// single-card auth flow). Server component. Page-level neutral-50 bg,
// white card, max-w-[420px], matching the legacy AuthLayout shape but
// migrated to design-system tokens.
export function AuthCenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50">
      {/* Top — back link + logo */}
      <div className="flex items-center justify-between px-6 py-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 no-underline transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={16} strokeWidth={2.2} />
          Back to crikly.app
        </Link>
        <Image
          src="/logo.png"
          alt="Crikly"
          width={92}
          height={24}
          className="h-6 w-auto"
          priority
        />
      </div>

      {/* Card — centered both axes */}
      <div className="flex flex-1 items-center justify-center px-6 pb-12">
        <div className="w-full max-w-[420px] rounded-2xl border border-neutral-100 bg-white p-8 max-md:p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
