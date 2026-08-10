// P-04-B (AUTH-FLOW-01): the single allow-list gate for the ?role= URL
// param. Every ingestion point (register/login pages, register/oauth API
// routes, /auth/callback, /onboarding/role) MUST pass raw input through
// parseRoleParam before any use or storage. Anything not in the allow-list
// returns null and the caller silently drops the param — never an error,
// never echoed back.

export type RoleParam = 'parent' | 'player' | 'coach'

const VALID_ROLE_PARAMS: readonly string[] = ['parent', 'player', 'coach']

export function parseRoleParam(value: unknown): RoleParam | null {
  if (typeof value !== 'string') return null
  return VALID_ROLE_PARAMS.includes(value) ? (value as RoleParam) : null
}
