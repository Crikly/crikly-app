import { AuthLogo } from '@/components/auth/AuthLogo'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import Link from 'next/link'

export const metadata = {
  title: 'Reset your password — Crikly',
}

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthLogo />
      <h1 style={{
        fontSize: '24px',
        fontWeight: 600,
        color: '#0F172A',
        letterSpacing: '-0.3px',
        margin: '0 0 8px',
      }}>
        Reset your password
      </h1>
      <p style={{
        fontSize: '14px',
        color: '#475569',
        margin: '0 0 28px',
        lineHeight: 1.5,
      }}>
        Enter your email and we&apos;ll send you a reset link
      </p>

      <ForgotPasswordForm />

      <p style={{
        textAlign: 'center',
        fontSize: '13px',
        color: '#64748B',
        margin: '24px 0 0',
      }}>
        <Link href="/login" style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}>
          ← Back to log in
        </Link>
      </p>
    </>
  )
}
