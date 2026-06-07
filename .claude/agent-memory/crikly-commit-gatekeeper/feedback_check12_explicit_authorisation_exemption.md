---
name: Check 12 explicit-authorisation exemption pattern
description: Lasith sometimes defers BUILD_PLAN.md updates to a separate sync pass and explicitly authorises the commit without that file staged — this is not a gate failure.
type: feedback
---

Explicit authorisation from Lasith to skip the BUILD_PLAN.md update in a specific commit is a valid exemption for Check 12, provided Lasith states it clearly in the task brief ("same separate-sync pattern used for previous tasks this session" or similar).

**Why:** For multi-commit sessions where BUILD_PLAN.md is updated in a dedicated docs commit at the end of a build step, requiring it in every individual commit creates unnecessary noise. Lasith has established this as a deliberate pattern, not an oversight.

**How to apply:** When the task brief explicitly names this pattern, note the exemption in the gate output and proceed. Do not treat it as a failure. Do not demand the file be staged. Record the exemption in the gate output so the audit trail is clear.

First observed: TEST-E2E-01 commit, 2026-05-22.
Also applied: LEGAL-01 commit, 2026-06-03. Brief phrase used: "Notion sync: docs/10_BUILD_PLAN.md update is the user's responsibility post-commit per established workflow. Do NOT modify docs/10_BUILD_PLAN.md." — this phrasing is now a canonical trigger for the exemption.
