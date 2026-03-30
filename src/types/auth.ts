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

export type AuthErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'WEAK_PASSWORD'
  | 'INVALID_EMAIL'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export interface AuthError {
  code: AuthErrorCode
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
