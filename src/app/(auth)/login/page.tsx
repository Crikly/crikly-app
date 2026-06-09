import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { LoginForm } from '@/components/auth/LoginForm'
import { Clock } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Log in — Crikly',
}

export default function LoginPage() {
  return (
    <AuthSplitShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Welcome back
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Good to see you again
      </p>

      <LoginForm />

      <AuthDivider />
      <SocialAuthButtons mode="login" />

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[13px] text-neutral-400">
        <Clock size={13} />
        Parent and Player accounts coming soon
      </p>

      <p className="mt-6 text-center text-[13px] text-gray-500">
        New to Crikly?{' '}
        <Link href="/register" className="font-medium text-brand-600 no-underline">
          Create account
        </Link>
      </p>
    </AuthSplitShell>
  )
}
