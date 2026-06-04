import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { RegisterForm } from '@/components/auth/RegisterForm'
import Link from 'next/link'

export const metadata = {
  title: 'Create your account — Crikly',
  description: 'Join coaches and players across the UK',
}

export default function RegisterPage() {
  return (
    <AuthSplitShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Create your account
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Join coaches and players across the UK
      </p>

      <RegisterForm />

      <AuthDivider />
      <SocialAuthButtons mode="register" />

      <p className="mt-6 text-center text-[13px] text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-brand-600 no-underline">
          Log in
        </Link>
      </p>
    </AuthSplitShell>
  )
}
