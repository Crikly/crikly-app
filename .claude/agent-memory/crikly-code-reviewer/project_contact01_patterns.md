---
name: CONTACT-01 contact page patterns
description: Confirmed safe patterns and known gaps from the /contact page + API route review
type: project
---

## Confirmed safe / approved patterns

- `ContactBody` with all-`unknown` fields + `typeof` narrowing in route.ts — this is the correct strict-mode pattern, not a real `any` cast. Do not flag in future reviews.
- Honeypot `style={{ position: 'absolute', left: '-9999px' }}` on the wrapper div — approved exception to the no-inline-styles rule. The off-screen technique is intentional (display:none bots skip it). Lasith approved this at design-review.
- Lazy Resend instantiation: `process.env.RESEND_API_KEY ? new Resend(...) : null` returning clean 500 on missing env — established codebase pattern, matches `api/interest/route.ts`. Do not flag.
- `console.error('[POST /api/contact] ...')` in catch/error paths — correct usage per the rule.
- Public surface (`src/app/contact/`) using bespoke `inputClass()` helper and inline `<button>` instead of `src/components/ui/Input` + `src/components/ui/Button` — flagged as 🟡 (not 🔴). The public surface LegalPageLayout already uses bespoke typography helpers; the DS components use different visual styles (bg-neutral-50 vs bg-white, rounded-md vs rounded-[12px]). Precedent set — future reviews should also flag as 🟡 not 🔴.
- Subject enum duplicated between client `SUBJECTS` and server `VALID_SUBJECTS` — intentional drift-prevention (server doesn't trust client). Flag as 🟢 NICE TO HAVE (shared constants module) if at all.
- `escapeHtml` covers `&`, `<`, `>`, `"`, `'` — complete for HTML body injection prevention in email.
- Email subject line uses raw user input (no `escapeHtml`) — not an HTML injection vector in email subjects (plain text). Not a security issue.

## Known gaps flagged (not blockers)

- `ContactForm.tsx` `Field` component renders `<p id="${htmlFor}-error">` for errors but the `<input>` has no matching `aria-describedby`. Screen readers won't auto-associate error text with the field. Flagged as 🟡.
- `LegalPageLayout.tsx` footer has double `border-t` (outer `<footer>` + inner `<div>` both set `border-t border-neutral-100`). Pre-existing visual bug exposed by the file being in scope. Flagged as 🟡 pre-existing.
- `src/components/ui/Input` and `src/components/ui/Button` both exist; `ContactForm.tsx` rebuilds equivalent styling for the public surface. Flagged as 🟡.
