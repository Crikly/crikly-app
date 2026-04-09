# Crikly — Auth Component Architecture

**Version:** 1.0  
**Last Updated:** March 2026  
**Status:** Approved  
**Feeds tasks:** A-08, A-09, A-10, A-11, A-12

Complete component architecture plan for all authentication screens. Every file path, every component decision, every type definition is specified here. @FrontendDeveloper can implement without making architectural decisions.

---

## 1. File Structure

### Pages (Next.js App Router)

All auth pages use the `(auth)` route group to share layout without affecting URL structure.

```
src/app/(auth)/
├── layout.tsx                    ← Auth layout wrapper (Server Component)
├── register/
│   └── page.tsx                  ← Register page (Server Component) — A-08
├── login/
│   └── page.tsx                  ← Login page (Server Component) — A-09
├── forgot-password/
│   └── page.tsx                  ← Forgot password page (Server Component) — A-11
└── verify/
    └── page.tsx                  ← Email verification page (Server Component) — A-11

src/app/(onboarding)/
└── role/
    └── page.tsx                  ← Role selection page (Server Component) — A-10
```

### Components

```
src/components/auth/
├── RegisterForm.tsx              ← Register form (Client Component) — A-08
├── LoginForm.tsx                 ← Login form (Client Component) — A-09
├── ForgotPasswordForm.tsx        ← Forgot password form (Client Component) — A-11
├── SocialAuthButtons.tsx         ← Google/Apple buttons (Client Component) — A-08, A-09
├── AuthLogo.tsx                  ← Crikly logo (Server Component) — shared
├── AuthDivider.tsx               ← "or continue with" divider (Server Component) — shared
└── RoleCard.tsx                  ← Role selection card (Client Component) — A-10
```

### Types

```
src/types/auth.ts                 ← All auth-related types
```

### No new UI components needed

All auth screens use existing components from `src/components/ui/`:
- `Button` (primary CTA, social buttons)
- `Input` (email, password, text inputs)
- `Spinner` (loading states)
- `Toast` (success/error notifications)

---

## 2. Server vs Client Components

### Server Components (no 'use client')

**Why Server Component:**
- No interactivity required
- Static content only
- SEO-friendly
- Faster initial load

| File | Type | Reason |
|---|---|---|
| `src/app/(auth)/layout.tsx` | Server | Layout wrapper, no state |
| `src/app/(auth)/register/page.tsx` | Server | Page shell, delegates to client form |
| `src/app/(auth)/login/page.tsx` | Server | Page shell, delegates to client form |
| `src/app/(auth)/forgot-password/page.tsx` | Server | Page shell, delegates to client form |
| `src/app/(auth)/verify/page.tsx` | Server | Static content + server-side email param |
| `src/app/(onboarding)/role/page.tsx` | Server | Page shell, delegates to client component |
| `src/components/auth/AuthLogo.tsx` | Server | Static SVG/text, no interaction |
| `src/components/auth/AuthDivider.tsx` | Server | Static text + lines, no interaction |

### Client Components ('use client' required)

**Why Client Component:**
- Form state management (controlled inputs)
- Event handlers (onChange, onSubmit, onClick)
- Loading states
- Error states
- Browser APIs (localStorage for redirect tracking)

| File | Type | Reason |
|---|---|---|
| `src/components/auth/RegisterForm.tsx` | Client | Form state, validation, submission |
| `src/components/auth/LoginForm.tsx` | Client | Form state, validation, submission |
| `src/components/auth/ForgotPasswordForm.tsx` | Client | Form state, success state toggle |
| `src/components/auth/SocialAuthButtons.tsx` | Client | Click handlers, OAuth redirect |
| `src/components/auth/RoleCard.tsx` | Client | Selection state, click handlers |

---

## 3. Component Hierarchy

### Register Page (`/register`)

```
page.tsx (Server)
└── RegisterForm (Client)
    ├── AuthLogo (Server)
    ├── Heading + Subheading (static JSX)
    ├── Input (from ui/) × 3 (name, email, password)
    ├── Button (from ui/) — primary CTA
    ├── AuthDivider (Server)
    ├── SocialAuthButtons (Client)
    │   ├── Button (from ui/) — Google
    │   └── Button (from ui/) — Apple
    └── Footer link (Next.js Link)
```

### Login Page (`/login`)

```
page.tsx (Server)
└── LoginForm (Client)
    ├── AuthLogo (Server)
    ├── Heading + Subheading (static JSX)
    ├── Input (from ui/) × 2 (email, password)
    ├── Forgot password link (Next.js Link)
    ├── Button (from ui/) — primary CTA
    ├── AuthDivider (Server)
    ├── SocialAuthButtons (Client)
    └── Footer link (Next.js Link)
```

### Forgot Password Page (`/forgot-password`)

```
page.tsx (Server)
└── ForgotPasswordForm (Client)
    ├── Back link (Next.js Link)
    ├── AuthLogo (Server)
    ├── Heading + Subheading (static JSX)
    ├── Input (from ui/) — email
    ├── Button (from ui/) — primary CTA
    └── [Success state] — conditional render
        ├── Heading
        ├── Email display box
        ├── Resend link
        └── Spam note
```

### Email Verification Page (`/auth/verify`)

```
page.tsx (Server)
├── AuthLogo (Server)
├── Heading + Body text (static JSX)
├── Email display box (server-rendered with URL param)
├── Resend link (Client interaction via form action)
└── Back to login link (Next.js Link)
```

### Role Selection Page (`/onboarding/role`)

```
page.tsx (Server)
└── RoleSelectionForm (Client)
    ├── Progress indicator (static JSX)
    ├── Heading + Subheading (static JSX)
    ├── RoleCard (Client) × 3 (Parent, Player, Coach)
    │   ├── Icon (emoji or SVG)
    │   ├── Role name
    │   └── Description
    ├── Age requirement note (static JSX)
    └── Button (from ui/) — Continue CTA
```

---

## 4. Shared Components

### AuthLogo (Server Component)

**File:** `src/components/auth/AuthLogo.tsx`

**Purpose:** Consistent Crikly logo across all auth screens

**Props:** None

**Implementation:**
```typescript
export function AuthLogo() {
  return (
    <div className="text-center mb-6">
      <h1 className="text-[32px] font-bold tracking-tight text-neutral-900">
        crik<span className="text-brand-600">ly</span>
      </h1>
    </div>
  )
}
```

### AuthDivider (Server Component)

**File:** `src/components/auth/AuthDivider.tsx`

**Purpose:** "or continue with" divider for social auth sections

**Props:** None

**Implementation:**
```typescript
export function AuthDivider() {
  return (
    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-neutral-100" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-neutral-50 px-4 text-neutral-400">
          or continue with
        </span>
      </div>
    </div>
  )
}
```

### SocialAuthButtons (Client Component)

**File:** `src/components/auth/SocialAuthButtons.tsx`

**Purpose:** Google and Apple OAuth buttons

**Props:**
```typescript
interface SocialAuthButtonsProps {
  mode: 'register' | 'login'
}
```

**State:** Loading state for each button independently

**API calls:** Calls `/api/auth/social` with provider parameter

**Implementation notes:**
- Two separate buttons (not a loop) for explicit control
- Each button has its own loading state
- Disabled when either is loading
- Uses Button component from ui/ with variant="secondary"

### RoleCard (Client Component)

**File:** `src/components/auth/RoleCard.tsx`

**Purpose:** Individual role selection card

**Props:**
```typescript
interface RoleCardProps {
  role: 'parent' | 'player' | 'coach'
  icon: string // emoji or icon name
  title: string
  description: string
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}
```

**State:** None (controlled by parent)

**Implementation notes:**
- Border changes based on `selected` prop
- Background changes to brand-50 when selected
- Scale animation on tap (active state)
- Disabled state reduces opacity

---

## 5. State Management

### RegisterForm State

```typescript
// Component state (useState)
const [formData, setFormData] = useState<RegisterFormData>({
  fullName: '',
  email: '',
  password: ''
})
const [errors, setErrors] = useState<Partial<RegisterFormData>>({})
const [isLoading, setIsLoading] = useState(false)
const [apiError, setApiError] = useState<string | null>(null)

// No URL state
// No localStorage (except redirect URL after success)
```

**Form handling:**
- Controlled inputs (value + onChange)
- Client-side validation on blur
- Submit validation before API call
- Loading state disables all inputs + buttons

**Data flow:**
1. User types → `onChange` → update `formData`
2. User submits → validate → call `/api/auth/register`
3. Success → redirect to `/auth/verify?email={email}`
4. Error → set `apiError` → display below CTA

### LoginForm State

```typescript
const [formData, setFormData] = useState<LoginFormData>({
  email: '',
  password: ''
})
const [errors, setErrors] = useState<Partial<LoginFormData>>({})
const [isLoading, setIsLoading] = useState(false)
const [apiError, setApiError] = useState<string | null>(null)
```

**Data flow:**
1. User types → update `formData`
2. User submits → call `/api/auth/login`
3. Success → redirect to `/dashboard` or `/onboarding/role` (based on API response)
4. Error → set `apiError` → display below CTA

### ForgotPasswordForm State

```typescript
const [email, setEmail] = useState('')
const [isLoading, setIsLoading] = useState(false)
const [isSuccess, setIsSuccess] = useState(false)
const [apiError, setApiError] = useState<string | null>(null)
```

**Data flow:**
1. User types email → update `email`
2. User submits → call `/api/auth/forgot-password`
3. Success → set `isSuccess = true` → show success UI (same page)
4. Error → set `apiError` → display below input

**Success state:**
- Entire form replaced with success message
- Email displayed from state
- Resend link calls same API again

### Role Selection State

```typescript
const [selectedRole, setSelectedRole] = useState<'parent' | 'player' | 'coach' | null>(null)
const [isLoading, setIsLoading] = useState(false)
const [apiError, setApiError] = useState<string | null>(null)
```

**Data flow:**
1. User taps card → set `selectedRole`
2. Continue button enabled
3. User taps Continue → call `/api/auth/roles`
4. Success → redirect to `/onboarding/sport` or age gate
5. Error → set `apiError` → display below CTA

---

## 6. Data Flow

### Register Flow

```
RegisterForm (client)
  ↓ onSubmit
POST /api/auth/register
  body: { fullName, email, password }
  ↓
API route validates input
  ↓
Supabase Auth: signUp()
  ↓
Success: { user, session }
  ↓
API returns: { success: true, email }
  ↓
Client redirects: /auth/verify?email={email}
```

**Error cases:**
- Email already exists → API returns `{ error: 'EMAIL_EXISTS' }` → show "An account with this email already exists"
- Validation error → API returns `{ error: 'VALIDATION_ERROR' }` → show "Please check your details and try again"
- Network error → show "Something went wrong. Please try again."

### Login Flow

```
LoginForm (client)
  ↓ onSubmit
POST /api/auth/login
  body: { email, password }
  ↓
API route validates input
  ↓
Supabase Auth: signInWithPassword()
  ↓
Success: { user, session }
  ↓
Check if user has role in accounts table
  ↓
API returns: { success: true, hasRole: boolean }
  ↓
Client redirects:
  - hasRole = true → /dashboard
  - hasRole = false → /onboarding/role
```

**Error cases:**
- Wrong credentials → API returns `{ error: 'INVALID_CREDENTIALS' }` → show "Incorrect email or password"
- Unverified email → API returns `{ error: 'EMAIL_NOT_VERIFIED' }` → show "Please verify your email before logging in" + resend link
- Network error → show "Something went wrong. Please try again."

### Forgot Password Flow

```
ForgotPasswordForm (client)
  ↓ onSubmit
POST /api/auth/forgot-password
  body: { email }
  ↓
API route validates email format
  ↓
Supabase Auth: resetPasswordForEmail()
  ↓
Success (always returns success for security)
  ↓
API returns: { success: true }
  ↓
Client sets isSuccess = true
  ↓
Show success UI (same page, no redirect)
```

**Resend flow:**
- User clicks "Resend email" → call same API again
- Show toast: "Reset link sent"

### Social Auth Flow

```
SocialAuthButtons (client)
  ↓ onClick (Google or Apple)
POST /api/auth/social
  body: { provider: 'google' | 'apple' }
  ↓
API route generates OAuth URL
  ↓
Supabase Auth: signInWithOAuth()
  ↓
API returns: { url: string }
  ↓
Client redirects to OAuth URL
  ↓
User completes OAuth on provider site
  ↓
Redirect back to /auth/callback
  ↓
Callback route exchanges code for session
  ↓
Check if user has role
  ↓
Redirect to /dashboard or /onboarding/role
```

### Role Selection Flow

```
RoleSelectionForm (client)
  ↓ onSubmit
POST /api/auth/roles
  body: { role: 'parent' | 'player' | 'coach' }
  ↓
API route validates role
  ↓
Insert into accounts table: { user_id, role, is_primary: true }
  ↓
API returns: { success: true }
  ↓
Client redirects:
  - Player → /onboarding/age-gate (future)
  - Parent/Coach → /onboarding/sport
```

---

## 7. Type Definitions

**File:** `src/types/auth.ts`

```typescript
// Form data types
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

// API response types
export interface AuthSuccessResponse {
  success: true
  user?: {
    id: string
    email: string
  }
  hasRole?: boolean
  redirectTo?: string
}

export interface AuthErrorResponse {
  success: false
  error: AuthErrorCode
  message: string
}

export type AuthErrorCode =
  | 'EMAIL_EXISTS'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export type AuthResponse = AuthSuccessResponse | AuthErrorResponse

// Component prop types
export interface SocialAuthButtonsProps {
  mode: 'register' | 'login'
  disabled?: boolean
}

export interface RoleCardProps {
  role: 'parent' | 'player' | 'coach'
  icon: string
  title: string
  description: string
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}

// Validation error types
export interface ValidationErrors {
  fullName?: string
  email?: string
  password?: string
}
```

---

## 8. Routing Flow

### Complete auth journey

```
Landing page (/)
  ↓ "Get started" button
/register
  ↓ Submit form
/auth/verify?email={email}
  ↓ Click verification link in email
/onboarding/role
  ↓ Select role + Continue
/onboarding/sport (future — not in A-08 to A-12)
```

### Alternative flows

**Existing user:**
```
Landing page (/)
  ↓ "Log in" link
/login
  ↓ Submit form
/dashboard (if has role)
  OR
/onboarding/role (if no role — first-time social auth)
```

**Forgot password:**
```
/login
  ↓ "Forgot password?" link
/forgot-password
  ↓ Submit email
[Success state shown on same page]
  ↓ Click reset link in email
/reset-password?token={token} (future — not in A-08 to A-12)
```

**Social auth:**
```
/register or /login
  ↓ Click "Google" or "Apple"
[OAuth provider site]
  ↓ Complete OAuth
/auth/callback
  ↓ Exchange code for session
/dashboard (if has role)
  OR
/onboarding/role (if no role)
```

---

## 9. API Routes Used

All API routes already implemented in A-01 to A-05.

| Route | Method | Purpose | Request Body | Response |
|---|---|---|---|---|
| `/api/auth/register` | POST | Create account | `{ fullName, email, password }` | `{ success, user }` or `{ error }` |
| `/api/auth/login` | POST | Sign in | `{ email, password }` | `{ success, hasRole }` or `{ error }` |
| `/api/auth/forgot-password` | POST | Send reset email | `{ email }` | `{ success }` |
| `/api/auth/social` | POST | OAuth URL | `{ provider }` | `{ url }` |
| `/api/auth/roles` | POST | Add role | `{ role }` | `{ success }` |
| `/api/auth/callback` | GET | OAuth callback | Query params | Redirect |

---

## 10. Validation Rules

### Client-side validation (before API call)

**Full name:**
- Required
- Minimum 2 characters
- Maximum 100 characters
- No validation on format (allows international names)

**Email:**
- Required
- Valid email format (regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Maximum 255 characters

**Password:**
- Required
- Minimum 8 characters
- Maximum 128 characters
- No complexity requirements (Supabase handles this)

**Role:**
- Required
- Must be one of: 'parent', 'player', 'coach'

### Server-side validation (in API routes)

Same rules as client-side, plus:
- Sanitize all inputs
- Check email doesn't already exist (register only)
- Verify session token (role assignment only)

---

## 11. Error Handling Strategy

### Display locations

**Field-level errors:**
- Show below input with red border
- Text: 13px, danger color (#B91C1C)
- Icon: ⚠️ to left of text

**Form-level errors:**
- Show below CTA button
- Centered text
- Same styling as field errors

**Toast notifications:**
- Success: green background (#1A7A4A), white text
- Error: red background (#B91C1C), white text
- Auto-dismiss after 3 seconds

### Error messages

**Validation errors:**
- "Please enter your full name"
- "Please enter a valid email address"
- "Password must be at least 8 characters"

**API errors:**
- "An account with this email already exists"
- "Incorrect email or password"
- "Please verify your email before logging in"
- "Something went wrong. Please try again."

### Loading states

**Button loading:**
- Replace button text with Spinner component
- Spinner: white, 20px
- Button disabled
- All inputs disabled

**Inline loading:**
- Small spinner next to link text
- Spinner: brand-600, 16px
- Link disabled temporarily

---

## 12. Accessibility Requirements

### Keyboard navigation

- Tab order follows visual order
- All interactive elements focusable
- Focus indicators always visible (never `outline: none`)
- Enter key submits forms
- Escape key closes modals (future)

### Screen readers

- All inputs have visible labels (not placeholder-only)
- Error messages announced when they appear
- Loading states announced
- Success states announced
- All icons have `aria-label` or sr-only text

### Touch targets

- Minimum 44×44px on all interactive elements
- Adequate spacing between tappable elements
- No overlapping touch targets

### Color contrast

- All text meets WCAA AA standards (4.5:1 minimum)
- Error states don't rely on color alone (icon + text)
- Focus indicators have 3:1 contrast with background

---

## 13. Mobile Considerations

### Keyboard behavior

- Email input: `type="email"` triggers email keyboard
- Password input: `type="password"` triggers password keyboard
- Auto-focus on first input (except role selection)
- Keyboard pushes content up (scroll enabled)

### Touch interactions

- Active state: `scale(0.98)` on button press
- No hover states on mobile
- Swipe gestures: none (not needed for auth)
- Pull to refresh: disabled on auth pages

### Responsive layout

**Mobile (< 768px):**
- Full width inputs and buttons
- Padding: 16px
- Button height: 52px
- Input height: 52px

**Desktop (≥ 768px):**
- Max content width: 400px (forms) / 480px (role selection)
- Padding: 24px
- Button height: 44px
- Input height: 44px
- Hover states enabled

---

## 14. Performance Considerations

### Code splitting

- Each page is automatically code-split by Next.js
- Client components lazy-loaded only when needed
- Social auth buttons only loaded on register/login pages

### Bundle size

- No external form libraries (react-hook-form, formik)
- No external validation libraries (yup, zod)
- Use native HTML5 validation where possible
- Minimal JavaScript for auth flows

### Loading strategy

- Server components render first (instant)
- Client components hydrate after
- Forms interactive immediately after hydration
- No loading spinners on initial page load

---

## 15. Security Considerations

### Client-side

- Never store passwords in state longer than necessary
- Clear form data on unmount
- No sensitive data in localStorage
- HTTPS only (enforced by Vercel)

### API calls

- All API calls go through Next.js API routes (never direct Supabase from client)
- CSRF protection via Next.js
- Rate limiting on API routes (future)
- Input sanitization on server

### Session management

- Sessions managed by Supabase Auth
- HttpOnly cookies (set by Supabase)
- Automatic token refresh
- Logout clears all cookies

---

## 16. Testing Strategy (for A-13, A-14, A-15)

### Unit tests

- Form validation logic
- Error message display
- State management
- Input sanitization

### Integration tests

- Register → verify flow
- Login → dashboard flow
- Forgot password → email sent
- Role selection → redirect

### E2E tests

- Complete registration journey
- Complete login journey
- Social auth flow
- Error handling

---

## 17. Implementation Order

Follow this exact order for A-08 to A-12:

**A-08: Register page**
1. Create `src/types/auth.ts`
2. Create `src/components/auth/AuthLogo.tsx`
3. Create `src/components/auth/AuthDivider.tsx`
4. Create `src/components/auth/SocialAuthButtons.tsx`
5. Create `src/components/auth/RegisterForm.tsx`
6. Create `src/app/(auth)/layout.tsx`
7. Create `src/app/(auth)/register/page.tsx`

**A-09: Login page**
1. Create `src/components/auth/LoginForm.tsx`
2. Create `src/app/(auth)/login/page.tsx`

**A-10: Role selection**
1. Create `src/components/auth/RoleCard.tsx`
2. Create `src/app/(onboarding)/role/page.tsx`

**A-11: Forgot password + email verification**
1. Create `src/components/auth/ForgotPasswordForm.tsx`
2. Create `src/app/(auth)/forgot-password/page.tsx`
3. Create `src/app/(auth)/verify/page.tsx`

**A-12: Multi-role switcher**
- Future task (not covered in this architecture doc)

---

## 18. File Size Estimates

| File | Lines | Complexity |
|---|---|---|
| `src/types/auth.ts` | ~80 | Low |
| `src/components/auth/AuthLogo.tsx` | ~15 | Low |
| `src/components/auth/AuthDivider.tsx` | ~20 | Low |
| `src/components/auth/SocialAuthButtons.tsx` | ~80 | Medium |
| `src/components/auth/RegisterForm.tsx` | ~200 | High |
| `src/components/auth/LoginForm.tsx` | ~180 | High |
| `src/components/auth/ForgotPasswordForm.tsx` | ~150 | Medium |
| `src/components/auth/RoleCard.tsx` | ~60 | Low |
| `src/app/(auth)/layout.tsx` | ~30 | Low |
| `src/app/(auth)/register/page.tsx` | ~20 | Low |
| `src/app/(auth)/login/page.tsx` | ~20 | Low |
| `src/app/(auth)/forgot-password/page.tsx` | ~20 | Low |
| `src/app/(auth)/verify/page.tsx` | ~80 | Medium |
| `src/app/(onboarding)/role/page.tsx` | ~100 | Medium |

**Total:** ~1,055 lines across 14 files

---

## 19. Dependencies Required

All dependencies already installed (from DS-03, DS-04):

- `next` (App Router)
- `react`
- `typescript`
- `tailwindcss`
- `@supabase/supabase-js` (client)
- `@fontsource/dm-sans`

**No new dependencies needed.**

---

## 20. Constraints Summary

✅ **Followed:**
- No 'use client' on page files
- Forms use controlled inputs
- No external form libraries
- No `any` types
- Social auth buttons are client components
- All API calls through Next.js routes

✅ **Architecture decisions:**
- Server Components by default
- Client Components only for interactivity
- Minimal JavaScript
- Type-safe throughout
- Accessible
- Mobile-first

---

*Crikly Auth Component Architecture v1.0 — March 2026*  
*Complete architecture for tasks A-08, A-09, A-10, A-11*  
*No architectural decisions required — implement exactly as specified*
