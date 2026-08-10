import { AuthSplitShell } from '@/components/auth/AuthSplitShell'
import { RoleSelectionForm } from '@/components/auth/RoleSelectionForm'
import { parseRoleParam } from '@/lib/auth/role-param'

export const metadata = {
  title: 'How will you use Crikly?',
}

// P-04-B (AUTH-FLOW-01): a validated ?role= forwarded by /auth/callback or
// the login form is auto-submitted by RoleSelectionForm — the picker UI is
// skipped. Invalid/missing → normal picker, unchanged.
export default async function RoleSelectionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const preselectedRole = parseRoleParam(params.role)

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

      <RoleSelectionForm preselectedRole={preselectedRole} />
    </AuthSplitShell>
  )
}
