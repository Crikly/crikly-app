import { AuthCenteredShell } from '@/components/auth/AuthCenteredShell'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import Link from 'next/link'

export const metadata = {
  title: 'Reset your password — Crikly',
}

export default function ForgotPasswordPage() {
  return (
    <AuthCenteredShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Reset your password
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Enter your email and we&apos;ll send you a reset link
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-[13px] text-gray-500">
        <Link href="/login" className="font-medium text-brand-600 no-underline">
          ← Back to log in
        </Link>
      </p>
    </AuthCenteredShell>
  )
}
