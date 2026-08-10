import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { LoginForm } from '@/components/auth/LoginForm'
import { parseRoleParam } from '@/lib/auth/role-param'
import { Clock } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Log in — Crikly',
}

// P-04-B (AUTH-FLOW-01): ?role= is validated and threaded the same way as
// on /register. For login it only matters when the account has no
// active_role yet — a stored role always wins over the URL param.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const roleParam = parseRoleParam(params.role)

  return (
    <AuthSplitShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Welcome back
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Good to see you again
      </p>

      <LoginForm roleParam={roleParam} />

      <AuthDivider />
      <SocialAuthButtons mode="login" roleParam={roleParam} />

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[13px] text-neutral-400">
        <Clock size={13} />
        Parent and Player accounts coming soon
      </p>

      <p className="mt-6 text-center text-[13px] text-gray-500">
        New to Crikly?{' '}
        <Link
          href={roleParam ? `/register?role=${roleParam}` : '/register'}
          className="font-medium text-brand-600 no-underline"
        >
          Create account
        </Link>
      </p>
    </AuthSplitShell>
  )
}
