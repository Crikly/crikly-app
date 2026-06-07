---
name: fix/* branch BUILD_PLAN exemption — when check 12 does not apply
description: Bug-fix sub-tasks with no BUILD_PLAN line item are exempt from check 12; task ID format is FIX-*, BUG-*, or DEBUG-*, not a step/task ID like CD-04
type: feedback
---

Check 12 (docs/10_BUILD_PLAN.md updated in same commit) has a known exemption:
infrastructure sub-tasks and bug fixes that have no corresponding line item in
`docs/10_BUILD_PLAN.md`. These are identified by task IDs of the form `FIX-*`,
`BUG-*`, or `DEBUG-*` rather than the standard step-task format (`CD-04`, `MS-09`, etc.).

Confirmed patterns as of 2026-05-22:
- FIX-* and DEBUG-* — infrastructure/micro-fixes (e.g. FIX-THEME-BRAND-TOKENS)
- BUG-* — reactive bug fixes tracked in Notion Bug & Fix Log (e.g. BUG-STRIPE-ONBOARDING-COMPLETE-WIRING)
  The BUG-STRIPE commit also confirmed that Stripe webhook tasks on develop direct (no feature branch)
  are accepted per Lasith's brief when the fix is targeted and pre-reviewed.

**Why:** The BUILD_PLAN tracks product features and build steps. Reactive bug fixes
and infrastructure repairs are tracked in Notion's Bug & Fix Log, not in BUILD_PLAN.
The separate-sync pattern (Notion update as a standalone follow-up) is also accepted
for BUG-* tasks, matching the precedent set for SCHEDULE-PROG-SESSIONS.

**How to apply:** If the task ID is `FIX-*`, `BUG-*`, or `DEBUG-*` and the invoker
explicitly states "no BUILD_PLAN line item" or "separate sync", accept the exemption.
If the task ID is a standard step task (CD-*, MS-*, CG-*, CF-*, etc.), check 12 is
mandatory with no exemption.
