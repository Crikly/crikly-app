import { AuthLogo } from '@/components/auth/AuthLogo'
import { RoleSelectionForm } from '@/components/auth/RoleSelectionForm'

export const metadata = {
  title: 'How will you use Crikly?',
}

export default function RoleSelectionPage() {
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
            width: '33%',
            background: '#0077CC',
            borderRadius: '2px',
          }} />
        </div>
        <p style={{
          fontSize: '11px',
          color: '#94A3B8',
          margin: 0,
        }}>
          Step 1 of 3
        </p>
      </div>

      <h1 style={{
        fontSize: '22px',
        fontWeight: 600,
        color: '#0F172A',
        letterSpacing: '-0.3px',
        margin: '0 0 8px',
      }}>
        How will you use Crikly?
      </h1>
      <p style={{
        fontSize: '14px',
        color: '#475569',
        margin: '0 0 24px',
        lineHeight: 1.5,
      }}>
        You can add more roles from your account later
      </p>

      <RoleSelectionForm />
    </>
  )
}
