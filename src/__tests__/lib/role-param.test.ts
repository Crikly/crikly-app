import { parseRoleParam } from '@/lib/auth/role-param'

// P-04-B: the single allow-list gate for ?role=. Everything not in the
// allow-list must return null — silently, never an error.
describe('parseRoleParam', () => {
  it('accepts exactly the three allow-listed roles', () => {
    expect(parseRoleParam('parent')).toBe('parent')
    expect(parseRoleParam('player')).toBe('player')
    expect(parseRoleParam('coach')).toBe('coach')
  })

  it('rejects unknown role strings', () => {
    expect(parseRoleParam('admin')).toBeNull()
    expect(parseRoleParam('superadmin')).toBeNull()
    expect(parseRoleParam('Parent')).toBeNull() // case-sensitive
    expect(parseRoleParam(' parent')).toBeNull() // no trimming — exact match only
    expect(parseRoleParam('parent,coach')).toBeNull()
  })

  it('rejects injection-shaped values', () => {
    expect(parseRoleParam('parent"><script>alert(1)</script>')).toBeNull()
    expect(parseRoleParam("parent' OR '1'='1")).toBeNull()
    expect(parseRoleParam('%70arent')).toBeNull()
  })

  it('rejects non-string input', () => {
    expect(parseRoleParam(null)).toBeNull()
    expect(parseRoleParam(undefined)).toBeNull()
    expect(parseRoleParam(42)).toBeNull()
    expect(parseRoleParam(['parent'])).toBeNull()
    expect(parseRoleParam({ role: 'parent' })).toBeNull()
    expect(parseRoleParam('')).toBeNull()
  })
})
