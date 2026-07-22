# Crikly — Design Workflow

**Version:** 1.0
**Last Updated:** April 2026
**Applies to:** All UI tasks C-01 through C-24 and beyond

## The Three-Tool Workflow

Figma Make → visual design reference (screenshot)
v0.dev → Next.js + Tailwind code generation
Windsurf → integration into the actual codebase

## Colour token mapping — always apply when integrating v0 code

| v0 hex | Tailwind token |
|---|---|
| #0077CC | brand-600 |
| #0C447C | brand-800 |
| #E6F3FB | brand-50 |
| #0099AA | teal-600 |
| #E0F6F8 | teal-50 |
| #0F172A | neutral-900 |
| #475569 | neutral-600 |
| #94A3B8 | neutral-400 |
| #E2E8F0 | neutral-100 |
| #F0F7FF | neutral-50 |
| #1A7A4A | success |
| #B91C1C | danger |
| #B45309 | warning |

## Coach screen file locations

src/app/(coach)/dashboard/page.tsx
src/app/(coach)/onboarding/profile/page.tsx
src/app/(coach)/onboarding/sport/page.tsx
src/app/(coach)/onboarding/qualifications/page.tsx
src/app/(coach)/onboarding/availability/page.tsx
src/app/(coach)/onboarding/blocked-dates/page.tsx
src/app/(coach)/onboarding/policy/page.tsx
src/app/(coach)/schedule/page.tsx
src/app/(coach)/bookings/page.tsx
src/app/(coach)/programmes/page.tsx
src/app/(coach)/earnings/page.tsx
src/app/(coach)/profile/page.tsx

## Windsurf rules for v0 integration

1. Never copy v0 code directly — adapt to Next.js App Router
2. Replace all hex colours with Tailwind tokens from table above
3. Replace hardcoded strings with real Supabase data
4. Add 'use client' only when hooks or browser APIs are used
5. Keep server components as default
6. Add TypeScript types — no any types
7. Implement all four states: loading, empty, error, success
8. Read docs/12_DESIGN_SYSTEM.md before writing any component
9. Every component traces to a REQ-C-xxx in docs/14_COACH_REQUIREMENTS.md

## Context files for every coach UI task

CLAUDE.md
docs/09_WORKING_ETHICS.md
docs/12_DESIGN_SYSTEM.md
docs/11_UX_PRINCIPLES.md
docs/14_COACH_REQUIREMENTS.md (relevant section only)
docs/19_DESIGN_WORKFLOW.md

*Crikly Design Workflow v1.0 — April 2026*
