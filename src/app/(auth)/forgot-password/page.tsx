import { AuthCenteredShell } from '@/components/auth/AuthCenteredShell'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import Link from 'next/link'

export const metadata = {
  title: 'Reset your password — Crikly',
}

// BUG-33: expired/used recovery links are redirected here by /auth/callback
// with ?error=link_expired so the user can request a fresh one.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const linkExpired = error === 'link_expired'

  return (
    <AuthCenteredShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Reset your password
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Enter your email and we&apos;ll send you a reset link
      </p>

      {linkExpired && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800"
        >
          That reset link has expired or was already used. Enter your email
          below to get a new one.
        </div>
      )}

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-[13px] text-gray-500">
        <Link href="/login" className="font-medium text-brand-600 no-underline">
          ← Back to log in
        </Link>
      </p>
    </AuthCenteredShell>
  )
}
