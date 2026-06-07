---
name: S-09 Landing Page Patterns
description: Patterns, carve-outs, and confirmed-safe choices from the S-09 Homepage Redesign review (May 2026)
type: project
---

Reviewed `src/app/page.tsx` + `src/app/landing.module.css` on 2026-05-31.
Feature branch: `feature/landing-redesign`. Task is pure marketing page, 🟡 risk.

**Three blockers found — all same root: inline `style={{...}}`:**
- `page.tsx:353` — `style={{ letterSpacing: '-0.035em' }}` duplicates `.heroH1` in module CSS. Fix: delete the prop.
- `page.tsx:647–650` — How-it-works connector gradient in inline style. Fix: new `.stepConnector` class in `landing.module.css`.
- `page.tsx:939` — Live activity card box-shadow in inline style. Fix: new `.liveCardShadow` class in `landing.module.css`.

**Confirmed safe patterns (not false positives in future reviews):**
- `style={{ animationDelay: '...' }}` on hero words/proof cards — dynamic value, cannot be static Tailwind class. Intentional per brief.
- `★` unicode (U+2605) in proof cards and coach cards — typographic rating symbol, not an emoji. Acceptable per brief carve-out.
- `#0c447c` and `#0f172a` in `landing.module.css` gradient classes — these equal `brand-800` and `neutral-900` tokens; in module CSS for complex gradients (brief-sanctioned). Not a violation but will drift if palette changes.
- "See all coaches" as pure `<button onClick>` with no `<Link>` — explicitly acknowledged in Lasith's brief as acceptable deviation from the CTA nav-to-login rule.
- Coach card `<article onClick>` without a `<Link>` wrapper — same brief carve-out as above.
- `.heroScrim` class in module CSS never referenced in `page.tsx` — dead CSS, likely a holdover from a full-bleed layout variant. Not a blocker.
- `handleSearch` without `useCallback` — functional correctness issue only; form is not a pure child component. Filed as 🟡.
- `cookie_consent` key is `'crikly_cookie_consent'` — confirmed per brief. Do not flag as wrong key in future reviews.
- Inline `style` for `animationDelay` on `proofIn` cards (lines 476, 490) — same carve-out as hero words.

**Token coverage:**
- `brand-800`, `brand-100`, `teal-800`, `teal-600`, `teal-50` all confirmed defined in `tailwind.config.js`. Not false positives.
- `text-amber-700` uses Tailwind default amber scale (no override) — correct token usage, not a hex violation.

**CTA contract for this page:**
- "Log in" nav link → bare `<Link href="/login">` — NO toast. Intentional.
- Every other user CTA → `<Link href="/login" onClick={handleCta}>` — fires toast + navigates.
- Activity menu (live) → toast with specific message `'Cricket is live across the UK.'` — acceptable variation per brief.
- Activity menu (soon) → toast `'{name} is on the way — cricket is live today.'` — acceptable variation per brief.
- "See all coaches" + coach card click → toast only, no navigation — brief-sanctioned deviation.
- Cookie buttons, footer hash links, footer legal `href="#"` — no toast, no navigation. Correct.

**Why:** Avoid re-flagging confirmed acceptable patterns in future reviews of this file.
**How to apply:** Check this list before flagging inline animationDelay, unicode ★, pure-button CTAs, or module CSS gradient hex values as violations.
