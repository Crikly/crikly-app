import type { RegisterFormData, LoginFormData } from '@/types/auth'

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePassword(password: string): boolean {
  return password.length >= 8
}

function validateRegisterForm(data: RegisterFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!data.fullName.trim()) errors.fullName = 'Full name is required'
  if (!data.email.trim()) errors.email = 'Email address is required'
  else if (!validateEmail(data.email)) errors.email = 'Please enter a valid email address'
  if (!data.password) errors.password = 'Password is required'
  else if (!validatePassword(data.password)) errors.password = 'Password must be at least 8 characters'
  return errors
}

function validateLoginForm(data: LoginFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!data.email.trim()) errors.email = 'Email address is required'
  else if (!validateEmail(data.email)) errors.email = 'Please enter a valid email address'
  if (!data.password) errors.password = 'Password is required'
  return errors
}

describe('Email validation', () => {
  it('accepts valid email addresses', () => {
    expect(validateEmail('test@example.com')).toBe(true)
    expect(validateEmail('user.name@domain.co.uk')).toBe(true)
    expect(validateEmail('user+tag@example.org')).toBe(true)
  })

  it('rejects invalid email addresses', () => {
    expect(validateEmail('')).toBe(false)
    expect(validateEmail('notanemail')).toBe(false)
    expect(validateEmail('@nodomain.com')).toBe(false)
    expect(validateEmail('missing@')).toBe(false)
    expect(validateEmail('spaces in@email.com')).toBe(false)
  })
})

describe('Password validation', () => {
  it('accepts passwords with 8 or more characters', () => {
    expect(validatePassword('password')).toBe(true)
    expect(validatePassword('12345678')).toBe(true)
    expect(validatePassword('averylongpassword123')).toBe(true)
  })

  it('rejects passwords with fewer than 8 characters', () => {
    expect(validatePassword('')).toBe(false)
    expect(validatePassword('1234567')).toBe(false)
    expect(validatePassword('short')).toBe(false)
  })
})

describe('Register form validation', () => {
  it('returns no errors for valid data', () => {
    const errors = validateRegisterForm({
      fullName: 'Ravi Kumar',
      email: 'ravi@example.com',
      password: 'securepass123',
    })
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('requires full name', () => {
    const errors = validateRegisterForm({
      fullName: '',
      email: 'ravi@example.com',
      password: 'securepass123',
    })
    expect(errors.fullName).toBe('Full name is required')
  })

  it('requires valid email', () => {
    const errors = validateRegisterForm({
      fullName: 'Ravi Kumar',
      email: 'notanemail',
      password: 'securepass123',
    })
    expect(errors.email).toBe('Please enter a valid email address')
  })

  it('requires password of 8+ characters', () => {
    const errors = validateRegisterForm({
      fullName: 'Ravi Kumar',
      email: 'ravi@example.com',
      password: 'short',
    })
    expect(errors.password).toBe('Password must be at least 8 characters')
  })

  it('returns multiple errors when multiple fields are invalid', () => {
    const errors = validateRegisterForm({
      fullName: '',
      email: '',
      password: '',
    })
    expect(errors.fullName).toBeDefined()
    expect(errors.email).toBeDefined()
    expect(errors.password).toBeDefined()
  })
})

describe('Login form validation', () => {
  it('returns no errors for valid data', () => {
    const errors = validateLoginForm({
      email: 'ravi@example.com',
      password: 'anypassword',
    })
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('requires email', () => {
    const errors = validateLoginForm({ email: '', password: 'password123' })
    expect(errors.email).toBe('Email address is required')
  })

  it('requires valid email format', () => {
    const errors = validateLoginForm({ email: 'bademail', password: 'password123' })
    expect(errors.email).toBe('Please enter a valid email address')
  })

  it('requires password', () => {
    const errors = validateLoginForm({ email: 'ravi@example.com', password: '' })
    expect(errors.password).toBe('Password is required')
  })
})
