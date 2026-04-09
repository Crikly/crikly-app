export interface AuthError {
  code: string
  message: string
}

export interface AuthSuccessResponse {
  success: true
  redirectTo: string
}

export interface AuthErrorResponse {
  success: false
  error: AuthError
}

export type AuthResponse = AuthSuccessResponse | AuthErrorResponse

export interface RegisterFormData {
  fullName: string
  email: string
  password: string
}

export interface LoginFormData {
  email: string
  password: string
}

export interface ForgotPasswordFormData {
  email: string
}

export interface RoleSelectionData {
  role: 'parent' | 'player' | 'coach'
}
