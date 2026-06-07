---
name: E2E test patterns — anti-patterns and conventions
description: Recurring patterns and anti-patterns from Playwright E2E test reviews (TEST-E2E-01, May 2026)
type: feedback
---

**.first().toHaveCount(0) is a vacuous assertion — always flag it**

`page.locator('[data-testid="foo"]').first()` chains `.first()` which narrows the locator to a single-element handle. Calling `.toHaveCount(0)` on that is never meaningful — count assertions must be applied to the raw collection locator:

```ts
// Wrong — always passes vacuously
await expect(page.locator('[data-testid="foo"]').first()).toHaveCount(0)

// Correct
await expect(page.locator('[data-testid="foo"]')).toHaveCount(0)
```

**Why:** Flagged in TEST-E2E-01 review at `e2e/p4-bookings.spec.ts:52`. The test claimed to assert an empty state but the assertion could never fail.

**How to apply:** Any time you see `.first()` (or `.last()`, `.nth()`) immediately before `toHaveCount()`, flag as Should Fix.

---

**Hard DELETE in E2E db helper violates soft-delete rule — use `.update({ deleted_at })` instead**

`db.ts` helpers that clean up test data must use soft-delete (`update({ deleted_at: new Date().toISOString() })`), not `.delete()`. The CLAUDE.md soft-delete rule applies to all tables, including in test fixture code that writes to the hosted dev DB.

Exception: the orphan-rollback pattern in API routes is Lasith-approved (see `project_sessions_db_patterns.md`) but that is not applicable here.

**Why:** Flagged in TEST-E2E-01 review at `e2e/fixtures/db.ts:88-96` (`deleteProgrammeByTitle`). Helper not yet called, caught pre-merge.

**How to apply:** Any E2E helper that cleans up rows by calling `.delete()` on a Crikly application table is a Should Fix unless the table is known to have no soft-delete column (e.g., `sports` reference data).

---

**console.info / console.error in seed scripts is acceptable — not a production path**

The CLAUDE.md rule banning `console.log` in production paths does not apply to `e2e/fixtures/seed.ts` or other CLI scripts run outside the Next.js app bundle. `console.info` for step progress and `console.error` for fatal exits are appropriate in seed scripts.

**Why:** Confirmed acceptable at TEST-E2E-01 review. False-positive risk if reviewing seed/fixture files.

---

**E2E db helpers in `e2e/fixtures/db.ts` use SERVICE_ROLE_KEY by design — not a security violation**

`db.ts` creates a Supabase admin client with `SUPABASE_SERVICE_ROLE_KEY`. This is intentional and correct: Playwright tests run in Node (not the browser bundle), and the helpers are used to verify server-side state that is not observable through the UI. The inline comment documents this. Do not flag as a blocker.

**Why:** Confirmed at TEST-E2E-01 review. Would be a blocker only if this module were imported into browser-side code.

---

**`requireEnv` is duplicated across `seed.ts` and `db.ts` with different error handling (exit vs throw)**

`seed.ts` uses `process.exit(1)` (appropriate for a CLI script); `db.ts` throws (appropriate for a module used inside test process). The divergence is intentional but undocumented. Flag as Should Fix when seen — suggest extraction to `e2e/fixtures/env.ts` or a clarifying comment explaining the intentional divergence.

---

**Hard DELETE on `availability_templates` in E2E fixture is acceptable — table has no `deleted_at` column**

`availability_templates` has no `deleted_at` column (confirmed in `docs/03_DATABASE_SCHEMA.md` §5.1). The soft-delete rule cannot apply to it. Hard DELETE (`.delete()`) in `cleanupTestSunBlock` is correct. Inline comment in `e2e/p1-availability.spec.ts` line 17 explicitly documents this. Do not flag as a violation.

**Why:** Confirmed TEST-E2E-02 review. The general soft-delete rule from TEST-E2E-01 has this carved-out exception.

**How to apply:** When reviewing `.delete()` calls in E2E fixtures, cross-check `docs/03_DATABASE_SCHEMA.md` to confirm the table has no `deleted_at` column before flagging. If the column is absent, hard DELETE is the only option.

---

**`label.toLowerCase().replace(' ', '-')` in data-testid template literals only replaces the first space — flag as Nice to Have if labels with multiple spaces are possible**

In `AvailabilityManagement.tsx` line 780, `label.toLowerCase().replace(' ', '-')` replaces only the first space (non-global String.replace). For the two current labels ("Start time" → `start-time`, "End time" → `end-time`) this is correct since each has exactly one space. Flag as Nice to Have if new labels with two or more spaces are added — suggest `.replace(/\s+/g, '-')` as a defensive fix.

**Why:** Caught TEST-E2E-02 review. Currently harmless but silently wrong if a third time label like "End of day time" were added.

---

**CI workflow: `npm run build` placed after browser install — marginally suboptimal but acceptable**

`.github/workflows/e2e.yml` runs: install deps → install browsers → **build** → seed → run tests. Build doesn't need browsers and a build failure could be caught one step earlier by moving build before browser install. However build correctness is already validated by `npx tsc --noEmit` in the pre-commit quality gate, so the CI ordering is acceptable. Do not flag as a blocker or Should Fix.

**Why:** Confirmed TEST-E2E-02 review. PR description also acknowledged this as "Marginal — current order is fine."
