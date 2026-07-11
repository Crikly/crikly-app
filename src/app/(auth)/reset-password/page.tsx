import { AuthCenteredShell } from '@/components/auth/AuthCenteredShell'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export const metadata = {
  title: 'Set a new password — Crikly',
}

// BUG-33: destination for /auth/callback?type=recovery. The recovery session
// is already established by the callback; this screen only collects the new
// password. Listed in the proxy's PUBLIC_ROUTES and exempt from the
// authenticated→/dashboard bounce so the recovery user can actually see it.
export default function ResetPasswordPage() {
  return (
    <AuthCenteredShell>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Set a new password
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        Choose a new password for your account to continue
      </p>

      <ResetPasswordForm />
    </AuthCenteredShell>
  )
}
