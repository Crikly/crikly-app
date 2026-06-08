import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { RoleSelectionForm } from '@/components/auth/RoleSelectionForm'

export const metadata = {
  title: 'How will you use Crikly?',
}

export default function RoleSelectionPage() {
  return (
    <AuthSplitShell>
      {/* Step 1 of 2 — progress bar (inline styles preserved from prior design) */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            height: '3px',
            background: '#E2E8F0',
            borderRadius: '2px',
            marginBottom: '6px',
          }}
        >
          <div
            style={{
              height: '3px',
              width: '50%',
              background: '#0077CC',
              borderRadius: '2px',
            }}
          />
        </div>
        <p style={{ fontSize: '11px', color: '#94A3B8', margin: 0 }}>Step 1 of 2</p>
      </div>

      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900">
        Welcome to Crikly.
      </h1>
      <p className="mb-7 text-sm leading-relaxed text-neutral-600">
        How will you use Crikly? You can add more roles from your account later.
      </p>

      <RoleSelectionForm />
    </AuthSplitShell>
  )
}
