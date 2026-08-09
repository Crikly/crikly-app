import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { parseRoleParam } from '@/lib/auth/role-param'
import Link from 'next/link'

export const metadata = {
  title: 'Create your account — Crikly',
  description: 'Join coaches and players across the UK',
}

// P-04-B (AUTH-FLOW-01): ?role=parent|player|coach arriving from the
// landing CTA chain is allow-list validated here and threaded through
// both auth paths (email/password + OAuth). Invalid or missing → null →
// every downstream surface behaves exactly as before.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const roleParam = parseRoleParam(params.role)

  return (
    <AuthSplitShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Create your account
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Join coaches and players across the UK
      </p>

      <RegisterForm roleParam={roleParam} />

      <AuthDivider />
      <SocialAuthButtons mode="register" roleParam={roleParam} />

      <p className="mt-6 text-center text-[13px] text-gray-500">
        Already have an account?{' '}
        <Link
          href={roleParam ? `/login?role=${roleParam}` : '/login'}
          className="font-medium text-brand-600 no-underline"
        >
          Log in
        </Link>
      </p>
    </AuthSplitShell>
  )
}
