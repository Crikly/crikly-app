---
name: Design token audit pattern (CF-TOKEN-AUDIT)
description: Visual-only hex→token sweeps across coach internal screens use task ID CF-TOKEN-AUDIT; BUILD_PLAN row added to section 3D
type: project
---

Crikly has established a recurring pattern of design-token audit commits that sweep hardcoded hex values across coach internal screens and replace them with Tailwind tokens.

The first full audit shipped 2026-05-31 as commit bdb5de1 (`style(coach): replace hardcoded hex with design tokens + suppress dark mode (CF-R04)`), covering 11 coach files (~140 line edits). Task registered in BUILD_PLAN.md as `CF-TOKEN-AUDIT` under section 3D (Screen Review & Polish).

Key facts:
- `brand-700: '#0066AA'` added to tailwind.config.js and globals.css as of this commit (docs/09_WORKING_ETHICS.md previously listed it as a "KNOWN TOKEN GAP")
- Dark-mode suppression (`<meta name="color-scheme" content="light">`) added to `src/app/layout.tsx`
- Inline `e.currentTarget.style` DOM mutations in AvailabilityManagement.tsx are intentionally out of scope for style audits (noted as acceptable exceptions)
- SVG `stroke="#0077CC"` attributes and third-party overrides (pac-container) are also out of scope
- Tailwind `gray-*` utilities are canonical in this codebase — do not flag them as hex violations

**Why:** Platform-wide design consistency; eliminates arbitrary colour values that bypass the design system.

**How to apply:** When a future token-audit commit is proposed, expect CF-TOKEN-AUDIT or a numbered variant (CF-TOKEN-AUDIT-2, etc.) as the task ID. Check BUILD_PLAN.md section 3D for the row. The `brand-700` token now exists — any commit still using `bg-[#0066AA]` should be flagged.
