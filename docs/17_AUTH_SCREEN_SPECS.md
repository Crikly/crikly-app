# Crikly — Auth Screen Specifications

**Version:** 1.0  
**Last Updated:** March 2026  
**Status:** Approved  
**Feeds tasks:** A-08, A-09, A-10, A-11, A-12

Complete specifications for all authentication screens. Every element, every state, every piece of copy is defined here. @FrontendDeveloper should be able to build these screens without making any design decisions.

---

## Screen 1 — Register

**Route:** `/register`  
**Purpose:** Create a new Crikly account with email and password  
**Accessed from:** Homepage "Get started" button, login page "Create account" link  
**Goes to:** Email verification screen (`/auth/verify`)

### Layout

- Full viewport height, centered content
- Max content width: 400px
- Horizontal padding: space-4 (16px) mobile, space-6 (24px) desktop
- Vertical padding: space-8 (32px) from top
- Background: neutral-50 (#F0F7FF)

### Components (top to bottom)

**Logo**
- Position: centered, space-8 (32px) from top
- Text: "crik" + "ly" (ly in brand-600 #0077CC)
- Font: 32px, weight 700, neutral-900
- Letter spacing: -0.5px
- Margin bottom: space-6 (24px)

**Heading**
- Text: "Create your account"
- Font: text-2xl (24px), weight 600, neutral-900
- Margin bottom: space-2 (8px)

**Subheading**
- Text: "Join coaches and players across the UK"
- Font: text-base (15px), weight 400, neutral-600
- Margin bottom: space-6 (24px)

**Full name input**
- Label: "FULL NAME" (12px, weight 500, neutral-600, uppercase, 0.5px spacing)
- Label margin bottom: space-2 (8px)
- Input height: 52px mobile / 44px desktop
- Background: white
- Border: 1px solid neutral-100
- Border radius: radius-md (10px)
- Placeholder: "Your full name"
- Font: 15px DM Sans, weight 400, neutral-900
- Padding: 0 space-4 (16px)
- Margin bottom: space-4 (16px)
- Validation: Required, minimum 2 characters

**Email input**
- Label: "EMAIL ADDRESS"
- Input type: email
- Placeholder: "you@example.com"
- Same styling as full name input
- Margin bottom: space-4 (16px)
- Validation: Required, valid email format

**Password input**
- Label: "PASSWORD"
- Input type: password
- Placeholder: "8+ characters"
- Same styling as full name input
- Margin bottom: space-6 (24px)
- Validation: Required, minimum 8 characters

**Primary CTA button**
- Text: "Create account"
- Background: brand-600 (#0077CC)
- Text: white, 15px, weight 500
- Height: 52px mobile / 44px desktop
- Border radius: radius-md (10px)
- Padding: 0 24px
- Width: 100%
- Margin bottom: space-4 (16px)

**Social divider**
- Text: "or continue with"
- Font: text-sm (13px), neutral-400
- Centered with horizontal lines (neutral-100) on both sides
- Margin bottom: space-4 (16px)

**Google button**
- Text: "Google" with Google icon
- Background: white
- Border: 1px solid neutral-100
- Text: neutral-900, 15px, weight 500
- Height: 52px mobile / 44px desktop
- Border radius: radius-md (10px)
- Width: 100%
- Margin bottom: space-3 (12px)

**Apple button**
- Text: "Apple" with Apple icon
- Same styling as Google button
- Margin bottom: space-6 (24px)

**Footer link**
- Text: "Already have an account? " + "Log in" (link)
- Font: text-sm (13px), neutral-600
- Link color: brand-600, weight 500
- Centered
- Link destination: `/login`

### States

**Default state**
- All inputs empty
- CTA button enabled
- No error messages visible

**Loading state** (after CTA tap)
- CTA button shows spinner (white, 20px)
- Button text hidden
- Button disabled (cursor: not-allowed)
- All inputs disabled
- Social buttons disabled

**Error state — email already exists**
- Red border (danger #B91C1C) on email input
- Error message below email input: "An account with this email already exists"
- Error text: 13px, danger color, margin top space-2 (8px)
- Focus returns to email input

**Error state — validation failure**
- Red border on invalid field(s)
- Error message below CTA: "Please check your details and try again"
- Error text: 13px, danger color, centered, margin top space-2 (8px)

**Success state**
- Immediate redirect to `/auth/verify` with email parameter
- No intermediate confirmation shown

### Mobile-specific notes

- Keyboard type: email for email input, default for others
- Keyboard pushes content up (scroll enabled)
- Auto-focus on full name input on page load
- Tab order: full name → email → password → CTA
- Touch targets: all buttons minimum 44×44px

---

## Screen 2 — Log In

**Route:** `/login`  
**Purpose:** Sign in to existing Crikly account  
**Accessed from:** Homepage "Log in" link, register page footer link  
**Goes to:** Home screen (role-specific) or role selection if first login

### Layout

- Same layout structure as Register screen
- Max content width: 400px
- Horizontal padding: space-4 (16px) mobile, space-6 (24px) desktop
- Vertical padding: space-8 (32px) from top
- Background: neutral-50 (#F0F7FF)

### Components (top to bottom)

**Logo**
- Same as Register screen
- Margin bottom: space-6 (24px)

**Heading**
- Text: "Welcome back"
- Font: text-2xl (24px), weight 600, neutral-900
- Margin bottom: space-2 (8px)

**Subheading**
- Text: "Good to see you again"
- Font: text-base (15px), weight 400, neutral-600
- Margin bottom: space-6 (24px)

**Email input**
- Label: "EMAIL ADDRESS"
- Input type: email
- Placeholder: "you@example.com"
- Height: 52px mobile / 44px desktop
- Background: white
- Border: 1px solid neutral-100
- Border radius: radius-md (10px)
- Font: 15px DM Sans, weight 400
- Padding: 0 space-4 (16px)
- Margin bottom: space-4 (16px)

**Password input**
- Label: "PASSWORD"
- Input type: password
- Placeholder: "Your password"
- Same styling as email input
- Margin bottom: space-2 (8px)

**Forgot password link**
- Text: "Forgot password?"
- Font: text-sm (13px), brand-600, weight 500
- Aligned right
- Margin bottom: space-6 (24px)
- Destination: `/forgot-password`

**Primary CTA button**
- Text: "Log in"
- Same styling as Register CTA
- Margin bottom: space-4 (16px)

**Social divider**
- Same as Register screen
- Margin bottom: space-4 (16px)

**Google button**
- Same as Register screen
- Margin bottom: space-3 (12px)

**Apple button**
- Same as Register screen
- Margin bottom: space-6 (24px)

**Footer link**
- Text: "New to Crikly? " + "Create account" (link)
- Font: text-sm (13px), neutral-600
- Link color: brand-600, weight 500
- Centered
- Link destination: `/register`

### States

**Default state**
- All inputs empty
- CTA button enabled
- No error messages visible

**Loading state** (after CTA tap)
- CTA button shows spinner (white, 20px)
- Button text hidden
- Button disabled
- All inputs disabled
- Social buttons disabled

**Error state — incorrect credentials**
- Red border (danger #B91C1C) on both inputs
- Error message below CTA: "Incorrect email or password"
- Error text: 13px, danger color, centered, margin top space-2 (8px)
- Focus returns to email input

**Error state — unverified email**
- Info border (brand-600) on email input
- Error message below CTA: "Please verify your email before logging in"
- Error text: 13px, brand-600 color, centered
- "Resend verification email" link shown below error (text-sm, brand-600)

**Success state**
- Immediate redirect to home screen (last active role)
- Or redirect to `/onboarding/role` if first login
- No intermediate confirmation shown

### Mobile-specific notes

- Keyboard type: email for email input
- Auto-focus on email input on page load
- Tab order: email → password → forgot link → CTA
- Password visibility toggle icon (eye icon) inside password input, right side

---

## Screen 3 — Forgot Password

**Route:** `/forgot-password`  
**Purpose:** Request password reset link via email  
**Accessed from:** Login page "Forgot password?" link  
**Goes to:** Success state (same screen) showing confirmation

### Layout

- Same layout structure as Register/Login screens
- Max content width: 400px
- Horizontal padding: space-4 (16px) mobile, space-6 (24px) desktop
- Vertical padding: space-8 (32px) from top
- Background: neutral-50 (#F0F7FF)

### Components (top to bottom)

**Back link**
- Text: "← Back to log in"
- Font: text-sm (13px), brand-600, weight 500
- Positioned top left, space-4 (16px) from top
- Destination: `/login`
- Margin bottom: space-6 (24px)

**Logo**
- Same as Register screen
- Margin bottom: space-6 (24px)

**Heading**
- Text: "Reset your password"
- Font: text-2xl (24px), weight 600, neutral-900
- Margin bottom: space-2 (8px)

**Subheading**
- Text: "Enter your email and we'll send you a reset link"
- Font: text-base (15px), weight 400, neutral-600
- Margin bottom: space-6 (24px)

**Email input**
- Label: "EMAIL ADDRESS"
- Input type: email
- Placeholder: "you@example.com"
- Height: 52px mobile / 44px desktop
- Background: white
- Border: 1px solid neutral-100
- Border radius: radius-md (10px)
- Font: 15px DM Sans, weight 400
- Padding: 0 space-4 (16px)
- Margin bottom: space-6 (24px)

**Primary CTA button**
- Text: "Send reset link"
- Same styling as Register CTA
- Width: 100%

### States

**Default state**
- Email input empty
- CTA button enabled
- No error messages visible

**Loading state** (after CTA tap)
- CTA button shows spinner (white, 20px)
- Button text hidden
- Button disabled
- Email input disabled

**Error state — email not found**
- Info border (brand-600) on email input
- Error message below input: "No account found with this email"
- Error text: 13px, neutral-600, margin top space-2 (8px)
- Note: For security, we may choose to show success state even if email doesn't exist

**Success state**
- Entire screen content replaced with success message
- Heading: "Check your inbox"
- Font: text-2xl (24px), weight 600, neutral-900, centered
- Margin bottom: space-4 (16px)

**Success state — email display**
- User's email shown in highlighted box
- Background: brand-50 (#E6F3FB)
- Border: 1px solid brand-100
- Border radius: radius-md (10px)
- Padding: space-4 (16px)
- Font: text-base (15px), weight 500, neutral-900, centered
- Margin bottom: space-4 (16px)

**Success state — body text**
- Text: "We've sent a reset link to [email]"
- Font: text-base (15px), neutral-600, centered
- Margin bottom: space-6 (24px)

**Success state — resend link**
- Text: "Didn't receive it? " + "Resend email" (link)
- Font: text-sm (13px), neutral-600
- Link color: brand-600, weight 500
- Centered
- Margin bottom: space-4 (16px)

**Success state — spam note**
- Text: "Check your spam folder if you can't find it"
- Font: text-xs (11px), neutral-400, centered

### Mobile-specific notes

- Keyboard type: email
- Auto-focus on email input on page load
- Back link tappable area: minimum 44×44px

---

## Screen 4 — Email Verification

**Route:** `/auth/verify`  
**Purpose:** Inform user to check email for verification link  
**Accessed from:** Register screen (automatic redirect after successful registration)  
**Goes to:** Login screen (manual navigation) or role selection (via email link)

### Layout

- Same layout structure as previous screens
- Max content width: 400px
- Horizontal padding: space-4 (16px) mobile, space-6 (24px) desktop
- Vertical padding: space-8 (32px) from top
- Background: neutral-50 (#F0F7FF)
- Centered vertically and horizontally

### Components (top to bottom)

**Logo**
- Same as Register screen
- Margin bottom: space-8 (32px)

**Icon** (optional)
- Email icon or illustration
- Size: 80×80px
- Color: brand-600
- Centered
- Margin bottom: space-6 (24px)

**Heading**
- Text: "Check your inbox"
- Font: text-2xl (24px), weight 600, neutral-900, centered
- Margin bottom: space-4 (16px)

**Body text**
- Text: "We sent a verification link to [email]"
- Font: text-base (15px), neutral-600, centered
- Margin bottom: space-6 (24px)

**Email display box**
- User's email shown in highlighted box
- Background: brand-50 (#E6F3FB)
- Border: 1px solid brand-100
- Border radius: radius-md (10px)
- Padding: space-4 (16px)
- Font: text-base (15px), weight 500, neutral-900, centered
- Margin bottom: space-6 (24px)

**Resend link**
- Text: "Didn't receive it? " + "Resend email" (link)
- Font: text-sm (13px), neutral-600
- Link color: brand-600, weight 500
- Centered
- Margin bottom: space-4 (16px)

**Spam folder note**
- Text: "Check your spam folder if you can't find it"
- Font: text-xs (11px), neutral-400, centered
- Margin bottom: space-8 (32px)

**Secondary action link**
- Text: "Back to log in"
- Font: text-sm (13px), brand-600, weight 500
- Centered
- Destination: `/login`

### States

**Default state**
- Email displayed from URL parameter or registration context
- Resend link enabled

**Resend loading state**
- Resend link shows small spinner (brand-600, 16px) next to text
- Link disabled temporarily

**Resend success state**
- Toast notification appears at top: "Verification email sent"
- Toast background: success color (#1A7A4A)
- Toast text: white, 13px
- Toast auto-dismisses after 3 seconds

**Resend error state**
- Toast notification appears at top: "Please wait 60 seconds before resending"
- Toast background: warning color (#B45309)
- Toast text: white, 13px
- Toast auto-dismisses after 3 seconds

### Mobile-specific notes

- No keyboard interaction required
- All links have minimum 44×44px touch target
- Email display box: tap to copy email to clipboard (optional enhancement)

---

## Screen 5 — Role Selection

**Route:** `/onboarding/role`  
**Purpose:** User selects their primary role (Parent, Player, or Coach)  
**Accessed from:** Email verification link (first-time users) or social auth callback  
**Goes to:** Onboarding Step 1 (sport selection) or player age gate if Player selected

### Layout

- Full viewport height
- Max content width: 480px
- Horizontal padding: space-4 (16px) mobile, space-6 (24px) desktop
- Vertical padding: space-8 (32px) from top
- Background: neutral-50 (#F0F7FF)

### Components (top to bottom)

**Progress indicator**
- Text: "Step 1 of 3"
- Font: text-xs (11px), weight 500, neutral-400, uppercase, 0.5px spacing
- Positioned top left
- Margin bottom: space-6 (24px)

**Heading**
- Text: "How will you use Crikly?"
- Font: text-2xl (24px), weight 600, neutral-900
- Margin bottom: space-2 (8px)

**Subheading**
- Text: "You can add more roles from your account later"
- Font: text-base (15px), weight 400, neutral-600
- Margin bottom: space-8 (32px)

**Role option 1 — Parent**
- Card container:
  - Background: white
  - Border: 2px solid neutral-100 (default) / brand-600 (selected)
  - Border radius: radius-lg (14px)
  - Padding: space-5 (20px)
  - Margin bottom: space-4 (16px)
  - Cursor: pointer
  - Tap: selects this role
- Icon: 👨‍👩‍👧 (parent emoji) or parent icon
  - Size: 32px
  - Margin bottom: space-3 (12px)
- Role name: "I'm a parent"
  - Font: text-lg (17px), weight 500, neutral-900
  - Margin bottom: space-2 (8px)
- Description: "Book sessions for my child"
  - Font: text-sm (13px), neutral-600

**Role option 2 — Player**
- Same card styling as Parent
- Icon: 🏏 (cricket emoji) or player icon
- Role name: "I'm a player"
- Description: "Book coaching for myself (16+)"
- Margin bottom: space-4 (16px)

**Role option 3 — Coach**
- Same card styling as Parent
- Icon: 👕 (shirt emoji) or coach icon
- Role name: "I'm a coach"
- Description: "Offer sessions and get paid reliably"
- Margin bottom: space-4 (16px)

**Age requirement note**
- Text: "Must be 16 or older to register as a player"
- Font: text-xs (11px), neutral-400, centered
- Margin bottom: space-8 (32px)

**Primary CTA button**
- Text: "Continue"
- Background: brand-600 (#0077CC)
- Text: white, 15px, weight 500
- Height: 52px mobile / 44px desktop
- Border radius: radius-md (10px)
- Width: 100%
- Disabled state: opacity 0.4, cursor not-allowed (when no role selected)

### States

**Default state**
- No role selected
- All cards have neutral-100 border
- CTA button disabled (opacity 0.4)

**Role selected state**
- Selected card has brand-600 border (2px)
- Selected card background: brand-50 (#E6F3FB) (optional subtle highlight)
- Other cards remain neutral-100 border
- CTA button enabled (full opacity)

**Loading state** (after CTA tap)
- CTA button shows spinner (white, 20px)
- Button text hidden
- Button disabled
- All role cards disabled (opacity 0.6)

**Success state**
- Immediate redirect to next onboarding step
- If Player selected: redirect to age verification screen first
- If Parent/Coach selected: redirect to `/onboarding/sport`

### Mobile-specific notes

- Each role card: minimum 44px height for touch target
- Cards have active state: scale(0.98) on tap
- No keyboard interaction required
- Single-select only (radio button behavior)
- Selected state persists if user navigates back

---

## Cross-Screen Design Rules

### Consistent elements across all auth screens

**Logo**
- Always "crik" + "ly" format
- "ly" always in brand-600 (#0077CC)
- Always centered
- Always 32px, weight 700

**Input focus states**
- Border: brand-600 (#0077CC)
- Shadow: 0 0 0 3px rgba(0,119,204,0.25)
- Transition: 160ms ease-out

**Button hover states** (desktop only)
- Primary: background darkens to brand-800 (#0C447C)
- Secondary: background brand-50 (#E6F3FB)
- Transition: 160ms ease-out

**Button active states** (all devices)
- Transform: scale(0.98)
- Transition: 100ms ease-out

**Error message styling**
- Font: text-sm (13px), danger color (#B91C1C)
- Icon: ⚠️ or error icon (16px) to left of text
- Margin top: space-2 (8px) from related input

**Loading spinners**
- Size: 20px (buttons), 16px (inline)
- Color: white (on colored backgrounds), brand-600 (on white)
- Animation: 1s linear infinite rotation

### Accessibility requirements

- All inputs have visible labels (not placeholder-only)
- All buttons have minimum 44×44px touch target
- All interactive elements keyboard accessible
- Tab order follows visual order
- Focus indicators always visible (never outline: none)
- Error messages announced to screen readers
- All icons have aria-label or sr-only text

### Responsive behavior

**Mobile (< 768px)**
- Full width inputs and buttons
- Padding: space-4 (16px)
- Button height: 52px
- Input height: 52px

**Desktop (≥ 768px)**
- Max content width: 400px (auth forms) / 480px (role selection)
- Padding: space-6 (24px)
- Button height: 44px
- Input height: 44px
- Hover states enabled

### Animation timing

- Screen transitions: 280ms ease-in-out
- Button press: 100ms ease-out
- Input focus: 160ms ease-out
- Toast appear/dismiss: 200ms ease-out

---

*Crikly Auth Screen Specifications v1.0 — March 2026*  
*Complete specification for tasks A-08, A-09, A-10, A-11, A-12*  
*No design decisions required — build exactly as specified*
