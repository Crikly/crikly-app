---
name: CF-R04 Design Token Audit Patterns
description: Patterns and exceptions discovered during the CF-R04 visual token audit (May 2026)
type: project
---

Completed the CF-R04 visual token audit in May 2026. Key findings to carry forward:

**Confirmed safe patterns (not false positives):**
- `console.error(...)` in catch blocks throughout coach components — intentional, not production logging
- `SERVICE_ROLE_KEY` in test/db fixtures — confirmed safe in prior review
- Inline `style={{ boxShadow: ... }}` on hover-scale card interactions — deliberate DOM-mutation pattern for micro-animations; left untouched in CF-R04 scope
- `style={{ background: '#FFFFFF', border: '1.5px dashed #B5D4F4' }}` in `AvailabilityManagement.tsx` lines 697–699, 867–871 — explicitly out-of-scope per Lasith STEP 1 Q4; structural rewrite needed
- Inline `e.currentTarget.style.background` mutations in `AvailabilityManagement.tsx` lines 702/705/873/876 — out-of-scope DOM mutation handlers
- SVG `stroke="#0077CC"` in `ProgrammesManagement.tsx:865` — Tailwind cannot reach SVG presentation attributes
- `style={{ fontFamily: "'DM Sans', sans-serif" }}` in multiple components — pre-existing redundancy, not introduced by CF-R04

**Recurring violation in CF-R04 (flag in future):**
- `text-[9px]` on compact UI chips/badges should be `text-[10px]` (design system minimum for chips). Found in `AvailabilityManagement.tsx:611` ("Ad hoc" badge) — missed by CF-R04 sweep; should have been kept or bumped to [10px], not left at [9px].

**Hardcoded hex colours that survived CF-R04 and are NOT in the out-of-scope list:**
- `text-[#85B7EB]` in `AvailabilityManagement.tsx:731` — light blue helper text on empty-day card; no matching token in the system
- `bg-[#FFFBEB]` / `border-l-[#F59E0B]` in `BookingsManagement.tsx` and `CoachHomeClient.tsx` — amber semantic hex, confirmed out-of-scope
- `bg-[#F8FAFC]`, `text-[#64748B]`, etc. in `ProgrammesManagement.tsx` detail modal — slate/surface hex, confirmed out-of-scope

**settings/page.tsx Toggle component:**
- Successfully migrated from inline `style={{ backgroundColor: ... }}` to `bg-brand-600 / bg-neutral-100` Tailwind classes
- Both classes are now in the safelist, so JIT is guaranteed — the inline-style comment was correctly updated to reflect this

**New brand-700 token:**
- Added correctly in both `globals.css` (line 50, `--color-brand-700: #0066AA`) and `tailwind.config.js` (line 44, `brand: { 700: '#0066AA' }`)
- Safelist entries added: `bg-brand-700`, `text-brand-700`, `hover:bg-brand-700`

**CF-R04f (2026-05-31) — status colour normalisation, 3 files, 14 edits:**
- `Schedule.tsx` confirmed case: blue-* → teal-50/teal-800/teal-600; SessionPopover default → teal-50/teal-800/teal-200. Neighbouring cases (programme=purple, pending=amber, no_show=orange, cancelled=red) untouched.
- `ProfileEdit.tsx` hover buttons: last two `hover:bg-brand-800` → `hover:bg-brand-700`. Go Live button (L427) and Done button (L695). All other classes preserved.
- `ProgrammesManagement.tsx` getStatusPillClass/getFillBarClass: hex → standard Tailwind tokens. Detail modal Active → green-100/green-800/green-700 dot; Draft → neutral-100/neutral-600. Full branch (`bg-brand-600 text-white`) intentionally unchanged per Lasith Q4 decision.
- SVG `stroke="#0077CC"` on `ProgrammesManagement.tsx:865` is still a surviving out-of-scope hex (SVG presentation attribute, Tailwind cannot reach it).
- `text-[#64748B]` in detail modal section headers (ProgrammesManagement.tsx L857) is still a surviving out-of-scope hex.

**Why:** Avoid re-flagging confirmed out-of-scope items as blockers in future token audit reviews.
**How to apply:** When reviewing styling in these files, check this list before flagging surviving hex values as new violations.
