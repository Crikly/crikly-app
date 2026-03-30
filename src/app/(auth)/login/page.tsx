import { AuthLogo } from '@/components/auth/AuthLogo'
import { AuthDivider } from '@/components/auth/AuthDivider'
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons'
import { LoginForm } from '@/components/auth/LoginForm'
import Link from 'next/link'

export const metadata = {
  title: 'Log in — Crikly',
}

export default function LoginPage() {
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
        Welcome back
      </h1>
      <p style={{
        fontSize: '14px',
        color: '#475569',
        margin: '0 0 28px',
        lineHeight: 1.5,
      }}>
        Good to see you again
      </p>

      <LoginForm />

      <AuthDivider />
      <SocialAuthButtons mode="login" />

      <p style={{
        textAlign: 'center',
        fontSize: '13px',
        color: '#64748B',
        margin: '24px 0 0',
      }}>
        New to Crikly?{' '}
        <Link href="/register" style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}>
          Create account
        </Link>
      </p>
    </>
  )
}
