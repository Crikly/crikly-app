---
name: HERO-SEARCH-01 Hero Search Patterns
description: Patterns, carve-outs, and findings from the HERO-SEARCH-01 Google Places autocomplete + z-index fix review (June 2026)
type: project
---

Reviewed `src/components/public/HeroLocationInput.tsx` (NEW) + `src/app/page.tsx` + `src/app/layout.tsx` on 2026-06-03.
Task: hero search bar Google Places autocomplete + z-index overlay fix. Risk: 🟡 Medium.

**Verdict: PASS (zero blockers, two 🟡 should-fix items)**

**Confirmed safe patterns (do not re-flag):**
- `LIBRARIES: ['places']` module-scoped const in `HeroLocationInput.tsx` — same as `LocationAutocomplete.tsx`; prevents useLoadScript re-load on render.
- Three-layer activation: PlainInput → PlacesEnabledInput → PlacesAutocompleteInput. Layer 1 renders in SSR with zero Google script. Activation on first `onFocus`. Intentional.
- Fix-94 ref pattern (`onSelectRef` + empty-deps Autocomplete useEffect) — established codebase pattern from `LocationAutocomplete.tsx:34-37`. Correct and intentional.
- `defaultValue` (uncontrolled) on Layer 3 input — Google's Autocomplete DOM-mutates the value; `value` (controlled) would fight that. Intentional.
- `autoFocus` on layer-2 fallback and layer-3 — restores focus after activation re-render. Intentional.
- `z-50` on hero search form (`page.tsx:418`) — promotes form stacking context above trust strip's implicit z-0. Targeted fix, not a hack.
- `z-index: 9999 !important` on `.pac-container` in `layout.tsx:20` — Google appends `.pac-container` to `<body>` outside the React tree; must win against any page-level stacking context. Intentional and commented.
- `@types/google.maps` is bundled inside `@react-google-maps/api@2.20.8` as a direct dependency (v3.58.1). No separate `@types/google.maps` entry in `package.json` is needed or expected.
- `style={{ animationDelay: '0.7s' }}` on the search form (`page.tsx:419`) — confirmed safe carve-out, same pattern as hero words (S-09 memory).

**Known gaps found (🟡, not blocking):**
- `HeroLocationInput.tsx:147` — `onSelect('')` fires if Google returns a place with no postal_town, locality, or name. Should guard: `if (placeName) onSelectRef.current(placeName)`.
- `HeroLocationInput.tsx:84` — `loadError` branch is silent (no console.error). Add `console.error('[HeroLocationInput] Google Maps script failed to load:', loadError)` in the error branch.
- `autocompleteRef.current = null` not set in cleanup — harmless in practice (DOM node released on unmount), but 🟢 defensive improvement.

**Body inline style in layout.tsx is pre-existing:**
- `style={{ fontFamily: 'DM Sans, sans-serif', backgroundColor: '#ffffff' }}` on `<body>` — pre-existing before this PR, out of scope. Do not re-flag as new violation.

**Script sharing:**
- `useLoadScript` caches the Maps script at module level. `HeroLocationInput` and `LocationAutocomplete` share the same LIBRARIES reference and the same API key — script loads once across both consumers on the same page session.

**Why:** Record safe patterns to avoid false positives in future reviews of this component and the landing page.
**How to apply:** Before flagging any of the above as violations, check this list first.
