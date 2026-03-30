import { RoleSwitcher } from '@/components/nav/RoleSwitcher'

export const metadata = {
  title: 'Dashboard — Crikly',
}

export default function DashboardPage() {
  return (
    <main style={{ padding: '32px 24px', maxWidth: '640px', margin: '0 auto' }}>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
      }}>
        <div style={{
          fontSize: '20px',
          fontWeight: 700,
          color: '#0F172A',
          letterSpacing: '-0.5px',
        }}>
          crik<span style={{ color: '#0077CC' }}>ly</span>
        </div>

        <RoleSwitcher
          availableRoles={['parent', 'coach']}
          activeRole="parent"
        />
      </div>

      <div style={{
        background: '#fff',
        border: '0.5px solid #E2E8F0',
        borderRadius: '14px',
        padding: '40px 32px',
        textAlign: 'center',
      }}>
        <p style={{
          fontSize: '13px',
          color: '#94A3B8',
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
          marginBottom: '12px',
        }}>
          Dashboard
        </p>
        <h1 style={{
          fontSize: '22px',
          fontWeight: 600,
          color: '#0F172A',
          letterSpacing: '-0.3px',
          margin: '0 0 10px',
        }}>
          You&apos;re in
        </h1>
        <p style={{
          fontSize: '14px',
          color: '#475569',
          lineHeight: 1.6,
        }}>
          Auth is working. Full dashboard coming soon.
        </p>
      </div>

    </main>
  )
}
