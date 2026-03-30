import { AuthLogo } from '@/components/auth/AuthLogo'
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
    <>
      <AuthLogo />
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: '#0F172A',
          letterSpacing: '-0.3px',
          margin: '0 0 8px',
        }}
      >
        Create your account
      </h1>
      <p
        style={{
          fontSize: '14px',
          color: '#475569',
          margin: '0 0 28px',
          lineHeight: 1.5,
        }}
      >
        Join coaches and players across the UK
      </p>

      <RegisterForm />

      <AuthDivider />
      <SocialAuthButtons mode="register" />

      <p
        style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#64748B',
          margin: '24px 0 0',
        }}
      >
        Already have an account?{' '}
        <Link
          href="/login"
          style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}
        >
          Log in
        </Link>
      </p>
    </>
  )
}
