import type {
  RegisterFormData,
  LoginFormData,
  ForgotPasswordFormData,
  RoleSelectionData,
  AuthError,
} from '@/types/auth'

describe('Auth type definitions', () => {
  it('RegisterFormData has required fields', () => {
    const data: RegisterFormData = {
      fullName: 'Ravi Kumar',
      email: 'ravi@example.com',
      password: 'password123',
    }
    expect(data.fullName).toBe('Ravi Kumar')
    expect(data.email).toBe('ravi@example.com')
    expect(data.password).toBe('password123')
  })

  it('LoginFormData has required fields', () => {
    const data: LoginFormData = {
      email: 'ravi@example.com',
      password: 'password123',
    }
    expect(data.email).toBe('ravi@example.com')
    expect(data.password).toBe('password123')
  })

  it('ForgotPasswordFormData has email field', () => {
    const data: ForgotPasswordFormData = { email: 'ravi@example.com' }
    expect(data.email).toBe('ravi@example.com')
  })

  it('RoleSelectionData accepts valid roles', () => {
    const parent: RoleSelectionData = { role: 'parent' }
    const player: RoleSelectionData = { role: 'player' }
    const coach: RoleSelectionData = { role: 'coach' }
    expect(parent.role).toBe('parent')
    expect(player.role).toBe('player')
    expect(coach.role).toBe('coach')
  })

  it('AuthError has code and message', () => {
    const error: AuthError = {
      code: 'INVALID_CREDENTIALS',
      message: 'Incorrect email or password.',
    }
    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(error.message).toBe('Incorrect email or password.')
  })
})
