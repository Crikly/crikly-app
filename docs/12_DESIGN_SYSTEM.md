# Crikly — Design System

**Version:** 1.3
**Last Updated:** 31 May 2026
**Changed:** v1.3 (CF-DESIGN-SYS-RECONCILE) — locked 4 decisions: h1 canonical is `text-[28px] font-bold tracking-tight text-gray-900` (was text-2xl/24px/600); card border radius is 14px (was 12px in the Cards block — reconciled with the Border Radius table); primary button hover is brand-700 #0066AA (was brand-800 #0C447C); added Programme badge row (purple). v1.2 (BUG-GO-LIVE-PATH) — added 🎉 celebration emoji exception for one-off success modals (Go Live, first booking, milestones; H1 only, never in nav/labels/buttons/chrome). v1.1 (April 2026) — Card rules, layout backgrounds, interaction patterns, onboarding patterns, no-emoji rule.
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
| text-2xl | 24px | 600 | 1.2 | Prices, hero stats |
| text-3xl | 30px | 600 | 1.1 | Hero headings |

### Rules

- Sentence case always — never Title Case, never ALL CAPS
- No font size below 11px
- Letter spacing: -0.3px on headings (2xl+), 0 on body
- Paragraph max-width: 65ch

### Page titles (h1) — locked canonical

All screen-level page titles use exactly:

```
text-[28px] font-bold tracking-tight text-gray-900
```

- Mobile and desktop identical — no responsive scaling
- Overrides the `text-2xl` token specifically for `<h1>` elements
- Weight 700 (bold), NOT weight 600 (semibold)
- Size 28px (arbitrary value), NOT the 24px `text-2xl` token
- Applies to every coach, parent, player, and admin screen

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
- States: hover #0066AA (brand-700), active scale(0.98), disabled opacity 0.4

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

**Standard card (all screens):**
- Background: white (#FFFFFF) — always explicit white
- Border: NONE — no outer border on any card
- Border radius: 14px (matches `radius-lg` token — use `rounded-lg`)
- Padding: 12px–16px depending on screen density
- Shadow resting: 0 1px 3px rgba(0,0,0,0.06)
- Shadow hover: 0 2px 8px rgba(0,0,0,0.08)

**Card interaction states:**
- Resting: box-shadow 0 1px 3px rgba(0,0,0,0.06), scale(1)
- Hover: box-shadow 0 2px 8px rgba(0,0,0,0.08), scale(1.005)
- Active: scale(0.998)
- Transition: all 150ms ease
- Background does NOT change on hover — shadow + scale only
- Action rows inside cards do NOT inherit card hover state

**Non-negotiable rules:**
- NO border on any card — not even 0.5px
- NO background colour change on card hover
- NO left border accents on cards
- Selected state exception: 1.5px solid #0077CC border ONLY
  for selectable option cards (sport chips, category tiles)

### Layout — Page Backgrounds

**Coach desktop shell columns:**
- Main content column: white (#FFFFFF)
- Right panel column: white (#FFFFFF)
- Left sidebar: white (#FFFFFF) with border-right 0.5px #F1F5F9
- Page background (behind everything): #F8F9FA

**Non-negotiable rules:**
- Background is set ONCE in src/app/coach/layout.tsx
- Individual screen component outer wrappers must have
  NO background class — bg-transparent or omit entirely
- Setting bg-white or bg-gray-50 on a screen component
  overrides the layout and creates visual inconsistency

### Icons and Emoji — Non-Negotiable Rule

**NO emoji characters anywhere in the coach UI.**
This includes: 🏅 🛡 ❤️ 👶 📍 📅 ★ and all others.

**Use instead:**
- Lucide React icons (already installed)
- Simple coloured icon containers (32px square,
  neutral-50 bg, radius 8px, text character or SVG)
- Text labels only

**Approved exceptions (only):**
- **👋** — wave emoji on the Dashboard greeting (already implemented).
- **🎉** — celebration emoji in one-off success modals only
  (Go Live, first booking, milestones). Sanctioned per
  BUG-GO-LIVE-PATH. Permitted in modal/page H1 headings ONLY,
  never in nav, labels, buttons, banners, or recurring UI chrome.
  One per modal max. Drop the emoji rather than using two.

---

## Interaction Patterns

**Quick action buttons (inside cards):**
- Secondary: bg-white, border 1px solid #E2E8F0,
  text #475569, 11px
  Hover: bg-#F9FAFB, border #CBD5E1 — 150ms ease
- Primary: bg-#0077CC, text white, 11px, font-weight 500
  Hover: bg-#0066AA — 150ms ease
- Border-radius: 6px. Padding: 6px 0. Flex: 1.

**Approve/Decline:** Approve = #0077CC always — never green.
Decline = white bg, red-200 border, red-600 text.

---

## Onboarding Patterns

**Step indicator (ALL onboarding screens — non-negotiable):**
- 5 dots in a flex row, gap 5px
- Active step: width 22px, radius 999px, bg #0077CC (pill)
- All other dots (past AND future): 8px circle, bg #E2E8F0
- NEVER use green (#22C55E) for completed steps
- NEVER change dot colour to indicate completion
- "Step X of 5" label: 11px, #94A3B8, below the dots

**Save bar pattern (steps 2–5):**
- display flex, justify-content space-between,
  align-items center
- padding: 16px 0, margin-top: 16px
- NO border-top on save bar
- NO sticky positioning on save bar
- NO background card or wrapper around the buttons
- Left: "← Back" ghost link (13px, #64748B)
  Navigates to previous step
- Right: "Save & continue →" pill
  bg-#0077CC, text white, radius 999px, padding 10px 22px,
  13px, font-weight 500

**Step 1 only:** right-aligned pill only — no back button.

**Qualifications step only (optional step):**
Three items: [← Back] [Skip for now] [Save & continue →]
Skip for now: 13px, #94A3B8, ghost, centred position.

No "Save & go back to dashboard" on any onboarding screen.
No "← Dashboard" link at top of any onboarding screen.

**PublicProfilePreview (right panel — ALL onboarding steps):**
- ALWAYS horizontal layout: avatar LEFT, name+role RIGHT
- NEVER centred or stacked layout
- Avatar: 44–56px circle, bg #E6F1FB, initials, text #0C447C
  ring: box-shadow 0 0 0 2px #E6F1FB
- Name: 14–15px, font-weight 500, #0F172A (updates live)
  Empty: "Your name" in #CBD5E1
- Role: 12px, #94A3B8, below name
- Below avatar row: stars (amber text chars, not emoji),
  rating text, location, days, price, DBS badge,
  "Book a session" pill button
- Extract into shared component PublicProfilePreview.tsx
- Reuse on ALL onboarding steps — never create new version

---

### Badges

| Type | Background | Text | Border | Usage |
|---|---|---|---|---|
| DBS verified | #E0F6F8 | #006677 | — | Coach verification |
| Premium | #E6F3FB | #0C447C | — | Premium tier |
| 1-on-1 | #E0F6F8 | #0099AA | — | Confirmed 1-on-1 bookings |
| Cancelled | #FEE2E2 | #B91C1C | — | Cancelled bookings |
| Programme | `bg-purple-50` | `text-purple-700` | `border-purple-200` | Programme events on Schedule grid (Tailwind purple-* palette — #FAF5FF / #7E22CE / #E9D5FF) |

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

*Crikly Design System v1.1 — April 2026*
*READ THIS FILE IN FULL before building any UI component.*
*Every decision in this file is non-negotiable.*
*v1.1: Card rules, layout backgrounds, interaction patterns, onboarding patterns, no-emoji rule, PublicProfilePreview spec*
