---
name: Project — PUB-03 auth shell redesign patterns
description: Confirmed safe patterns, one hydration concern, and one a11y gap from the PUB-03 auth shell + /join page review (2026-06-03)
type: project
---

**Task:** PUB-03 — pre-auth role chooser at /join, AuthSplitShell for /login+/register, AuthCenteredShell for /forgot-password, LoginForm redirectTo fix, landing CTA rewiring.

**Confirmed safe patterns (do NOT re-flag in future reviews):**

- `landing.module.css` cross-route import in `AuthSplitShell` — documented coupling in code comment. Intentional. Not a violation.
- `brightness-0 invert` Tailwind utility on logo for white-on-dark rendering — correct, not an inline style.
- `max-w-[400px]`, `max-w-[420px]`, `max-w-[480px]` arbitrary bracket values — sizing tokens, not colours. Fine.
- `text-[clamp(28px,3vw,40px)]` and similar clamp values — matches landing page pattern, no design token available for fluid type.
- `shadow-[0_8px_24px_rgba(0,0,0,0.18)]` in /join toast — arbitrary shadow with rgba(0,0,0,...), not a brand hex. Same convention as landing page. Not a violation.
- `← Back to log in` in forgot-password — U+2190 left arrow unicode, not an emoji. Fine.
- `★` in ProofCard (AuthSplitShell:111) — same carve-out as landing page S-09 patterns.
- `useRef<ReturnType<typeof setTimeout> | null>` in useToast — correct typed timer ref pattern. Do not flag.
- `/join` Suspense boundary with `<JoinPageBody initialExpanded={null}>` fallback — pattern is required by Next.js 15 for useSearchParams. The hydration concern is flagged below.
- LoginForm `(await res.json()) as { redirectTo?: string; error?: AuthError }` cast — explicit typed cast, no `any`. Correct replacement.
- `handleCta` + `CTA_TOAST_MSG` retained in page.tsx for coach rail fallback (mock COACHES) — intentional per brief. The 4 rewired CTAs correctly no longer call handleCta.
- `AuthSplitShell` and `AuthCenteredShell` have no `'use client'` — they are server components that receive client children via the `children` slot. Valid Next.js pattern.
- `(auth)/layout.tsx` passthrough (5-line `<main>` wrapper) — per-page shell is the approved pattern for the split-screen override requirement.

**CTA contract after PUB-03 (landing page):**
- Nav "Log in" → `/login` (bare Link, no toast) — unchanged
- Nav "Get started" → `/join` (bare Link, no toast) — rewired from `onClick={handleCta}`
- Personas "Find a coach for my child" → `/join?role=parent` — rewired
- Personas "Book a session for me" → `/join?role=player` — rewired
- Personas "Start coaching on Crikly" → `/login` — rewired (was `onClick={handleCta}`)
- Final CTA "Get your Crikly link" → `/login` — rewired
- Final CTA "I'm looking for a coach" → `/join` — rewired
- Coach rail mock fallback → `onClick={handleCta}` (toast only, no nav) — unchanged, intentional

**Known issue — hydration mismatch on /join deep-links (🟡):**
- Suspense fallback renders `<JoinPageBody initialExpanded={null}>` (all cards collapsed).
- With `?role=parent` or `?role=player`, the resolved component renders with the card expanded.
- Server SSR = fallback (collapsed). Client hydration = expanded. React will emit a hydration mismatch warning and repaint.
- Fix: pass `initialExpanded` from a `defaultValue` read without useSearchParams, or use `suppressHydrationWarning` on the card container + a useEffect-driven expand. Preferred fix: read params in a useEffect inside JoinPageBody itself rather than via Suspense/wrapper split.
- Lasith should confirm acceptance or request fix.

**Known issue — aria-controls missing target when collapsed (🟡):**
- `ExpandableRoleCard` button has `aria-controls="join-card-{role}-panel"` at all times.
- The `<form id="join-card-{role}-panel">` only mounts when `expanded === true`.
- When collapsed, aria-controls points to a non-existent DOM element — violates WAI-ARIA spec.
- Fix: always render the form panel in the DOM, use `hidden` or `aria-hidden` + `display:none` to suppress it visually when collapsed, OR only add `aria-controls` when `expanded` is true.

**gray-* vs neutral-* mixing:**
- `hover:text-gray-900` and `text-neutral-600` co-exist in shell chrome links — same pattern already present on landing page. Not a violation in this codebase, just minor scale inconsistency. Do not flag in future reviews.
