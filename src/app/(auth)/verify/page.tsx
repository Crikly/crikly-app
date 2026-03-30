import { AuthLogo } from '@/components/auth/AuthLogo'
import Link from 'next/link'

export const metadata = {
  title: 'Check your inbox — Crikly',
}

interface VerifyPageProps {
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const { email } = await searchParams

  return (
    <>
      <AuthLogo />

      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#E6F3FB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
          aria-hidden="true"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="#0077CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            color: '#0F172A',
            letterSpacing: '-0.3px',
            margin: '0 0 10px',
          }}
        >
          Check your inbox
        </h1>

        <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 20px', lineHeight: 1.6 }}>
          We sent a verification link to
        </p>

        {email && (
          <div
            style={{
              background: '#E6F3FB',
              border: '1px solid #B5D4F4',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              color: '#0077CC',
              fontWeight: 500,
              marginBottom: '20px',
              wordBreak: 'break-all',
            }}
          >
            {email}
          </div>
        )}

        <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>
          Click the link in the email to verify your account.
          Check your spam folder if you can&apos;t find it.
        </p>
      </div>

      <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748B' }}>
        Didn&apos;t receive it?{' '}
        <Link
          href="/register"
          style={{ color: '#0077CC', fontWeight: 500, textDecoration: 'none' }}
        >
          Resend email
        </Link>
      </p>
    </>
  )
}
