# Crikly — Design System

**Version:** 1.0
**Last Updated:** March 2026
**Applies to:** Web PWA (Tailwind/Next.js) + Flutter Mobile (Phase 2)

Single source of truth for all visual decisions. Every colour, font,
size, and spacing value used in Crikly is defined here.
Read this file before building any UI component.

---

## Decisions Summary

| Decision | Choice |
|---|---|
| Core emotion | Trust |
| Theme | Adaptive — light default, dark mode supported |
| Primary colour | Sky Blue #0077CC |
| Secondary colour | Teal #0099AA |
| Typography | DM Sans |
| Navigation (mobile) | Bottom tab bar — role-specific |
| Navigation (desktop) | Left sidebar |
| Onboarding | Structured — 3 focused steps |
| Forms | One question at a time — everywhere |

---

## Colour Palette

### Primary — Sky Blue

| Token | Hex | Usage |
|---|---|---|
| brand-50 | #E6F3FB | Light backgrounds, badge fills |
| brand-100 | #B5D4F4 | Hover states, subtle borders |
| brand-400 | #378ADD | Secondary actions |
| brand-600 | #0077CC | Primary CTA, active states — main brand colour |
| brand-800 | #0C447C | Dark text on light blue backgrounds |
| brand-900 | #042C53 | Headings on coloured surfaces |

### Secondary — Teal (trust signals)

| Token | Hex | Usage |
|---|---|---|
| teal-50 | #E0F6F8 | Badge backgrounds |
| teal-600 | #0099AA | DBS badge, verified icons, success |
| teal-800 | #006677 | Text on teal backgrounds |

### Semantic Colours

| Token | Hex | Usage |
|---|---|---|
| success | #1A7A4A | Booking confirmed, payment success |
| warning | #B45309 | Cancellation window warning, expiry |
| danger | #B91C1C | Destructive actions, errors |
| info | #0077CC | Informational callouts |

### Neutral Scale

| Token | Light | Dark | Usage |
|---|---|---|---|
| neutral-0 | #FFFFFF | #0F0F0F | Page background |
| neutral-50 | #F0F7FF | #1A1A2E | Surface / card background |
| neutral-100 | #E2E8F0 | #252540 | Borders, dividers |
| neutral-400 | #94A3B8 | #64748B | Placeholder text, icons |
| neutral-600 | #475569 | #94A3B8 | Secondary text |
| neutral-900 | #0F172A | #F1F5F9 | Primary text |

---

## Typography

**Font family:** DM Sans
**Source:** @fontsource/dm-sans
**Weights:** 400 (regular), 500 (medium), 600 (semibold) only

### Type Scale

| Token | Size | Weight | Line height | Usage |
|---|---|---|---|---|
| text-xs | 11px | 400 | 1.4 | Captions, timestamps |
| text-sm | 13px | 400 | 1.5 | Secondary body, badges |
| text-base | 15px | 400 | 1.6 | Primary body text |
| text-lg | 17px | 500 | 1.4 | Card titles |
| text-xl | 20px | 500 | 1.3 | Section headings |
| text-2xl | 24px | 600 | 1.2 | Page titles, prices |
| text-3xl | 30px | 600 | 1.1 | Hero headings |

### Rules

- Sentence case always — never Title Case, never ALL CAPS
- No font size below 11px
- Letter spacing: -0.3px on headings (2xl+), 0 on body
- Paragraph max-width: 65ch

---

## Spacing Scale (base-4)

| Token | Value | Usage |
|---|---|---|
| space-1 | 4px | Icon internal padding |
| space-2 | 8px | Inline gaps |
| space-3 | 12px | Component internal padding |
| space-4 | 16px | Card padding, standard gaps |
| space-5 | 20px | Section padding |
| space-6 | 24px | Large gaps |
| space-8 | 32px | Screen padding top |
| space-12 | 48px | Major section breaks |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| radius-sm | 6px | Badges, chips |
| radius-md | 10px | Buttons, inputs |
| radius-lg | 14px | Cards, modals |
| radius-xl | 20px | Bottom sheets |
| radius-full | 9999px | Avatars, pills |

---

## Shadows

| Token | Value | Usage |
|---|---|---|
| shadow-none | none | Default |
| shadow-sm | 0 1px 3px rgba(0,0,0,0.08) | Floating cards |
| shadow-md | 0 4px 12px rgba(0,0,0,0.10) | Modals, sheets |
| shadow-focus | 0 0 0 3px rgba(0,119,204,0.25) | Input focus ring |

---

## Component Specs

### Buttons

**Primary**
- Background: #0077CC
- Text: white, 15px, weight 500
- Height: 52px mobile / 44px desktop
- Border radius: radius-md
- Padding: 0 24px
- States: hover #0C447C, active scale(0.98), disabled opacity 0.4

**Secondary**
- Background: transparent
- Border: 1.5px solid #0077CC
- Text: #0077CC, 15px, weight 500

**Destructive**
- Background: #B91C1C
- Text: white

**Ghost**
- Background: transparent, no border
- Text: neutral-600, 15px
- Tertiary actions only

### Inputs

- Height: 52px mobile / 44px desktop
- Background: neutral-50
- Border: 1px solid neutral-100
- Border radius: radius-md
- Font: 15px DM Sans, weight 400
- Placeholder: neutral-400
- Focus: border #0077CC, shadow-focus
- Error: border #B91C1C, error text below in 13px #B91C1C
- Label: 12px, weight 500, neutral-600, uppercase, 0.5px spacing

### Cards

- Background: white (light) / neutral-50 (dark)
- Border: 0.5px solid neutral-100
- Border radius: radius-lg
- Padding: space-4 (16px)
- No shadows on standard cards

### Badges

| Type | Background | Text | Usage |
|---|---|---|---|
| DBS verified | #E0F6F8 | #006677 | Coach verification |
| Premium | #E6F3FB | #0C447C | Premium tier |
| Confirmed | success-10 | #1A7A4A | Confirmed bookings |
| Cancelled | #FEE2E2 | #B91C1C | Cancelled bookings |

All badges: 11px, weight 500, radius-sm, padding 3px 8px.

### Avatars

- Sizes: 28px (lists) / 44px (cards) / 80px (profiles)
- Shape: radius-full (circle)
- Fallback: initials on brand-50, brand-800 text

### Bottom Sheets (mobile)

- Background: white / neutral-50 dark
- Border radius: radius-xl top corners only
- Handle: 32px wide, 4px tall, neutral-100, centred, 8px from top
- Shadow: shadow-md
- Dismiss: swipe down or tap overlay

---

## Dark Mode

- Light is default, dark follows system preference
- No hardcoded hex in components — always use tokens
- neutral-50 surface becomes #1A1A2E in dark (deep navy, not black)
- Shadows: increase opacity by 1.5× in dark mode

---

## Animation & Motion

| Action | Duration | Easing |
|---|---|---|
| Screen transitions | 280ms | ease-in-out |
| Bottom sheet | 320ms | spring(0.4, 0, 0.2, 1) |
| Button press | 100ms | ease-out |
| Skeleton pulse | 1400ms | ease-in-out infinite |
| Toast | 200ms | ease-out |
| Page fade in | 160ms | ease-out |

Reduce motion: all animations disabled when
prefers-reduced-motion: reduce.

---

## Tailwind Token Reference

All tokens implemented in tailwind.config.ts (DS-03).
brand-{50|100|400|600|800|900}
teal-{50|600|800}
neutral-{0|50|100|400|600|900}
text-{xs|sm|base|lg|xl|2xl|3xl}
space-{1|2|3|4|5|6|8|12}
radius-{sm|md|lg|xl|full}
shadow-{none|sm|md|focus}

---

*Crikly Design System v1.0 — March 2026*
*Read this before building any component.*
*All values are final unless explicitly updated here.*
