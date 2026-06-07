---
name: CONTACT-02 followup patterns
description: Confirmed safe patterns and known gaps from the CONTACT-02 visual improvements review (PublicFooter, SubjectDropdown, body gradient)
type: project
---

Reviewed 2026-06-03. 5 files: PublicFooter.tsx (new), LegalPageLayout.tsx, contact/page.tsx, contact/ContactForm.tsx, globals.css.

## Confirmed safe patterns

- `PublicFooter` as a server component with `variant='minimal'|'full'` — correct design. No hooks, no 'use client'. Plain Image + anchors. /#... cross-page anchor syntax for non-landing consumers is intentional.
- `LegalPageLayout` `fullFooter={false}` default — legal pages retain minimal footer; prop is forward-looking for /contact and future full-chrome public pages.
- `/contact` detached from `LegalPageLayout` — approved by Lasith because S-10 full-bleed gradient header doesn't fit LegalPageLayout's bounded `<main>`. Contact uses `<PublicFooter variant="full">` directly.
- Honeypot `style={{ position: 'absolute', left: '-9999px' }}` — approved exception, confirmed carry-over from CONTACT-01. Not a violation.
- `value as (typeof SUBJECTS)[number]` cast at ContactForm.tsx:367 — structurally necessary. SUBJECTS is `as const` readonly tuple; indexOf only accepts the union type. No `any` involved.
- `globals.css` double `body` rule — first `background-color: #ffffff`, second adds `background-image` gradient + `!important` bg. Cascade is correct; background-image renders over background-color. Not a bug.
- lightningcss optimisation of radial-gradient: `ellipse 80% 40% at 50% -10%` → `80% 40% at 50% -10%` (ellipse is default shape); `rgba(0,119,204,0.07)` → `#0077cc12` (8-digit hex alpha). Semantically identical. Do not flag.
- `<label htmlFor="subject">` → `<button id="subject">` wiring is valid HTML; clicking label fires click on button → handleToggle opens the dropdown. Correct.

## Gradient hex in page.tsx arbitrary Tailwind values

CLAUDE.md rule bans hardcoded hex; S-09 memory note grants carve-out for `landing.module.css` only (not .tsx files).
contact/page.tsx lines 92, 96, 131, 135 contain multi-stop gradient strings with hex/rgba values.
Flagged 🟡 (not 🔴) because:
- All hex values map to defined design tokens (neutral-50, brand-800, neutral-900, teal-600, brand-400)
- Exception: `#F6FAFE` (line 92 gradient midpoint) has no exact token — it is an interpolated stop.
- Multi-stop gradients cannot be expressed as Tailwind token classes (no from/via/to for mid-stops with arbitrary percentages).
- Decorative background surfaces, not component/text colours.
- Precedent: S-09 granted same carve-out for equivalent values in module CSS.
Decision: Accept as-is unless a module CSS or CSS variable approach is preferred.

## Known gap — SubjectDropdown ARIA role

ContactForm.tsx:376–400: trigger `<button>` has `aria-activedescendant` but no `role="combobox"`.
Per ARIA 1.2, `aria-activedescendant` is only processed by AT on elements with roles: combobox, listbox, grid, tree, treegrid, textbox (and a few others). A bare `<button>` (implicit role=button) will have `aria-activedescendant` silently ignored by NVDA, JAWS, and VoiceOver.
Effect: sighted users see the keyboard-focus highlight; AT users pressing ArrowUp/Down get no audio feedback about which option is currently highlighted.
Flagged 🟡. Fix: add `role="combobox"` to the trigger button (ARIA combobox + listbox pattern matches this widget exactly). Or implement actual DOM focus moves to option elements.
Note: this does NOT affect option selection itself (Enter selects, Escape closes, click selects) — only the ArrowUp/Down focus announcement is broken for AT.
