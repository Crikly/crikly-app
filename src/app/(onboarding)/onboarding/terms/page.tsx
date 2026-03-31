import { AuthLogo } from '@/components/auth/AuthLogo'
import { TermsAcceptanceForm } from '@/components/auth/TermsAcceptanceForm'

export const metadata = {
  title: 'Terms & Conditions — Crikly',
}

export default function TermsPage() {
  return (
    <>
      <AuthLogo />

      <div style={{ marginBottom: '24px' }}>
        <div style={{
          height: '3px',
          background: '#E2E8F0',
          borderRadius: '2px',
          marginBottom: '6px',
        }}>
          <div style={{
            height: '3px',
            width: '66%',
            background: '#0077CC',
            borderRadius: '2px',
          }} />
        </div>
        <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0 }}>
          Step 2 of 3
        </p>
      </div>

      <h1 style={{
        fontSize: '22px',
        fontWeight: 600,
        color: '#0F172A',
        letterSpacing: '-0.3px',
        margin: '0 0 8px',
      }}>
        A few things to know
      </h1>
      <p style={{
        fontSize: '14px',
        color: '#475569',
        margin: '0 0 24px',
        lineHeight: 1.5,
      }}>
        Please read and accept before continuing
      </p>

      <TermsAcceptanceForm />
    </>
  )
}
