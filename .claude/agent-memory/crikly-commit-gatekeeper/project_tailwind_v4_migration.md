---
name: Tailwind v4 colour token migration status
description: Project uses Tailwind v4 but tailwind.config.js is in v3 JS-config format; colour tokens migrated to CSS vars in globals.css; non-colour tokens still pending
type: project
---

The project runs Tailwind v4 (`@import "tailwindcss"` + `@tailwindcss/postcss`).
`tailwind.config.js` is in v3 JS-config format. v4's compat layer was failing to honour
`theme.extend.colors`, causing all `bg-brand-*`, `text-brand-*`, `border-brand-*`
classes to resolve to `rgba(0,0,0,0)`. Diagnosed in DEBUG-TAILWIND-BRAND600.

Fix applied in FIX-THEME-BRAND-TOKENS (2026-05-11, branch fix/bug-go-live-path):
21 colour tokens registered as `--color-{name}` CSS variables inside the existing
`@theme inline` block in `src/app/globals.css` L44–73.

**Why:** v4-native registration form requires CSS variable declarations inside `@theme inline`.

**How to apply:** If `bg-brand-*` or any custom colour class appears broken (transparent),
verify the `--color-{name}` var exists in the `@theme inline` block in globals.css.
If a new colour token is added to `tailwind.config.js`, it MUST also be added to globals.css
inside `@theme inline` to work in v4.

Non-colour tokens (fontSize, spacing, heights, letterSpacing, boxShadow) are NOT yet
migrated. Follow-up task: FIX-THEME-NON-COLOR-TOKENS. Until then, `tailwind.config.js`
must remain intact for content paths and safelist.
